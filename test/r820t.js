/*
I2C driver for Rafael Micro R820T chip

JavaScript port of original work:
https://github.com/osmocom/rtl-sdr

Some ideas taken from:
https://github.com/torvalds/linux/blob/master/drivers/media/tuners/r820t.c
https://github.com/google/radioreceiver/blob/master/extension/r820t.js

Copyright 2019 Ahmet Inan <inan@aicodix.de>
*/

function R820T(i2c) {
  const NAME = "Rafael Micro R820T";
  const XTAL_FREQ = 28800000;
  const VER_NUM = 49;

  const ODLO = 0x08; // open drain low
  const ODHI = 0x00; // open drain high
  const LPF = 0x00; // rf mux lowpass
  const BYP = 0x40; // rf mux bypass
  const PLO = 0x02; // poly mux low
  const PMI = 0x01; // poly mux middle
  const PHI = 0x00; // poly mux highest
  const MUX_SETTINGS = [
    { FREQ: 0, OPEN_D: ODLO, RF_MUX_POLY: LPF | PLO, TF_C: 0xdf },
    { FREQ: 50, OPEN_D: ODLO, RF_MUX_POLY: LPF | PLO, TF_C: 0xbe },
    { FREQ: 55, OPEN_D: ODLO, RF_MUX_POLY: LPF | PLO, TF_C: 0x8b },
    { FREQ: 60, OPEN_D: ODLO, RF_MUX_POLY: LPF | PLO, TF_C: 0x7b },
    { FREQ: 65, OPEN_D: ODLO, RF_MUX_POLY: LPF | PLO, TF_C: 0x69 },
    { FREQ: 70, OPEN_D: ODLO, RF_MUX_POLY: LPF | PLO, TF_C: 0x58 },
    { FREQ: 75, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x44 },
    { FREQ: 90, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x34 },
    { FREQ: 110, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x24 },
    { FREQ: 140, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x14 },
    { FREQ: 180, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x13 },
    { FREQ: 250, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x11 },
    { FREQ: 280, OPEN_D: ODHI, RF_MUX_POLY: LPF | PLO, TF_C: 0x00 },
    { FREQ: 310, OPEN_D: ODHI, RF_MUX_POLY: BYP | PMI, TF_C: 0x00 },
    { FREQ: 588, OPEN_D: ODHI, RF_MUX_POLY: BYP | PHI, TF_C: 0x00 },
    { FREQ: 650, OPEN_D: ODHI, RF_MUX_POLY: BYP | PHI, TF_C: 0x00 },
  ];

  // BW < 6 MHz
  const FILT_CAL_LO = 56000;
  const FILT_GAIN = 0x10;
  const IMG_R = 0x00;
  const FILT_Q = 0x10;
  const HP_COR = 0x6b;
  const EXT_ENABLE = 0x60;
  const LOOP_THROUGH = 0x01;
  const LT_ATT = 0x00;
  const FLT_EXT_WIDEST = 0x00;
  const POLYFIL_CUR = 0x60;

  // freq=0, delsys=SYS_DVBT and type=TUNER_DIGITAL_TV
  const MIXER_TOP = 0x24;
  const LNA_TOP = 0xe5;
  const LNA_TOP_LOWEST = 0;
  const LNA_TOP_3 = 0x18;
  const LNA_VTH_L = 0x53;
  const MIXER_VTH_L = 0x75;
  const AIR_CABLE1_IN = 0x00;
  const CABLE2_IN = 0x00;
  const CP_CUR = 0x38;
  const DIV_BUF_CUR = 0x30;
  const LNA_DISCHARGE = 14;
  const FILTER_CUR = 0x40;
  const NORMAL_MODE = 0;
  const PRE_DECT_OFF = 0;
  const AGC_CLK_250HZ = 0x30;
  const AGC_CLK_60HZ = 0x20;

  // calibration
  const CALI_CLK_ON = 0x04;
  const CALI_CLK_OFF = 0x00;
  const XTAL_CAP_0PF = 0x00;
  const START_TRIGGER = 0x10;
  const STOP_TRIGGER = 0x00;

  // PLL
  const REFDIV2 = 0;
  const AUTOTUNE_128KHZ = 0x00;
  const AUTOTUNE_8KHZ = 0x08;
  const VCO_CURRENT_100 = 0x80;
  const VCO_POWER_REF = 0x02;
  const VCO_MIN = 1770000;
  const VCO_MAX = VCO_MIN * 2;
  const SDM_MAX = 0x8000;

  const SHADOW_START = 5;
  const SHADOW_REGS = [
    0x83, 0x32, 0x75, 0xc0, 0x40, 0xd6, 0x6c, 0xf5, 0x63, 0x75, 0x68, 0x6c,
    0x83, 0x80, 0x00, 0x0f, 0x00, 0xc0, 0x30, 0x48, 0xcc, 0x60, 0x00, 0x54,
    0xae, 0x4a, 0xc0,
  ];

  var shadowRegs;

  function getName() {
    return NAME;
  }

  function powerUp() {
    return initShadowRegs().then(initDevice);
  }

  function shutDown() {
    return writeReg(0x06, 0xb1)
      .then(() => writeReg(0x05, 0x03))
      .then(() => writeReg(0x07, 0x3a))
      .then(() => writeReg(0x08, 0x40))
      .then(() => writeReg(0x09, 0xc0))
      .then(() => writeReg(0x0a, 0x36))
      .then(() => writeReg(0x0c, 0x35))
      .then(() => writeReg(0x0f, 0x68))
      .then(() => writeReg(0x11, 0x03))
      .then(() => writeReg(0x17, 0xf4))
      .then(() => writeReg(0x19, 0x0c));
  }

  function setFrequency(freq) {
    return setMux(freq).then(() => setPll(freq));
  }

  function initDevice() {
    return writeRegMask(0x0c, 0x00, 0x0f)
      .then(() => writeRegMask(0x13, VER_NUM, 0x3f))
      .then(() => writeRegMask(0x1d, 0x00, 0x38))
      .then(calibrate)
      .then((code) => {
        if (code != 0) return calibrate();
        return 0;
      })
      .then((code) => writeRegMask(0x0a, FILT_Q | code, 0x1f))
      .then(() => writeRegMask(0x0b, HP_COR, 0xef))
      .then(() => writeRegMask(0x07, IMG_R, 0x80))
      .then(() => writeRegMask(0x06, FILT_GAIN, 0x30))
      .then(() => writeRegMask(0x1e, EXT_ENABLE, 0x60))
      .then(() => writeRegMask(0x05, LOOP_THROUGH, 0x80))
      .then(() => writeRegMask(0x1f, LT_ATT, 0x80))
      .then(() => writeRegMask(0x0f, FLT_EXT_WIDEST, 0x80))
      .then(() => writeRegMask(0x19, POLYFIL_CUR, 0x60))
      .then(() => writeRegMask(0x1d, LNA_TOP, 0xc7))
      .then(() => writeRegMask(0x1c, MIXER_TOP, 0xf8))
      .then(() => writeRegMask(0x0d, LNA_VTH_L, 0xff))
      .then(() => writeRegMask(0x0e, MIXER_VTH_L, 0xff))
      .then(() => writeRegMask(0x05, AIR_CABLE1_IN, 0x60))
      .then(() => writeRegMask(0x06, CABLE2_IN, 0x08))
      .then(() => writeRegMask(0x11, CP_CUR, 0x08))
      .then(() => writeRegMask(0x17, DIV_BUF_CUR, 0x30))
      .then(() => writeRegMask(0x0a, FILTER_CUR, 0x60))
      .then(() => writeRegMask(0x1d, LNA_TOP_LOWEST, 0x38))
      .then(() => writeRegMask(0x1c, NORMAL_MODE, 0x04))
      .then(() => writeRegMask(0x06, PRE_DECT_OFF, 0x40))
      .then(() => writeRegMask(0x1a, AGC_CLK_250HZ, 0x30))
      .then(() => writeRegMask(0x1d, LNA_TOP_3, 0x38))
      .then(() => writeRegMask(0x1c, MIXER_TOP, 0x04))
      .then(() => writeRegMask(0x1e, LNA_DISCHARGE, 0x1f))
      .then(() => writeRegMask(0x1a, AGC_CLK_60HZ, 0x30));
  }

  function setAutoGain() {
    // LNA gain auto
    return (
      writeRegMask(0x05, 0x00, 0x10)
        // Mixer gain auto
        .then(() => writeRegMask(0x07, 0x10, 0x10))
        // VGA auto gain is controlled by vagc pin .. huh?
        // for now: manual gain -1.5dB
        .then(() => writeRegMask(0x0c, 0x03, 0x1f))
    );
  }

  function calibrate() {
    return writeRegMask(0x0b, HP_COR, 0x60)
      .then(() => writeRegMask(0x0f, CALI_CLK_ON, 0x04))
      .then(() => writeRegMask(0x10, XTAL_CAP_0PF, 0x03))
      .then(() => setPll(FILT_CAL_LO * 1000))
      .then(() => writeRegMask(0x0b, START_TRIGGER, 0x10))
      .then(() => writeRegMask(0x0b, STOP_TRIGGER, 0x10))
      .then(() => writeRegMask(0x0f, CALI_CLK_OFF, 0x04))
      .then(() => read(0x00, 5))
      .then((data) => {
        let tmp = new Uint8Array(data);
        let code = tmp[4] & 0x0f;
        if (code == 0x0f) return 0;
        return code;
      });
  }

  function setMux(freq) {
    let freqMHz = freq / 1000000;
    let tmp = MUX_SETTINGS[0];
    MUX_SETTINGS.forEach((e) => {
      if (freqMHz >= e.FREQ) tmp = e;
    });
    return writeRegMask(0x17, tmp.OPEN_D, 0x08)
      .then(() => writeRegMask(0x1a, tmp.RF_MUX_POLY, 0xc3))
      .then(() => writeRegMask(0x1b, tmp.TF_C, 0xff))
      .then(() => writeRegMask(0x10, XTAL_CAP_0PF, 0x0b))
      .then(() => writeRegMask(0x08, 0x00, 0x3f))
      .then(() => writeRegMask(0x09, 0x00, 0x3f));
  }

  function setPll(freq) {
    let freqKHz = Math.round(freq / 1000);
    let mixDiv = 2;
    let divNum = 0;
    while (mixDiv <= 64) {
      if (freqKHz * mixDiv >= VCO_MIN && freqKHz * mixDiv < VCO_MAX) {
        for (let divBuf = mixDiv; divBuf > 2; divBuf = Math.floor(divBuf / 2))
          ++divNum;
        break;
      }
      mixDiv *= 2;
    }
    let vcoFreq = freq * mixDiv;
    let pllRef = XTAL_FREQ;
    let pllRefKHz = Math.round(pllRef / 1000);
    let nint = Math.floor(vcoFreq / (2 * pllRef));
    if (nint > 128 / VCO_POWER_REF - 1)
      return Promise.reject("No valid PLL values for " + freq + " Hz!");
    let vcoFra = Math.floor((vcoFreq - 2 * pllRef * nint) / 1000);
    let val = vcoFra == 0 ? 0x08 : 0x00;
    let ni = Math.floor((nint - 13) / 4);
    let si = nint - 4 * ni - 13;
    let sdm = 0;
    for (let num = 2; num <= SDM_MAX && vcoFra > 1; num *= 2) {
      if (vcoFra > Math.floor((2 * pllRefKHz) / num)) {
        sdm += Math.floor(SDM_MAX / (num / 2));
        vcoFra -= Math.floor((2 * pllRefKHz) / num);
      }
    }
    let actual = (pllRef * (2 * nint + sdm / SDM_MAX)) / mixDiv;
    return writeRegMask(0x10, REFDIV2, 0x10)
      .then(() => writeRegMask(0x1a, AUTOTUNE_128KHZ, 0x0c))
      .then(() => writeRegMask(0x12, VCO_CURRENT_100, 0xe0))
      .then(() => read(0x00, 5))
      .then((data) => {
        let tmp = new Uint8Array(data);
        let vcoFineTune = (tmp[4] & 0x30) >> 4;
        if (vcoFineTune > VCO_POWER_REF) --divNum;
        if (vcoFineTune < VCO_POWER_REF) ++divNum;
        return writeRegMask(0x10, divNum << 5, 0xe0);
      })
      .then(() => writeRegMask(0x14, ni + (si << 6), 0xff))
      .then(() => writeRegMask(0x12, val, 0x08))
      .then(() => writeRegMask(0x16, sdm >> 8, 0xff))
      .then(() => writeRegMask(0x15, sdm & 0xff, 0xff))
      .then(getPllLock)
      .then(() => writeRegMask(0x1a, AUTOTUNE_8KHZ, 0x08))
      .then(() => actual);
  }

  function getPllLock() {
    return read(0x00, 3).then((data) => {
      let tmp = new Uint8Array(data);
      if (tmp[2] & 0x40) return Promise.resolve();
      return writeRegMask(0x12, 0x60, 0xe0)
        .then(() => read(0x00, 3))
        .then((data) => {
          let tmp = new Uint8Array(data);
          if (tmp[2] & 0x40) return Promise.resolve();
          return Promise.reject("PLL not locked!");
        });
    });
  }

  function initShadowRegs() {
    shadowRegs = new Uint8Array(SHADOW_REGS);
    let tmp = Promise.resolve();
    for (let i = 0; i < SHADOW_REGS.length; ++i) {
      let reg = i + SHADOW_START;
      let val = SHADOW_REGS[i];
      tmp = tmp.then(() => writeReg(reg, val));
    }
    return tmp;
  }

  function bitrev8(b) {
    const lut = [
      0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe, 0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7,
      0xf,
    ];
    return (lut[b & 0xf] << 4) | lut[b >> 4];
  }

  function read(addr, length) {
    return i2c.read(addr, length).then((data) => {
      let tmp = new Uint8Array(data);
      for (let i = 0; i < tmp.length; ++i) tmp[i] = bitrev8(tmp[i]);
      return tmp.buffer;
    });
  }

  function writeReg(addr, value) {
    shadowRegs[addr - SHADOW_START] = value;
    return i2c.writeReg(addr, value);
  }

  function writeRegMask(addr, value, mask) {
    let tmp = shadowRegs[addr - SHADOW_START];
    let val = (tmp & ~mask) | (value & mask);
    shadowRegs[addr - SHADOW_START] = val;
    return i2c.writeReg(addr, val);
  }

  return {
    getName: getName,
    powerUp: powerUp,
    shutDown: shutDown,
    setFrequency: setFrequency,
    setAutoGain: setAutoGain,
  };
}
