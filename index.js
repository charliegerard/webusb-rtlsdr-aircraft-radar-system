let device;

let button = document.querySelector("button");
let decoder;

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
    }) // Waiting for 64 bytes of data from endpoint #5.
    .catch((error) => {
      console.error(error);
    });
};

const readLoop = () => {
  console.log("here");
  device
    // .transferIn(1, 112)
    .transferIn(1, 128)
    .then((result) => {
      console.log("hellooo", result.data);
      const test = new Uint8Array(result.data.buffer);
      console.log("test", test);
      decoder = new TextDecoder();
      console.log("Received: " + decoder.decode(result.data));
      readLoop();
    })
    .catch((ee) => console.log(ee));
};
