import { Demodulator } from "./demodulator.js";
function change_region(v) { }
function change_type(v) { }

// const sample_rate = 2400000; // radio
const sample_rate = 2000000; // planes
const freq_bins = 1024;
const freq_spacing = sample_rate / freq_bins;
// var current_freq = 106400000; // radio
var current_freq = 1090000000; // planes

let gettingData = false;

const connectButton = document.getElementById("device-toggle");

connectButton.onclick = () => toggle_device(connectButton);

function not_connected() {
  return Promise.reject("Not connected");
}

var read_samples = not_connected;
var set_center_freq = not_connected;

var freq_next;
var freq_busy = false;

function change_freq(freq) {
  if (freq_busy) {
    freq_next = freq;
  } else {
    freq_busy = true;
    set_center_freq(freq).then(
      (actual) => {
        current_freq = actual;
        document.getElementById("actual-freq").innerHTML = actual + " Hz";
        freq_busy = false;
        if (freq_next != undefined) {
          let next = freq_next;
          freq_next = undefined;
          change_freq(next);
        }
      },
      (e) => {
        freq_busy = false;
        handle_error(e);
      }
    );
  }
}

var down = false;
var start_pos;
var start_freq;

function update_status(e) {
  console.log(String(e));
  document.getElementById("status-bar").innerHTML = String(e);
}

function handle_error(e) {
  console.error(String(e));
  document.getElementById("status-bar").innerHTML = String(e);
}

var rtl;

function powerUp(device) {
  rtl = new RTL2832U(device);
  return rtl
    .powerUp()
    .then(update_status)
    .then(() => rtl.setSampleRate(sample_rate))
    .then((actual) => console.log("rate: " + actual))
    .then(() => {
      rtl.resetBuffer();
      read_samples = rtl.readSamples;
      set_center_freq = rtl.setCenterFrequency;
      change_freq(current_freq);
    });
}

const filters = [
  { vendorId: 0x0bda, productId: 0x2832 },
  { vendorId: 0x0bda, productId: 0x2838 },
];

function connect(button) {
  navigator.usb
    .requestDevice({ filters: filters })
    .then(powerUp)
    .then(() => {
      button.innerHTML = "Disconnect";
      console.log("IN CONNECT");
      console.log(gettingData)
      if (!gettingData) {
        getData();
      }
    }, handle_error);
}

function disconnect(button) {
  button.innerHTML = "Connect";
  update_status("Disconnected");
  read_samples = not_connected;
  set_center_freq = not_connected;
  rtl.shutDown().catch(handle_error);
}

function leaving(event) {
  button = document.getElementById("device-toggle");

  if (button.innerHTML == "Connect") return;

  // pointless, browser not waiting for promises to finish:
  // disconnect(button);

  // so we have to annoy the user:
  event.preventDefault();
  event.returnValue = "Don't forget to disconnect.";
}
window.addEventListener("beforeunload", leaving);

function toggle_device(button) {
  if (button.innerHTML == "Connect") connect(button);
  else disconnect(button);
}

navigator.usb
  .getDevices()
  .then((devices) => {
    let device;
    filters.forEach((f) => {
      devices.forEach((d) => {
        if (
          device == undefined &&
          d.vendorId == f.vendorId &&
          d.productId == f.productId
        )
          device = d;
      });
    });
    if (device != undefined) {
      return powerUp(device).then(() => {
        let button = document.getElementById("device-toggle");
        button.innerHTML = "Disconnect";
        if (!gettingData) {
          getData();
        }
      });
    }
  })
  .catch(handle_error);

const getData = () => {
  // gettingData = true;
  // read_samples(32768).then(
  // read_samples(33282).then(
  read_samples(112).then(
    (buf) => {
      let tmp = new Uint8Array(buf);
      console.log(tmp)
      processData(tmp);
      // getData();
    },
    () => {
      window.requestAnimationFrame(getData);
    }
  );
};

const demodulator = new Demodulator();

const processData = (data) => {
  console.log("data", data);
  console.log("here");
  // let bufferSize = 112;
  let bufferSize = 262144;
  demodulator.process(data, bufferSize, (msg) => {
    console.log("BOO", msg);
    //   store.addMessage(msg);
  });
};
