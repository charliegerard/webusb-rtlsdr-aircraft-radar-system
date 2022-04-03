/*
I2C driver for Elonics E4000 chip

JavaScript port of original work:
https://github.com/osmocom/rtl-sdr

Some ideas taken from:
https://github.com/torvalds/linux/blob/master/drivers/media/tuners/e4000.c
https://github.com/google/radioreceiver/blob/master/extension/r820t.js

Copyright 2019 Ahmet Inan <inan@aicodix.de>
*/

function E4000(i2c) {
  const NAME = "Elonics E4000";
  const XTAL_FREQ = 28800000;

  const E4K_REG_MASTER1 = 0x00;
  const E4K_REG_CLK_INP = 0x05;
  const E4K_REG_REF_CLK = 0x06;
  const E4K_REG_SYNTH1 = 0x07;
  const E4K_REG_SYNTH3 = 0x09;
  const E4K_REG_SYNTH4 = 0x0a;
  const E4K_REG_SYNTH5 = 0x0b;
  const E4K_REG_SYNTH7 = 0x0d;
  const E4K_REG_FILT1 = 0x10;
  const E4K_REG_FILT2 = 0x11;
  const E4K_REG_FILT3 = 0x12;
  const E4K_REG_AGC1 = 0x1a;
  const E4K_REG_AGC4 = 0x1d;
  const E4K_REG_AGC5 = 0x1e;
  const E4K_REG_AGC6 = 0x1f;
  const E4K_REG_AGC7 = 0x20;
  const E4K_REG_AGC11 = 0x24;
  const E4K_REG_DC5 = 0x2d;
  const E4K_REG_DCTIME1 = 0x70;
  const E4K_REG_DCTIME2 = 0x71;
  const E4K_REG_BIAS = 0x78;
  const E4K_REG_CLKOUT_PWDN = 0x7a;

  const E4K_MASTER1_RESET = 1 << 0;
  const E4K_MASTER1_NORM_STBY = 1 << 1;
  const E4K_MASTER1_POR_DET = 1 << 2;
  const E4K_FILT3_DISABLE = 1 << 5;
  const E4K_AGC7_MIX_GAIN_AUTO = 1 << 0;
  const E4K_AGC1_MOD_MASK = 0xf;
  const E4K_AGC_MOD_SERIAL = 0x0;
  const E4K_AGC_MOD_IF_SERIAL_LNA_AUTON = 0x9;

  const E4K_PLL_Y = 65536;
  const TWOPM = 0x00; // two phase mixing
  const THRPM = 0x08; // three phase mixing
  const PLL_SETTINGS = [
    { FREQ: 72400000, REG: THRPM | 7, MULT: 48 },
    { FREQ: 81200000, REG: THRPM | 6, MULT: 40 },
    { FREQ: 108300000, REG: THRPM | 5, MULT: 32 },
    { FREQ: 162500000, REG: THRPM | 4, MULT: 24 },
    { FREQ: 216600000, REG: THRPM | 3, MULT: 16 },
    { FREQ: 325000000, REG: THRPM | 2, MULT: 12 },
    { FREQ: 350000000, REG: THRPM | 1, MULT: 8 },
    { FREQ: 432000000, REG: TWOPM | 3, MULT: 8 },
    { FREQ: 667000000, REG: TWOPM | 2, MULT: 6 },
    { FREQ: 1200000000, REG: TWOPM | 1, MULT: 4 },
    { FREQ: 2300000000, REG: TWOPM | 0, MULT: 2 },
  ];

  function getName() {
    return NAME;
  }

  function powerUp() {
    return initDevice();
  }

  function shutDown() {
    return i2c.writeRegMask(E4K_REG_MASTER1, 0x00, E4K_MASTER1_NORM_STBY);
  }

  function setFrequency(freq) {
    return setMux(freq).then(() => setPll(freq));
  }

  // TODO: make it generic .. hand-picked filters for VHF2 here
  function setMux(freq) {
    // set the band
    return (
      i2c
        .writeReg(E4K_REG_BIAS, 3)
        .then(() => i2c.writeRegMask(E4K_REG_SYNTH1, 0x00, 0x06))
        // select and set proper RF filter
        .then(() => i2c.writeRegMask(E4K_REG_FILT1, 0x00, 0x0f))
    );
  }

  function setPll(freq) {
    let idx = PLL_SETTINGS.findIndex((e) => freq < e.FREQ);
    if (idx < 0)
      return Promise.reject("No valid PLL values for " + freq + " Hz!");
    let range = PLL_SETTINGS[idx];
    let fvco = freq * range.MULT;
    let z = Math.floor(fvco / XTAL_FREQ);
    let remainder = fvco - XTAL_FREQ * z;
    let x = Math.floor((remainder * E4K_PLL_Y) / XTAL_FREQ);
    let actual = (XTAL_FREQ * (z + x / E4K_PLL_Y)) / range.MULT;
    // program R + 3phase/2phase
    return (
      i2c
        .writeReg(E4K_REG_SYNTH7, range.REG)
        // program Z
        .then(() => i2c.writeReg(E4K_REG_SYNTH3, z))
        // program X
        .then(() => i2c.writeReg(E4K_REG_SYNTH4, x & 0xff))
        .then(() => i2c.writeReg(E4K_REG_SYNTH5, x >> 8))
        .then(getPllLock)
        .then(() => actual)
    );
  }

  function getPllLock() {
    return i2c.readReg(E4K_REG_SYNTH1).then((value) => {
      if (value & 1) return Promise.resolve();
      return Promise.reject("PLL not locked!");
    });
  }

  function initDevice() {
    // make a dummy i2c read or write command, will not be ACKed!
    return (
      i2c
        .readReg(0)
        // Make sure we reset everything and clear POR indicator
        .then(() =>
          i2c.writeReg(
            E4K_REG_MASTER1,
            E4K_MASTER1_RESET | E4K_MASTER1_NORM_STBY | E4K_MASTER1_POR_DET
          )
        )
        // Configure clock input
        .then(() => i2c.writeReg(E4K_REG_CLK_INP, 0x00))
        // Disable clock output
        .then(() => i2c.writeReg(E4K_REG_REF_CLK, 0x00))
        .then(() => i2c.writeReg(E4K_REG_CLKOUT_PWDN, 0x96))
        // Write some magic values into registers
        .then(() => i2c.writeReg(0x7e, 0x01))
        .then(() => i2c.writeReg(0x7f, 0xfe))
        .then(() => i2c.writeReg(0x82, 0x00))
        .then(() => i2c.writeReg(0x86, 0x50))
        .then(() => i2c.writeReg(0x87, 0x20))
        .then(() => i2c.writeReg(0x88, 0x01))
        .then(() => i2c.writeReg(0x9f, 0x7f))
        .then(() => i2c.writeReg(0xa0, 0x07))
        // Set LNA mode to manual
        .then(() => i2c.writeReg(E4K_REG_AGC4, 0x10))
        .then(() => i2c.writeReg(E4K_REG_AGC5, 0x04))
        .then(() => i2c.writeReg(E4K_REG_AGC6, 0x1a))
        .then(() =>
          i2c.writeRegMask(E4K_REG_AGC1, E4K_AGC_MOD_SERIAL, E4K_AGC1_MOD_MASK)
        )
        // Set Mixer Gain Control to manual
        .then(() =>
          i2c.writeRegMask(E4K_REG_AGC7, 0x00, E4K_AGC7_MIX_GAIN_AUTO)
        )
        // Merged following operations:
        // 1. Select moderate gain levels
        // 2. Set the most narrow filter we can possibly use
        // 3. Enable channel filter
        .then(() => i2c.writeRegMask(E4K_REG_FILT1, 0x01, 0x7f))
        .then(() => i2c.writeRegMask(E4K_REG_FILT2, 0xff, 0xff))
        .then(() => i2c.writeRegMask(E4K_REG_FILT3, 0x1f, 0x3f))
        // Disable time variant DC correction and LUT
        .then(() => i2c.writeRegMask(E4K_REG_DC5, 0x00, 0x03))
        .then(() => i2c.writeRegMask(E4K_REG_DCTIME1, 0x00, 0x03))
        .then(() => i2c.writeRegMask(E4K_REG_DCTIME2, 0x00, 0x03))
    );
  }

  function setAutoGain() {
    // Set LNA mode to auto
    return (
      i2c
        .writeRegMask(
          E4K_REG_AGC1,
          E4K_AGC_MOD_IF_SERIAL_LNA_AUTON,
          E4K_AGC1_MOD_MASK
        )
        // Set Mixer Gain Control to auto
        .then(() => i2c.writeRegMask(E4K_REG_AGC7, 1, E4K_AGC7_MIX_GAIN_AUTO))
        .then(() => i2c.writeRegMask(E4K_REG_AGC11, 0, 0x7))
    );
  }

  return {
    getName: getName,
    powerUp: powerUp,
    shutDown: shutDown,
    setFrequency: setFrequency,
    setAutoGain: setAutoGain,
  };
}
