/*
WebUSB driver for Realtek RTL2832U chip

JavaScript port of original work:
https://github.com/osmocom/rtl-sdr

Some ideas taken from:
https://github.com/torvalds/linux/blob/master/drivers/media/usb/dvb-usb-v2/rtl28xxu.c
https://github.com/google/radioreceiver/blob/master/extension/rtl2832u.js

Copyright 2019 Ahmet Inan <inan@aicodix.de>
*/

function RTL2832U(usb) {
  const XTAL_FREQ = 28800000;

  const USB_SYSCTL = 0x2000;
  const USB_EPA_MAXPKT = 0x2158;
  const USB_EPA_CTL = 0x2148;

  const DEMOD_CTL = 0x3000;
  const DEMOD_CTL_1 = 0x300b;

  const CMD_USB_WR = 0x0110;
  const CMD_SYS_WR = 0x0210;
  const CMD_I2C_DA_RD = 0x0600;
  const CMD_I2C_DA_WR = 0x0610;

  const E4K_I2C_ADDR = 0xc8;
  const E4K_CHECK_VAL = 0x40;
  const E4K_CHECK_ADDR = 0x02;

  const R820T_I2C_ADDR = 0x34;
  const R82XX_CHECK_VAL = 0x69;
  const R82XX_CHECK_ADDR = 0x00;
  const R82XX_IF_FREQ = 3570000;

  const FIR_DEFAULT = [
    -54, -36, -41, -40, -32, -14, 14, 53 /* 8 bit signed */, 101, 156, 215, 273,
    327, 372, 404, 421 /* 12 bit signed */,
  ];

  var tuner;
  var int_freq = 0;

  function powerUp() {
    return (
      usb
        .open()
        // initialize USB
        .then(() => writeReg(CMD_USB_WR, USB_SYSCTL, 0x09))
        .then(() => writeReg(CMD_USB_WR, USB_EPA_MAXPKT, 0x0200, 2))
        .then(() => writeReg(CMD_USB_WR, USB_EPA_CTL, 0x0210, 2))
        .then(() => usb.claimInterface(0))
        // poweron demod
        .then(() => writeReg(CMD_SYS_WR, DEMOD_CTL_1, 0x22))
        .then(() => writeReg(CMD_SYS_WR, DEMOD_CTL, 0xe8))
        .then(resetDemod)
        // disable spectrum inversion and adjacent channel rejection
        .then(() => demodWriteReg(1, 0x15, 0x00))
        .then(() => demodWriteReg(1, 0x16, 0x0000, 2))
        // clear both DDC shift and IF frequency registers
        .then(() => demodWriteReg(1, 0x16, 0x00))
        .then(() => demodWriteReg(1, 0x17, 0x00))
        .then(() => demodWriteReg(1, 0x18, 0x00))
        .then(() => demodWriteReg(1, 0x19, 0x00))
        .then(() => demodWriteReg(1, 0x1a, 0x00))
        .then(() => demodWriteReg(1, 0x1b, 0x00))
        .then(() => setFir(FIR_DEFAULT))
        // enable SDR mode, disable DAGC (bit 5)
        .then(() => demodWriteReg(0, 0x19, 0x05))
        // init FSM state-holding register
        .then(() => demodWriteReg(1, 0x93, 0xf0))
        .then(() => demodWriteReg(1, 0x94, 0x0f))
        // disable AGC (en_dagc, bit 0) (this seems to have no effect)
        .then(() => demodWriteReg(1, 0x11, 0x00))
        // disable RF and IF AGC loop
        .then(() => demodWriteReg(1, 0x04, 0x00))
        // disable PID filter (enable_PID = 0)
        .then(() => demodWriteReg(0, 0x61, 0x60))
        // opt_adc_iq = 0, default ADC_I/ADC_Q datapath
        .then(() => demodWriteReg(0, 0x06, 0x80))
        // enable Zero-IF mode (en_bbin bit), DC cancellation (en_dc_est),
        // IQ estimation/compensation (en_iq_comp, en_iq_est)
        .then(() => demodWriteReg(1, 0xb1, 0x1b))
        // disable 4.096 MHz clock output on pin TP_CK0
        .then(() => demodWriteReg(0, 0x0d, 0x83))
        .then(enableI2C)
        // probe for E4000 tuner
        .then(() => {
          return i2c_readReg(E4K_I2C_ADDR, E4K_CHECK_ADDR).then((data) => {
            if (data != E4K_CHECK_VAL) return Promise.resolve(false);
            tuner = new E4000(new I2C(E4K_I2C_ADDR));
            return Promise.resolve(true);
          });
        })
        // probe for R820T tuner
        .then((found) => {
          if (found) return found;
          return i2c_readReg(R820T_I2C_ADDR, R82XX_CHECK_ADDR).then((data) => {
            if (data != R82XX_CHECK_VAL) return Promise.resolve(false);
            tuner = new R820T(new I2C(R820T_I2C_ADDR));
            // disable Zero-IF mode
            return (
              demodWriteReg(1, 0xb1, 0x1a)
                // only enable In-phase ADC input
                .then(() => demodWriteReg(0, 0x08, 0x4d))
                // the R82XX use 3.57 MHz IF for the DVB-T 6 MHz mode
                .then(() => setIntFreq(R82XX_IF_FREQ))
                // enable spectrum inversion
                .then(() => demodWriteReg(1, 0x15, 0x01))
                // tuner found
                .then(() => true)
            );
          });
        })
        .then((found) => {
          if (found) return Promise.resolve();
          return disableI2C()
            .then(() => usb.releaseInterface(0))
            .then(() => usb.close())
            .then(() => Promise.reject("Only E4000 or R820T tuner supported."));
        })
        .then(() => tuner.powerUp())
        .then(() => tuner.setAutoGain())
        .then(disableI2C)
        .then(
          () =>
            "Connected to Realtek RTL2832U with " + tuner.getName() + " tuner"
        )
    );
  }

  function shutDown() {
    return enableI2C()
      .then(tuner.shutDown)
      .then(disableI2C)
      .then(() => usb.releaseInterface(0))
      .then(() => usb.close());
  }

  function setSampleRate(rate) {
    if (rate <= 225000 || (rate > 300000 && rate <= 900000) || rate > 3200000)
      return Promise.reject("Invalid sample rate");
    let ratio = Math.floor((XTAL_FREQ * (1 << 22)) / rate) & 0x0ffffffc;
    let realRatio = ratio | ((ratio & 0x08000000) << 1);
    let realRate = (XTAL_FREQ * (1 << 22)) / realRatio;
    return demodWriteReg(1, 0x9f, (ratio >> 16) & 0xffff, 2)
      .then(() => demodWriteReg(1, 0xa1, ratio & 0xffff, 2))
      .then(resetDemod)
      .then(() => realRate);
  }

  function setIntFreq(freq) {
    int_freq = freq;
    let tmp = -Math.floor((freq * (1 << 22)) / XTAL_FREQ);
    return demodWriteReg(1, 0x19, (tmp >> 16) & 0x3f)
      .then(() => demodWriteReg(1, 0x1a, (tmp >> 8) & 0xff))
      .then(() => demodWriteReg(1, 0x1b, tmp & 0xff));
  }

  function setFir(fir) {
    let tmp = new Uint8Array(20);
    for (let i = 0; i < 8; ++i) {
      let val = fir[i];
      if (val < -128 || val > 127)
        return Promise.reject(
          "8 bit signed FIR filter coefficients out of bounds"
        );
      tmp[i] = val;
    }
    for (let i = 0; i < 8; i += 2) {
      let val0 = fir[8 + i];
      let val1 = fir[8 + i + 1];
      if (val0 < -2048 || val0 > 2047 || val1 < -2048 || val1 > 2047)
        return Promise.reject(
          "12 bit signed FIR filter coefficients out of bounds"
        );
      tmp[8 + Math.floor((i * 3) / 2) + 0] = val0 >> 4;
      tmp[8 + Math.floor((i * 3) / 2) + 1] = (val0 << 4) | ((val1 >> 8) & 0x0f);
      tmp[8 + Math.floor((i * 3) / 2) + 2] = val1;
    }
    let res = Promise.resolve();
    for (let i = 0; i < 20; ++i)
      res = res.then(() => demodWriteReg(1, 0x1c + i, tmp[i]));
    return res;
  }

  function resetDemod() {
    // reset demod (bit 3, soft_rst)
    return demodWriteReg(1, 0x01, 0x14).then(() =>
      demodWriteReg(1, 0x01, 0x10)
    );
  }

  function setCenterFrequency(freq) {
    return enableI2C()
      .then(() => tuner.setFrequency(freq + int_freq))
      .then((actual) => disableI2C().then(() => actual - int_freq));
  }

  function resetBuffer() {
    return writeReg(CMD_USB_WR, USB_EPA_CTL, 0x0210, 2).then(() =>
      writeReg(CMD_USB_WR, USB_EPA_CTL, 0x0000, 2)
    );
  }

  function readSamples(len) {
    return usb.transferIn(1, len * 2).then((e) => e.data.buffer);
  }

  function writeArray(block, reg, buffer) {
    let ti = {
      requestType: "vendor",
      recipient: "device",
      request: 0,
      value: reg,
      index: block,
    };
    return usb.controlTransferOut(ti, buffer);
  }

  function readArray(block, reg, len) {
    let ti = {
      requestType: "vendor",
      recipient: "device",
      request: 0,
      value: reg,
      index: block,
    };
    return usb.controlTransferIn(ti, len).then((e) => e.data.buffer);
  }

  function writeReg(block, reg, value, len) {
    if (len == undefined) len = 1;
    return writeArray(block, reg, val2le(value, len));
  }

  function readReg(block, reg, len) {
    if (len == undefined) len = 1;
    return readArray(block, reg, len).then((data) => le2val(data));
  }

  function demodReadReg(page, addr) {
    return readReg(page, (addr << 8) | 0x20);
  }

  function demodWriteReg(page, addr, value, len) {
    if (len == undefined) len = 1;
    return writeArray(page | 16, (addr << 8) | 0x20, val2be(value, len)).then(
      () => demodReadReg(0x0a, 0x01)
    );
  }

  function le2val(buffer) {
    let sum = 0;
    let tmp = new Uint8Array(buffer);
    for (let i = 0; i < tmp.length; ++i) sum += tmp[i] << (8 * i);
    return sum;
  }

  function val2le(value, len) {
    let tmp = new Uint8Array(len);
    for (let i = 0; i < len; ++i) tmp[i] = 255 & (value >> (8 * i));
    return tmp.buffer;
  }

  function val2be(value, len) {
    let tmp = new Uint8Array(len);
    for (let i = 0; i < len; ++i) tmp[i] = 255 & (value >> (8 * (len - 1 - i)));
    return tmp.buffer;
  }

  function enableI2C() {
    return demodWriteReg(1, 1, 0x18);
  }

  function disableI2C() {
    return demodWriteReg(1, 1, 0x10);
  }

  function i2c_read(addr, reg, len) {
    return writeArray(CMD_I2C_DA_WR, addr, new Uint8Array([reg]).buffer).then(
      () => readArray(CMD_I2C_DA_RD, addr, len)
    );
  }

  function i2c_readReg(addr, reg) {
    return writeArray(CMD_I2C_DA_WR, addr, new Uint8Array([reg]).buffer).then(
      () => readReg(CMD_I2C_DA_RD, addr)
    );
  }

  function i2c_writeReg(addr, reg, value) {
    return writeArray(CMD_I2C_DA_WR, addr, new Uint8Array([reg, value]).buffer);
  }

  function i2c_writeRegMask(addr, reg, value, mask) {
    let tmp = i2c_readReg(addr, reg);
    let val = (tmp & ~mask) | (value & mask);
    return i2c_writeReg(addr, reg, val);
  }

  function I2C(addr) {
    function read(reg, len) {
      return i2c_read(addr, reg, len);
    }

    function readReg(reg) {
      return i2c_readReg(addr, reg);
    }

    function writeReg(reg, value) {
      return i2c_writeReg(addr, reg, value);
    }

    function writeRegMask(reg, value, mask) {
      return i2c_writeRegMask(addr, reg, value, mask);
    }

    return {
      read: read,
      readReg: readReg,
      writeReg: writeReg,
      writeRegMask: writeRegMask,
    };
  }

  return {
    powerUp: powerUp,
    shutDown: shutDown,
    setSampleRate: setSampleRate,
    setCenterFrequency: setCenterFrequency,
    resetBuffer: resetBuffer,
    readSamples: readSamples,
  };
}
