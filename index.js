let device;
import { Demodulator } from "./demodulator.js";
let button = document.querySelector("button");
let decoder;

const demodulator = new Demodulator()

button.onclick = () => {
  navigator.usb
    .requestDevice({
      filters: [
        {
          vendorId: 0x0bda,
          productId: 0x2838,
        },
        {
          vendorId: 0x0bda,
          productId: 0x2832,
        },
      ],
    })
    .then((selectedDevice) => {
      device = selectedDevice;
      return device.open(); // Begin a session.
    })
    .then(() => device.selectConfiguration(1)) // Select configuration #1 for the device.
    .then(() => device.claimInterface(0)) // Request exclusive control over interface #2.
    // .then(() => {
    //   device.controlTransferOut({
    //     requestType: "class",
    //     recipient: "interface",
    //     request: 0x22,
    //     value: 0x01,
    //     // index: 0x02,
    //     index: 0,
    //   });
    // }) // Ready to receive data
    .then(() => {
      return readLoop();
    })
    .catch((error) => {
      console.error(error);
    });
};

const onMsg = (msg) => {
  console.log('MESSAGE: ', msg)
  // if (msg.callsign) {
  // console.log('AIRCRAFT: ', msg.callsign)
  console.log('MESSAGE: ', msg)
  // }
  // displayAircraftData(msg);
}

let started = false;

const readLoop = () => {
  device
    // .transferIn(1, 262144) // should use this one
    .transferIn(1, 256000) // should use this one
    .then((result) => {
      if (!started) {
        console.log('START')
        started = true
      }

      const data = new Uint8Array(result.data.buffer);
      // console.log(data)
      // displayLiveData(data);

      demodulator.process(data, 256000, onMsg)

      readLoop();
    })
    .catch((ee) => console.log(ee));
};


/*

{
  aircraftType: null
altitude: null
ca: 5
callsign: ""
crc: 16033899
crcOk: true
dr: 20
errorbit: -1
ewDir: null
ewVelocity: null
fflag: null
fs: 5
heading: null
headingIsValid: null
icao: 10939975
identity: 3426
mesub: 4
metype: 30
msg: Uint8Array(56) [232, 199, 240, 176, 92, 94, 144, 102, 200, 63, 215, 244, 194, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, buffer: ArrayBuffer(56), byteLength: 56, byteOffset: 0, length: 56, Symbol(Symbol.toStringTag): 'Uint8Array']
msgbits: 56
msgtype: 11
nsDir: null
nsVelocity: null
phaseCorrected: false
rawLatitude: null
rawLongitude: null
speed: null
tflag: null
um: 55
unit: null
vertRate: null
vertRateSign: null
vertRateSource: null
}
*/


let liveDataDiv = document.querySelector('.live-raw-data');
let icaoDiv = document.querySelector('.icao');
let crcDiv = document.querySelector('.crc');
let identityDiv = document.querySelector('.identity');
let altitudeDiv = document.querySelector('.altitude');
let headingDiv = document.querySelector('.heading');
let speedDiv = document.querySelector('.speed');
let callsignDiv = document.querySelector('.call-sign');
let latitudeDiv = document.querySelector('.latitude');
let longitudeDiv = document.querySelector('.longitude');

window.onload = () => {
  const dateDiv = document.querySelector('.date');
  const timeDiv = document.querySelector('.time');
  const now = new Date();

  dateDiv.innerHTML = `${now.getDate()} / ${now.getMonth() + 1} / ${now.getFullYear()}`;
  timeDiv.innerHTML = `${now.getHours()} : ${now.getMinutes()}`;
}

const displayLiveData = (data) => {
  liveDataDiv.innerHTML = data.toString();
}

const displayAircraftData = msg => {
  icaoDiv.innerHTML = msg.icao ? msg.icao : "N/A";
  crcDiv.innerHTML = msg.crc ? msg.crc : "N/A";
  identityDiv.innerHTML = msg.identity ? msg.identity : "N/A";
  altitudeDiv.innerHTML = msg.altitude ? msg.altitude : "N/A";
  headingDiv.innerHTML = msg.heading ? msg.heading : "N/A";
  speedDiv.innerHTML = msg.speed ? msg.speed : "N/A";
  callsignDiv.innerHTML = msg.callsign ? msg.callsign : "N/A";
  latitudeDiv.innerHTML = msg.latitude ? msg.latitude : "N/A";
  longitudeDiv.innerHTML = msg.longitude ? msg.longitude : "N/A";
}