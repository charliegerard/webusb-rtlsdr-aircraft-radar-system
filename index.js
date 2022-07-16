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
  if(msg.callsign){
    console.log('AIRCRAFT: ', msg.callsign)
    console.log('MESSAGE: ', msg)
  }
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
      demodulator.process(data, 256000, onMsg)
      
      readLoop();
    })
    .catch((ee) => console.log(ee));
};


