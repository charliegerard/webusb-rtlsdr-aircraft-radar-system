"use strict";

import { Decoder, UNIT_FEET, UNIT_METERS } from "./decoder.js";
import {
    msgLen,
    LONG_MSG_BITS as long_msg_bits,
    SHORT_MSG_BITS as short_msg_bits,
} from "./mode-s-msglen.js";

const PREAMBLE_US = 8;
const FULL_LEN = PREAMBLE_US + long_msg_bits;
const MAG_LUT = new Uint16Array(129 * 129);

// I/Q -> Magnitude lookup table başlatma
// 0-255 aralığını 360 ile ölçeklendirerek hassasiyeti koruyoruz.
for (let i = 0; i <= 128; i++) {
    for (let q = 0; q <= 128; q++) {
        MAG_LUT[i * 129 + q] = Math.round(Math.sqrt(i * i + q * q) * 360);
    }
}

export class Demodulator {
    static UNIT_FEET = UNIT_FEET;
    static UNIT_METERS = UNIT_METERS;

    constructor(opts = {}) {
        this._aggressive = opts.aggressive !== false;
        this._checkCrc = opts.checkCrc !== false; // Varsayılan true
        this._crcOnly = opts.crcOnly || false;
        this._mag = opts.mag || null;

        this._decoder = new Decoder(opts);
        
        // Reusable buffers (Performans için her seferinde allocate etmiyoruz)
        this._bitsBuffer = new Uint8Array(long_msg_bits);
        this._msgBuffer = new Uint8Array(long_msg_bits / 8);
        this._auxBuffer = new Uint16Array(long_msg_bits * 2);
    }

    process(data, size, onMsg) {
        if (!this._mag || this._mag.length < size / 2) {
            this._mag = new Uint16Array(size / 2);
        }

        this.computeMagnitudeVector(data, this._mag, size);
        this.detectMessage(this._mag, size / 2, onMsg);
    }

    computeMagnitudeVector(data, mag, size, signedInt = false) {
        for (let j = 0, iIdx = 0; j < size; j += 2, iIdx++) {
            let i, q;
            if (signedInt) {
                i = Math.abs(data.readInt8(j));
                q = Math.abs(data.readInt8(j + 1));
            } else {
                i = Math.abs(data[j] - 127);
                q = Math.abs(data[j + 1] - 127);
            }
            // Sınır kontrolü (128'den büyük gelme ihtimaline karşı)
            i = i > 128 ? 128 : i;
            q = q > 128 ? 128 : q;
            mag[iIdx] = MAG_LUT[i * 129 + q];
        }
    }

    detectMessage(mag, maglen, onMsg) {
        let useCorrection = false;
        const bits = this._bitsBuffer;
        const msg = this._msgBuffer;

        for (let j = 0; j < maglen - FULL_LEN * 2; j++) {
            let low, high, delta, errors = 0;
            let goodMessage = false;

            if (useCorrection) {
                // Yedek al ve faz düzeltmesi uygula
                this._auxBuffer.set(mag.subarray(j + PREAMBLE_US * 2, j + PREAMBLE_US * 2 + this._auxBuffer.length));
                if (j > 0 && this.detectOutOfPhase(mag, j)) {
                    this.applyPhaseCorrection(mag, j);
                }
            } else {
                // Preamble (Öncül) Kontrolü
                if (!this.isValidPreamble(mag, j)) continue;

                // Gürültü kontrolü
                high = (mag[j] + mag[j + 2] + mag[j + 7] + mag[j + 9]) / 6;
                if (mag[j + 4] >= high || mag[j + 5] >= high || 
                    mag[j + 11] >= high || mag[j + 12] >= high || 
                    mag[j + 13] >= high || mag[j + 14] >= high) {
                    continue;
                }
            }

            // Bitleri Çözme (Manchester Decoding)
            for (let i = 0; i < long_msg_bits * 2; i += 2) {
                low = mag[j + i + PREAMBLE_US * 2];
                high = mag[j + i + PREAMBLE_US * 2 + 1];
                delta = Math.abs(low - high);

                if (i > 0 && delta < 256) {
                    bits[i / 2] = bits[i / 2 - 1];
                } else if (low === high) {
                    bits[i / 2] = 2; // Hata
                    if (i < short_msg_bits * 2) errors++;
                } else {
                    bits[i / 2] = low > high ? 1 : 0;
                }
            }

            if (useCorrection) {
                // Orijinal veriyi geri yükle
                mag.set(this._auxBuffer, j + PREAMBLE_US * 2);
            }

            // Bitleri Byte'lara paketle
            for (let i = 0; i < long_msg_bits; i += 8) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    byte |= (bits[i + bit] << (7 - bit));
                }
                msg[i / 8] = byte;
            }

            const msgType = msg[0] >> 3;
            const currentMsgLen = msgLen(msgType) / 8;

            // Sinyal kalitesi testi (Average delta)
            let totalDelta = 0;
            for (let i = 0; i < currentMsgLen * 16; i += 2) {
                totalDelta += Math.abs(mag[j + i + 16] - mag[j + i + 17]);
            }
            
            if (totalDelta < (currentMsgLen * 10 * 255) / 4) {
                useCorrection = false;
                continue;
            }

            // Mesajı işle
            if (errors === 0 || (this._aggressive && errors < 3)) {
                const mm = this._decoder.parse(msg, this._crcOnly);

                if (mm.crcOk) {
                    j += (PREAMBLE_US + currentMsgLen * 8) * 2;
                    goodMessage = true;
                    if (useCorrection) mm.phaseCorrected = true;
                }

                if (mm.crcOk || !this._checkCrc) {
                    onMsg(mm);
                }
            }

            // Hata düzeltme ile tekrar dene
            if (!goodMessage && !useCorrection) {
                j--; 
                useCorrection = true;
            } else {
                useCorrection = false;
            }
        }
    }

    isValidPreamble(mag, j) {
        return (
            mag[j] > mag[j + 1] &&
            mag[j + 1] < mag[j + 2] &&
            mag[j + 2] > mag[j + 3] &&
            mag[j + 3] < mag[j] &&
            mag[j + 4] < mag[j] &&
            mag[j + 5] < mag[j] &&
            mag[j + 6] < mag[j] &&
            mag[j + 7] > mag[j + 8] &&
            mag[j + 8] < mag[j + 9] &&
            mag[j + 9] > mag[j + 6]
        );
    }

    detectOutOfPhase(mag, offset) {
        if (mag[offset + 3] > mag[offset + 2] / 3) return 1;
        if (mag[offset + 10] > mag[offset + 9] / 3) return 1;
        if (mag[offset + 6] > mag[offset + 7] / 3) return -1;
        if (mag[offset - 1] > mag[offset + 1] / 3) return -1;
        return 0;
    }

    applyPhaseCorrection(mag, offset) {
        for (let j = 16; j < (long_msg_bits - 1) * 2; j += 2) {
            if (mag[offset + j] > mag[offset + j + 1]) {
                mag[offset + j + 2] = (mag[offset + j + 2] * 5) >>> 2; // (x * 1.25)
            } else {
                mag[offset + j + 2] = (mag[offset + j + 2] * 4) / 5;   // (x * 0.8)
            }
        }
    }
}