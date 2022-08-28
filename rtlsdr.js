(function () { function r(e, n, t) { function o(i, f) { if (!n[i]) { if (!e[i]) { var c = "function" == typeof require && require; if (!f && c) return c(i, !0); if (u) return u(i, !0); var a = new Error("Cannot find module '" + i + "'"); throw a.code = "MODULE_NOT_FOUND", a } var p = n[i] = { exports: {} }; e[i][0].call(p.exports, function (r) { var n = e[i][1][r]; return o(n || r) }, p, p.exports, r, e, n, t) } return n[i].exports } for (var u = "function" == typeof require && require, i = 0; i < t.length; i++)o(t[i]); return o } return r })()({
  1: [function (require, module, exports) {
    window.RtlSdr = require('./lib/rtlsdr');

  }, { "./lib/rtlsdr": 5 }], 2: [function (require, module, exports) {
    // Copyright 2013 Google Inc. All rights reserved.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //     http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.

    var RtlCom = require('./rtlcom');

    var CMD = RtlCom.CMD;

    /**
     * Operations on the R820T tuner chip.
     * @param {RtlCom} com The RTL communications object.
     * @param {number} xtalFreq The frequency of the oscillator crystal.
     * @constructor
     */
    function R820T(com, xtalFreq) {

      /**
       * Initial values for registers 0x05-0x1f.
       */
      var REGISTERS = [0x83, 0x32, 0x75, 0xc0, 0x40, 0xd6, 0x6c, 0xf5, 0x63, 0x75,
        0x68, 0x6c, 0x83, 0x80, 0x00, 0x0f, 0x00, 0xc0, 0x30, 0x48,
        0xcc, 0x60, 0x00, 0x54, 0xae, 0x4a, 0xc0];

      /**
       * Configurations for the multiplexer in different frequency bands.
       */
      var MUX_CFGS = [
        [0, 0x08, 0x02, 0xdf],
        [50, 0x08, 0x02, 0xbe],
        [55, 0x08, 0x02, 0x8b],
        [60, 0x08, 0x02, 0x7b],
        [65, 0x08, 0x02, 0x69],
        [70, 0x08, 0x02, 0x58],
        [75, 0x00, 0x02, 0x44],
        [90, 0x00, 0x02, 0x34],
        [110, 0x00, 0x02, 0x24],
        [140, 0x00, 0x02, 0x14],
        [180, 0x00, 0x02, 0x13],
        [250, 0x00, 0x02, 0x11],
        [280, 0x00, 0x02, 0x00],
        [310, 0x00, 0x41, 0x00],
        [588, 0x00, 0x40, 0x00]
      ];

      /**
       * A bit mask to reverse the bits in a byte.
       */
      var BIT_REVS = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe,
        0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf];

      /**
       * Whether the PLL in the tuner is locked.
       */
      var hasPllLock = false;

      /**
       * Shadow registers 0x05-0x1f, for setting values using masks.
       */
      var shadowRegs;


      /**
       * Initializes the tuner.
       */
      async function init() {
        await initRegisters(REGISTERS);
        await initElectronics();
      }

      /**
       * Sets the tuner's frequency.
       * @param {number} freq The frequency to tune to.
       * @return {number} The actual tuned frequency.
       */
      async function setFrequency(freq) {
        await setMux(freq);
        // await setPll(freq);
        // CHANGED THIS
        const resultFreq = await setPll(freq);
        // console.log(resultFreq)
        return resultFreq;
      }

      /**
       * Stops the tuner.
       */
      async function close() {
        await writeEach([
          [0x06, 0xb1, 0xff],
          [0x05, 0xb3, 0xff],
          [0x07, 0x3a, 0xff],
          [0x08, 0x40, 0xff],
          [0x09, 0xc0, 0xff],
          [0x0a, 0x36, 0xff],
          [0x0c, 0x35, 0xff],
          [0x0f, 0x68, 0xff],
          [0x11, 0x03, 0xff],
          [0x17, 0xf4, 0xff],
          [0x19, 0x0c, 0xff]
        ]);
      }

      /**
       * Initializes all the components of the tuner.
       */
      async function initElectronics() {
        await writeEach([
          [0x0c, 0x00, 0x0f],
          [0x13, 49, 0x3f],
          [0x1d, 0x00, 0x38]
        ]);
        var filterCap = await calibrateFilter(true);
        await writeEach([
          [0x0a, 0x10 | filterCap, 0x1f],
          [0x0b, 0x6b, 0xef],
          [0x07, 0x00, 0x80],
          [0x06, 0x10, 0x30],
          [0x1e, 0x40, 0x60],
          [0x05, 0x00, 0x80],
          [0x1f, 0x00, 0x80],
          [0x0f, 0x00, 0x80],
          [0x19, 0x60, 0x60],
          [0x1d, 0xe5, 0xc7],
          [0x1c, 0x24, 0xf8],
          [0x0d, 0x53, 0xff],
          [0x0e, 0x75, 0xff],
          [0x05, 0x00, 0x60],
          [0x06, 0x00, 0x08],
          [0x11, 0x38, 0x08],
          [0x17, 0x30, 0x30],
          [0x0a, 0x40, 0x60],
          [0x1d, 0x00, 0x38],
          [0x1c, 0x00, 0x04],
          [0x06, 0x00, 0x40],
          [0x1a, 0x30, 0x30],
          [0x1d, 0x18, 0x38],
          [0x1c, 0x24, 0x04],
          [0x1e, 0x0d, 0x1f],
          [0x1a, 0x20, 0x30]
        ]);
      }

      /**
       * Sets the tuner to automatic gain.
       */
      async function setAutoGain() {
        await writeEach([
          [0x05, 0x00, 0x10],
          [0x07, 0x10, 0x10],
          [0x0c, 0x0b, 0x9f]
        ]);
      }

      /**
       * Sets the tuner's manual gain.
       * @param {number} gain The tuner's gain, in dB.
       */
      async function setManualGain(gain) {
        var step = 0;
        if (gain <= 15) {
          step = Math.round(1.36 + gain * (1.1118 + gain * (-0.0786 + gain * 0.0027)));
        } else {
          step = Math.round(1.2068 + gain * (0.6875 + gain * (-0.01011 + gain * 0.0001587)));
        }
        if (step < 0) {
          step = 0;
        } else if (step > 30) {
          step = 30;
        }
        var lnaValue = Math.floor(step / 2);
        var mixerValue = Math.floor((step - 1) / 2);
        await writeEach([
          [0x05, 0x10, 0x10],
          [0x07, 0x00, 0x10],
          [0x0c, 0x08, 0x9f],
          [0x05, lnaValue, 0x0f],
          [0x07, mixerValue, 0x0f]
        ]);
      }

      /**
       * Calibrates the filters.
       * @param {boolean} firstTry Whether this is the first try to calibrate.
       */
      async function calibrateFilter(firstTry) {
        await writeEach([
          [0x0b, 0x6b, 0x60],
          [0x0f, 0x04, 0x04],
          [0x10, 0x00, 0x03]
        ]);
        await setPll(56000000);
        if (!hasPllLock) {
          throw new Error("PLL not locked -- cannot tune to the selected frequency.");
          return;
        }
        await writeEach([
          [0x0b, 0x10, 0x10],
          [0x0b, 0x00, 0x10],
          [0x0f, 0x00, 0x04]
        ]);
        var data = await readRegBuffer(0x00, 5);
        var arr = new Uint8Array(data);
        var filterCap = arr[4] & 0x0f;
        if (filterCap == 0x0f) {
          filterCap = 0;
        }
        if (filterCap != 0 && firstTry) {
          return await calibrateFilter(false);
        } else {
          return (filterCap);
        }
      }

      /**
       * Sets the multiplexer's frequency.
       * @param {number} freq The frequency to set.
       */
      async function setMux(freq) {
        var freqMhz = freq / 1000000;
        for (var i = 0; i < MUX_CFGS.length - 1; ++i) {
          if (freqMhz < MUX_CFGS[i + 1][0]) {
            break;
          }
        }
        var cfg = MUX_CFGS[i];
        await writeEach([
          [0x17, cfg[1], 0x08],
          [0x1a, cfg[2], 0xc3],
          [0x1b, cfg[3], 0xff],
          [0x10, 0x00, 0x0b],
          [0x08, 0x00, 0x3f],
          [0x09, 0x00, 0x3f]
        ]);
      }

      /**
       * Sets the PLL's frequency.
       * @param {number} freq The frequency to set.
       */
      async function setPll(freq) {
        var pllRef = Math.floor(xtalFreq);
        await writeEach([
          [0x10, 0x00, 0x10],
          [0x1a, 0x00, 0x0c],
          [0x12, 0x80, 0xe0]
        ]);
        var divNum = Math.min(6, Math.floor(Math.log(1770000000 / freq) / Math.LN2));
        var mixDiv = 1 << (divNum + 1);
        var data = await readRegBuffer(0x00, 5);
        var arr = new Uint8Array(data);
        var vcoFineTune = (arr[4] & 0x30) >> 4;
        if (vcoFineTune > 2) {
          --divNum;
        } else if (vcoFineTune < 2) {
          ++divNum;
        }
        await writeRegMask(0x10, divNum << 5, 0xe0);
        var vcoFreq = freq * mixDiv;
        var nint = Math.floor(vcoFreq / (2 * pllRef));
        var vcoFra = vcoFreq % (2 * pllRef);
        if (nint > 63) {
          hasPllLock = false;
          return;
        }
        var ni = Math.floor((nint - 13) / 4);
        var si = (nint - 13) % 4;
        await writeEach([
          [0x14, ni + (si << 6), 0xff],
          [0x12, vcoFra == 0 ? 0x08 : 0x00, 0x08]
        ]);
        var sdm = Math.min(65535, Math.floor(32768 * vcoFra / pllRef));
        await writeEach([
          [0x16, sdm >> 8, 0xff],
          [0x15, sdm & 0xff, 0xff]
        ]);
        await getPllLock(true);
        await writeRegMask(0x1a, 0x08, 0x08);
        var actualFreq = 2 * pllRef * (nint + sdm / 65536) / mixDiv;
        return (actualFreq);
      }

      /**
       * Checks whether the PLL has achieved lock.
       * @param {boolean} firstTry Whether this is the first try to achieve lock.
       */
      async function getPllLock(firstTry) {
        var data = await readRegBuffer(0x00, 3);
        var arr = new Uint8Array(data);
        if (arr[2] & 0x40) {
          hasPllLock = true;
          return;
        }
        if (firstTry) {
          await writeRegMask(0x12, 0x60, 0xe0);
          return await getPllLock(false);
        } else {
          hasPllLock = false;
          return;
        }
      }

      /**
       * Sets the initial values of the 0x05-0x1f registers.
       * @param {Array.<number>} regs The values for the registers.
       */
      async function initRegisters(regs) {
        shadowRegs = new Uint8Array(regs);
        var cmds = [];
        for (var i = 0; i < regs.length; ++i) {
          cmds.push([CMD.I2CREG, 0x34, i + 5, regs[i]]);
        }
        await com.writeEach(cmds);
      }

      /**
       * Reads a series of registers into a buffer.
       * @param {number} addr The first register's address to read.
       * @param {number} length The number of registers to read.
       * @return {ArrayBuffer} An ArrayBuffer with the data.
       */
      async function readRegBuffer(addr, length) {
        var data = await com.i2c.readRegBuffer(0x34, addr, length);
        var buf = new Uint8Array(data);
        for (var i = 0; i < buf.length; ++i) {
          var b = buf[i];
          buf[i] = (BIT_REVS[b & 0xf] << 4) | BIT_REVS[b >> 4];
        }
        return (buf.buffer);
      }

      /**
       * Writes a masked value into a register.
       * @param {number} addr The address of the register to write into.
       * @param {number} value The value to write.
       * @param {number} mask A mask that specifies which bits to write.
       */
      async function writeRegMask(addr, value, mask) {
        var rc = shadowRegs[addr - 5];
        var val = (rc & ~mask) | (value & mask);
        shadowRegs[addr - 5] = val;
        await com.i2c.writeRegister(0x34, addr, val);
      }

      /**
       * Perform the write operations given in the array.
       * @param {Array.<Array.<number>>} array The operations.
       */
      async function writeEach(array) {
        for (var index = 0; index < array.length; index++) {
          var line = array[index];
          await writeRegMask(line[0], line[1], line[2]);
        }
      }

      return {
        init: init,
        setFrequency: setFrequency,
        setAutoGain: setAutoGain,
        setManualGain: setManualGain,
        close: close
      };
    }

    /**
     * Checks if the R820T tuner is present.
     * @param {RtlCom} com The RTL communications object.
     * @return {boolean} A boolean that tells whether the tuner is present.
     */
    R820T.check = async function (com) {
      var data = await com.i2c.readRegister(0x34, 0);
      return (data == 0x69);
    };

    module.exports = R820T;

  }, { "./rtlcom": 4 }], 3: [function (require, module, exports) {
    // Copyright 2013 Google Inc. All rights reserved.
    // Copyright 2018 Sandeep Mistry All rights reserved.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //     http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.

    var R820T = require('./r820t');
    var RtlCom = require('./rtlcom');

    var CMD = RtlCom.CMD;
    var BLOCK = RtlCom.BLOCK;
    var REG = RtlCom.REG;

    /**
     * Operations on the RTL2832U demodulator.
     * @param {ConnectionHandle} conn The USB connection handle.
     * @param {number} ppm The frequency correction factor, in parts per million.
     * @param {number=} opt_gain The optional gain in dB. If unspecified or null, sets auto gain.
     * @constructor
     */
    function RTL2832U(conn, ppm, opt_gain) {

      /**
       * Frequency of the oscillator crystal.
       */
      var XTAL_FREQ = 28800000;

      /**
       * Tuner intermediate frequency.
       */
      var IF_FREQ = 3570000;

      /**
       * The number of bytes for each sample.
       */
      var BYTES_PER_SAMPLE = 2;

      /**
       * Communications with the demodulator via USB.
       */
      var com = new RtlCom(conn);

      /**
       * The tuner used by the dongle.
       */
      var tuner;

      /**
       * Initialize the demodulator.
       */
      async function open() {
        await com.writeEach([
          [CMD.REG, BLOCK.USB, REG.SYSCTL, 0x09, 1],
          [CMD.REG, BLOCK.USB, REG.EPA_MAXPKT, 0x0200, 2],
          [CMD.REG, BLOCK.USB, REG.EPA_CTL, 0x0210, 2]
        ]);
        await com.iface.claim();
        await com.writeEach([
          [CMD.REG, BLOCK.SYS, REG.DEMOD_CTL_1, 0x22, 1],
          [CMD.REG, BLOCK.SYS, REG.DEMOD_CTL, 0xe8, 1],
          [CMD.DEMODREG, 1, 0x01, 0x14, 1],
          [CMD.DEMODREG, 1, 0x01, 0x10, 1],
          [CMD.DEMODREG, 1, 0x15, 0x00, 1],
          [CMD.DEMODREG, 1, 0x16, 0x0000, 2],
          [CMD.DEMODREG, 1, 0x16, 0x00, 1],
          [CMD.DEMODREG, 1, 0x17, 0x00, 1],
          [CMD.DEMODREG, 1, 0x18, 0x00, 1],
          [CMD.DEMODREG, 1, 0x19, 0x00, 1],
          [CMD.DEMODREG, 1, 0x1a, 0x00, 1],
          [CMD.DEMODREG, 1, 0x1b, 0x00, 1],
          [CMD.DEMODREG, 1, 0x1c, 0xca, 1],
          [CMD.DEMODREG, 1, 0x1d, 0xdc, 1],
          [CMD.DEMODREG, 1, 0x1e, 0xd7, 1],
          [CMD.DEMODREG, 1, 0x1f, 0xd8, 1],
          [CMD.DEMODREG, 1, 0x20, 0xe0, 1],
          [CMD.DEMODREG, 1, 0x21, 0xf2, 1],
          [CMD.DEMODREG, 1, 0x22, 0x0e, 1],
          [CMD.DEMODREG, 1, 0x23, 0x35, 1],
          [CMD.DEMODREG, 1, 0x24, 0x06, 1],
          [CMD.DEMODREG, 1, 0x25, 0x50, 1],
          [CMD.DEMODREG, 1, 0x26, 0x9c, 1],
          [CMD.DEMODREG, 1, 0x27, 0x0d, 1],
          [CMD.DEMODREG, 1, 0x28, 0x71, 1],
          [CMD.DEMODREG, 1, 0x29, 0x11, 1],
          [CMD.DEMODREG, 1, 0x2a, 0x14, 1],
          [CMD.DEMODREG, 1, 0x2b, 0x71, 1],
          [CMD.DEMODREG, 1, 0x2c, 0x74, 1],
          [CMD.DEMODREG, 1, 0x2d, 0x19, 1],
          [CMD.DEMODREG, 1, 0x2e, 0x41, 1],
          [CMD.DEMODREG, 1, 0x2f, 0xa5, 1],
          [CMD.DEMODREG, 0, 0x19, 0x05, 1],
          [CMD.DEMODREG, 1, 0x93, 0xf0, 1],
          [CMD.DEMODREG, 1, 0x94, 0x0f, 1],
          [CMD.DEMODREG, 1, 0x11, 0x00, 1],
          [CMD.DEMODREG, 1, 0x04, 0x00, 1],
          [CMD.DEMODREG, 0, 0x61, 0x60, 1],
          [CMD.DEMODREG, 0, 0x06, 0x80, 1],
          [CMD.DEMODREG, 1, 0xb1, 0x1b, 1],
          [CMD.DEMODREG, 0, 0x0d, 0x83, 1]
        ]);

        var xtalFreq = Math.floor(XTAL_FREQ * (1 + ppm / 1000000));
        await com.i2c.open();
        var found = await R820T.check(com);
        if (found) {
          tuner = new R820T(com, xtalFreq);
        }
        if (!tuner) {
          throw new Error('Sorry, your USB dongle has an unsupported tuner chip. ' +
            'Only the R820T chip is supported.');
          return;
        }
        var multiplier = -1 * Math.floor(IF_FREQ * (1 << 22) / xtalFreq);
        await com.writeEach([
          [CMD.DEMODREG, 1, 0xb1, 0x1a, 1],
          [CMD.DEMODREG, 0, 0x08, 0x4d, 1],
          [CMD.DEMODREG, 1, 0x19, (multiplier >> 16) & 0x3f, 1],
          [CMD.DEMODREG, 1, 0x1a, (multiplier >> 8) & 0xff, 1],
          [CMD.DEMODREG, 1, 0x1b, multiplier & 0xff, 1],
          [CMD.DEMODREG, 1, 0x15, 0x01, 1]
        ])
        await tuner.init();
        await setGain(opt_gain);
        await com.i2c.close();
      }

      /**
       * Sets the requested gain.
       * @param {number|null|undefined} gain The gain in dB, or null/undefined
       *     for automatic gain.
       */
      async function setGain(gain) {
        if (gain == null) {
          await tuner.setAutoGain();
        } else {
          await tuner.setManualGain(gain);
        }
      }

      /**
       * Set the sample rate.
       * @param {number} rate The sample rate, in samples/sec.
       * @return {number} The sample rate that was actually set as its first parameter.
       */
      async function setSampleRate(rate) {
        var ratio = Math.floor(XTAL_FREQ * (1 << 22) / rate);
        ratio &= 0x0ffffffc;
        var realRate = Math.floor(XTAL_FREQ * (1 << 22) / ratio);
        var ppmOffset = -1 * Math.floor(ppm * (1 << 24) / 1000000);
        await com.writeEach([
          [CMD.DEMODREG, 1, 0x9f, (ratio >> 16) & 0xffff, 2],
          [CMD.DEMODREG, 1, 0xa1, ratio & 0xffff, 2],
          [CMD.DEMODREG, 1, 0x3e, (ppmOffset >> 8) & 0x3f, 1],
          [CMD.DEMODREG, 1, 0x3f, ppmOffset & 0xff, 1]
        ]);
        await resetDemodulator();
        return realRate;
      }

      /**
       * Resets the demodulator.
       */
      async function resetDemodulator() {
        await com.writeEach([
          [CMD.DEMODREG, 1, 0x01, 0x14, 1],
          [CMD.DEMODREG, 1, 0x01, 0x10, 1]
        ]);
      }

      /**
       * Tunes the device to the given frequency.
       * @param {number} freq The frequency to tune to, in Hertz.
       * @return {number} The actual tuned frequency.
       */
      async function setCenterFrequency(freq) {
        await com.i2c.open();
        var actualFreq = await tuner.setFrequency(freq + IF_FREQ);
        await com.i2c.close();
        return (actualFreq - IF_FREQ);
      }

      /**
       * Resets the sample buffer. Call this before starting to read samples.
       */
      async function resetBuffer() {
        await com.writeEach([
          [CMD.REG, BLOCK.USB, REG.EPA_CTL, 0x0210, 2],
          [CMD.REG, BLOCK.USB, REG.EPA_CTL, 0x0000, 2]
        ]);
      }

      /**
       * Reads a block of samples off the device.
       * @param {number} length The number of samples to read.
       * @return {ArrayBuffer} An ArrayBuffer containing the read samples, which you
       *     can interpret as pairs of unsigned 8-bit integers; the first one is
       *     the sample's I value, and the second one is its Q value.
       */
      async function readSamples(length) {
        return await com.bulk.readBuffer(length * BYTES_PER_SAMPLE);
      }

      /**
       * Stops the demodulator.
       */
      async function close() {
        await com.i2c.open();
        await tuner.close();
        await com.i2c.close();
        await com.iface.release();
      }

      return {
        open: open,
        setSampleRate: setSampleRate,
        setCenterFrequency: setCenterFrequency,
        resetBuffer: resetBuffer,
        readSamples: readSamples,
        close: close
      };
    }

    module.exports = RTL2832U;

  }, { "./r820t": 2, "./rtlcom": 4 }], 4: [function (require, module, exports) {
    // Copyright 2013 Google Inc. All rights reserved.
    // Copyright 2018 Sandeep Mistry All rights reserved.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //     http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.

    /**
     * Low-level communications with the RTL2832U-based dongle.
     * @param {ConnectionHandle} conn The USB connection handle.
     * @constructor
     */
    function RtlCom(conn) {

      /**
       * Whether to log all USB transfers.
       */
      var VERBOSE = false;

      /**
       * Set in the control messages' index field for write operations.
       */
      var WRITE_FLAG = 0x10;

      /**
       * Writes a buffer into a dongle's register.
       * @param {number} block The register's block number.
       * @param {number} reg The register number.
       * @param {ArrayBuffer} buffer The buffer to write.
       */
      async function writeRegBuffer(block, reg, buffer) {
        await writeCtrlMsg(reg, block | WRITE_FLAG, buffer);
      }

      /**
       * Reads a buffer from a dongle's register.
       * @param {number} block The register's block number.
       * @param {number} reg The register number.
       * @param {number} length The length in bytes of the buffer to read.
       * @return {ArrayBuffer} The read buffer.
       */
      async function readRegBuffer(block, reg, length) {
        return await readCtrlMsg(reg, block, length);
      }

      /**
       * Writes a value into a dongle's register.
       * @param {number} block The register's block number.
       * @param {number} reg The register number.
       * @param {number} value The value to write.
       * @param {number} length The width in bytes of this value.
       */
      async function writeReg(block, reg, value, length) {
        await writeCtrlMsg(reg, block | WRITE_FLAG, numberToBuffer(value, length));
      }

      /**
       * Reads a value from a dongle's register.
       * @param {number} block The register's block number.
       * @param {number} reg The register number.
       * @param {number} length The width in bytes of the value to read.
       * @return {number} The decoded value.
       */
      async function readReg(block, reg, length) {
        return bufferToNumber(await readCtrlMsg(reg, block, length));
      }

      /**
       * Writes a masked value into a dongle's register.
       * @param {number} block The register's block number.
       * @param {number} reg The register number.
       * @param {number} value The value to write.
       * @param {number} mask The mask for the value to write.
       */
      async function writeRegMask(block, reg, value, mask) {
        if (mask == 0xff) {
          await writeReg(block, reg, value, 1);
        } else {
          var old = await readReg(block, reg, 1);
          value &= mask;
          old &= ~mask;
          value |= old;
          await writeReg(block, reg, value, 1);
        }
      }

      /**
       * Reads a value from a demodulator register.
       * @param {number} page The register page number.
       * @param {number} addr The register's address.
       * @return {number} The decoded value.
       */
      async function readDemodReg(page, addr) {
        return await readReg(page, (addr << 8) | 0x20, 1);
      }

      /**
       * Writes a value into a demodulator register.
       * @param {number} page The register page number.
       * @param {number} addr The register's address.
       * @param {number} value The value to write.
       * @param {number} len The width in bytes of this value.
       */
      async function writeDemodReg(page, addr, value, len) {
        await writeRegBuffer(page, (addr << 8) | 0x20, numberToBuffer(value, len, true));
        return await readDemodReg(0x0a, 0x01);
      }

      /**
       * Opens the I2C repeater.
       */
      async function openI2C() {
        await writeDemodReg(1, 1, 0x18, 1);
      }

      /**
       * Closes the I2C repeater.
       */
      async function closeI2C() {
        await writeDemodReg(1, 1, 0x10, 1);
      }

      /**
       * Reads a value from an I2C register.
       * @param {number} addr The device's address.
       * @param {number} reg The register number.
       */
      async function readI2CReg(addr, reg) {
        await writeRegBuffer(BLOCK.I2C, addr, new Uint8Array([reg]).buffer);
        return await readReg(BLOCK.I2C, addr, 1);
      }

      /**
       * Writes a value to an I2C register.
       * @param {number} addr The device's address.
       * @param {number} reg The register number.
       * @param {number} value The value to write.
       * @param {number} len The width in bytes of this value.
       */
      async function writeI2CReg(addr, reg, value) {
        await writeRegBuffer(BLOCK.I2C, addr, new Uint8Array([reg, value]).buffer);
      }

      /**
       * Reads a buffer from an I2C register.
       * @param {number} addr The device's address.
       * @param {number} reg The register number.
       * @param {number} len The number of bytes to read.
       */
      async function readI2CRegBuffer(addr, reg, len) {
        await writeRegBuffer(BLOCK.I2C, addr, new Uint8Array([reg]).buffer);
        return await readRegBuffer(BLOCK.I2C, addr, len);
      }

      /**
       * Writes a buffer to an I2C register.
       * @param {number} addr The device's address.
       * @param {number} reg The register number.
       * @param {ArrayBuffer} buffer The buffer to write.
       */
      async function writeI2CRegBuffer(addr, reg, buffer) {
        var data = new Uint8Array(buffer.byteLength + 1);
        data[0] = reg;
        data.set(new Uint8Array(buffer), 1);
        await writeRegBuffer(BLOCK.I2C, addr, data.buffer);
      }

      /**
       * Decodes a buffer as a little-endian number.
       * @param {ArrayBuffer} buffer The buffer to decode.
       * @return {number} The decoded number.
       */
      function bufferToNumber(buffer) {
        var len = buffer.byteLength;
        var dv = new DataView(buffer);
        if (len == 0) {
          return null;
        } else if (len == 1) {
          return dv.getUint8(0);
        } else if (len == 2) {
          return dv.getUint16(0, true);
        } else if (len == 4) {
          return dv.getUint32(0, true);
        }
        throw 'Cannot parse ' + len + '-byte number';
      }

      /**
       * Encodes a number into a buffer.
       * @param {number} value The number to encode.
       * @param {number} len The number of bytes to encode into.
       * @param {boolean=} opt_bigEndian Whether to use a big-endian encoding.
       */
      function numberToBuffer(value, len, opt_bigEndian) {
        var buffer = new ArrayBuffer(len);
        var dv = new DataView(buffer);
        if (len == 1) {
          dv.setUint8(0, value);
        } else if (len == 2) {
          dv.setUint16(0, value, !opt_bigEndian);
        } else if (len == 4) {
          dv.setUint32(0, value, !opt_bigEndian);
        } else {
          throw 'Cannot write ' + len + '-byte number';
        }
        return buffer;
      }

      /**
       * Sends a USB control message to read from the device.
       * @param {number} value The value field of the control message.
       * @param {number} index The index field of the control message.
       * @param {number} length The number of bytes to read.
       */
      async function readCtrlMsg(value, index, length) {
        var ti = {
          'requestType': 'vendor',
          'recipient': 'device',
          'direction': 'in',
          'request': 0,
          'value': value,
          'index': index,
          'length': Math.max(8, length)
        };
        try {
          var data = await conn.controlTransfer(ti);
          data = data.slice(0, length);
          if (VERBOSE) {
            console.log('IN value 0x' + value.toString(16) + ' index 0x' +
              index.toString(16));
            console.log('    read -> ' + dumpBuffer(data));
          }

          return data;
        } catch (error) {
          var msg = 'USB read failed (value 0x' + value.toString(16) +
            ' index 0x' + index.toString(16) + '), message="' + error.message + '"';
        };
      }

      /**
       * Sends a USB control message to write to the device.
       * @param {number} value The value field of the control message.
       * @param {number} index The index field of the control message.
       * @param {ArrayBuffer} buffer The buffer to write to the device.
       */
      async function writeCtrlMsg(value, index, buffer) {
        var ti = {
          'requestType': 'vendor',
          'recipient': 'device',
          'direction': 'out',
          'request': 0,
          'value': value,
          'index': index,
          'data': buffer
        };
        try {
          await conn.controlTransfer(ti);
          if (VERBOSE) {
            console.log('OUT value 0x' + value.toString(16) + ' index 0x' +
              index.toString(16) + ' data ' + dumpBuffer(buffer));
          }
        } catch (error) {
          var msg = 'USB write failed (value 0x' + value.toString(16) +
            ' index 0x' + index.toString(16) + ' data ' + dumpBuffer(buffer) +
            ') message="' +
            error.message + '"';
          throw msg;
        };
      }

      /**
       * Does a bulk transfer from the device.
       * @param {number} length The number of bytes to read.
       * @return {ArrayBuffer} The received buffer.
       */
      async function readBulk(length) {
        var ti = {
          'direction': 'in',
          'endpoint': 1,
          'length': length
        };
        try {
          var data = await conn.bulkTransfer(ti);
          if (VERBOSE) {
            console.log('IN BULK requested ' + length + ' received ' + data.byteLength);
          }
          return data;
        } catch (error) {
          var msg = 'USB bulk read failed (length 0x' + length.toString(16) +
            '), error="' +
            error.message + '"';
          throw msg;
        }
      }

      /**
       * Claims the USB interface.
       */
      async function claimInterface() {
        await conn.claimInterface(0);
      }

      /**
       * Releases the USB interface.
       */
      async function releaseInterface() {
        await conn.releaseInterface(0);
      }

      /**
       * Performs several write operations as specified in an array.
       * @param {Array.<Array.<number>>} array The operations to perform.
       */
      async function writeEach(array) {
        for (var index = 0; index < array.length; index++) {
          var line = array[index];
          if (line[0] == CMD.REG) {
            await writeReg(line[1], line[2], line[3], line[4]);
          } else if (line[0] == CMD.REGMASK) {
            await writeRegMask(line[1], line[2], line[3], line[4]);
          } else if (line[0] == CMD.DEMODREG) {
            await writeDemodReg(line[1], line[2], line[3], line[4]);
          } else if (line[0] == CMD.I2CREG) {
            await writeI2CReg(line[1], line[2], line[3]);
          } else {
            throw 'Unsupported operation [' + line + ']';
          }
        }
      }

      /**
       * Returns a string representation of a buffer.
       * @param {ArrayBuffer} buffer The buffer to display.
       * @return {string} The string representation of the buffer.
       */
      function dumpBuffer(buffer) {
        var bytes = [];
        var arr = new Uint8Array(buffer);
        for (var i = 0; i < arr.length; ++i) {
          bytes.push('0x' + arr[i].toString(16));
        }
        return '[' + bytes + ']';
      }


      return {
        writeRegister: writeReg,
        readRegister: readReg,
        writeRegMask: writeRegMask,
        demod: {
          readRegister: readDemodReg,
          writeRegister: writeDemodReg
        },
        i2c: {
          open: openI2C,
          close: closeI2C,
          readRegister: readI2CReg,
          writeRegister: writeI2CReg,
          readRegBuffer: readI2CRegBuffer
        },
        bulk: {
          readBuffer: readBulk
        },
        iface: {
          claim: claimInterface,
          release: releaseInterface
        },
        writeEach: writeEach
      };
    }

    /**
     * Commands for writeEach.
     */
    var CMD = {
      REG: 1,
      REGMASK: 2,
      DEMODREG: 3,
      I2CREG: 4
    };

    /**
     * Register blocks.
     */
    var BLOCK = {
      DEMOD: 0x000,
      USB: 0x100,
      SYS: 0x200,
      I2C: 0x600
    };

    /**
     * Device registers.
     */
    var REG = {
      SYSCTL: 0x2000,
      EPA_CTL: 0x2148,
      EPA_MAXPKT: 0x2158,
      DEMOD_CTL: 0x3000,
      DEMOD_CTL_1: 0x300b
    };

    RtlCom.CMD = CMD;
    RtlCom.BLOCK = BLOCK;
    RtlCom.REG = REG;

    module.exports = RtlCom;

  }, {}], 5: [function (require, module, exports) {
    // Copyright 2018 Sandeep Mistry All rights reserved.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //     http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.

    const usb = require('./usb');
    const RTL2832U = require('./rtl2832u');

    const FILTERS = [
      {
        vendorId: 0x0bda,
        productId: 0x2832
      },
      {
        vendorId: 0x0bda,
        productId: 0x2838
      }
    ];

    function RtlSdr(usbDevice) {
      this._usbDevice = usbDevice;
      this._rtl2832u = null;
    }

    RtlSdr.prototype.open = async function (options) {
      await this._usbDevice.open();
      await this._usbDevice.selectConfiguration(1);

      this._rtl2832u = new RTL2832U(this._usbDevice, options.ppm || 0, options.gain || null);

      await this._rtl2832u.open();
    };

    RtlSdr.prototype.setSampleRate = async function (sampleRate) {
      return await this._rtl2832u.setSampleRate(sampleRate);
    };

    RtlSdr.prototype.setCenterFrequency = async function (centerFrequency) {
      return await this._rtl2832u.setCenterFrequency(centerFrequency);
    };

    RtlSdr.prototype.resetBuffer = async function () {
      await this._rtl2832u.resetBuffer();
    };

    RtlSdr.prototype.readSamples = async function (length) {
      return await this._rtl2832u.readSamples(length);
    };

    RtlSdr.prototype.close = async function () {
      await this._rtl2832u.close();
      await this._usbDevice.close();
    };

    RtlSdr.requestDevice = async function () {
      let usbDevice = await usb.requestDevice(FILTERS);

      return new RtlSdr(usbDevice);
    };

    RtlSdr.getDevices = async function () {
      let usbDevices = await usb.getDevices(FILTERS);

      const sdrs = [];

      usbDevices.forEach((usbDevice) => {
        sdrs.push(new RtlSdr(usbDevice));
      });

      return sdrs;
    };

    module.exports = RtlSdr;

  }, { "./rtl2832u": 3, "./usb": 6 }], 6: [function (require, module, exports) {
    // Copyright 2018 Sandeep Mistry All rights reserved.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //     http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.

    function USB(device) {
      this._device = device;
    }

    USB.prototype.open = async function () {
      await this._device.open();
    };

    USB.prototype.selectConfiguration = async function (configuration) {
      await this._device.selectConfiguration(configuration);
    };

    USB.prototype.claimInterface = async function (interface) {
      await this._device.claimInterface(interface);
    };

    USB.prototype.releaseInterface = async function (interface) {
      await this._device.releaseInterface(interface);
    };

    USB.prototype.controlTransfer = async function (ti) {
      if (ti.direction === 'out') {
        await this._device.controlTransferOut(ti, ti.data);
      } else if (ti.direction === 'in') {
        const result = await this._device.controlTransferIn(ti, ti.length);

        return result.data.buffer;
      }
    };

    USB.prototype.bulkTransfer = async function (ti) {
      const result = await this._device.transferIn(ti.endpoint, ti.length);

      return result.data.buffer;
    };

    USB.prototype.close = async function () {
      await this._device.close();
    };

    USB.requestDevice = async function (filters) {
      const usbDevice = await navigator.usb.requestDevice({
        filters: filters
      });

      return new USB(usbDevice);
    };

    USB.getDevices = async function (filters, callback) {
      const usbDevices = navigator.usb.getDevices();
      const devices = [];

      usbDevices.forEach((usbDevice) => {
        filters.forEach((filter) => {
          if (filter.vendorId === usbDevice.vendorId && filter.productId === usbDevice.productId) {
            devices.push(new USB(usbDevice));
          }
        });
      });

      return devices;
    };

    module.exports = USB;

  }, {}]
}, {}, [1]);
