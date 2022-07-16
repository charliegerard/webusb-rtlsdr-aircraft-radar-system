function change_region(v) { }
function change_type(v) { }

const sample_rate = 2400000;
const freq_bins = 1024;
const freq_spacing = sample_rate / freq_bins;
var current_freq = 106400000;

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
        set_center_freq(freq)
            .then(actual => {
                current_freq = actual;
                document.getElementById("actual-freq").innerHTML = actual + " Hz";
                freq_busy = false;
                if (freq_next != undefined) {
                    let next = freq_next;
                    freq_next = undefined;
                    change_freq(next);
                }
            }, e => {
                freq_busy = false;
                handle_error(e);
            });
    }
}

var down = false;
var start_pos;
var start_freq;

function mouseMove(e) {
    if (down) {
        let dist = start_pos - e.clientX;
        let freq = start_freq + dist * freq_spacing;
        freq = Math.min(Math.max(freq, 88000000), 108000000);
        if (Math.abs(freq - current_freq) > freq_spacing) {
            change_freq(freq);
        }
    }
}

function mouseDown(e) {
    start_pos = e.clientX;
    start_freq = current_freq;
    down = true;
}

function mouseUp(e) {
    start_pos = undefined;
    start_freq = undefined;
    down = false;
}

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
    return rtl.powerUp()
        .then(update_status)
        .then(() => rtl.setSampleRate(sample_rate))
        .then(actual => console.log("rate: " + actual))
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
    navigator.usb.requestDevice({ filters: filters })
        .then(powerUp).then(() => {
            button.innerHTML = "Disconnect";
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
    if (button.innerHTML == "Connect")
        return;

    // pointless, browser not waiting for promises to finish:
    // disconnect(button);

    // so we have to annoy the user:
    event.preventDefault();
    event.returnValue = "Don't forget to disconnect.";
}
window.addEventListener('beforeunload', leaving);

function toggle_device(button) {
    if (button.innerHTML == "Connect")
        connect(button);
    else
        disconnect(button);
}

navigator.usb.getDevices()
    .then(devices => {
        let device;
        filters.forEach(f => {
            devices.forEach(d => {
                if (device == undefined &&
                    d.vendorId == f.vendorId &&
                    d.productId == f.productId)
                    device = d;
            });
        });
        if (device != undefined) {
            return powerUp(device).then(() => {
                let button = document.getElementById("device-toggle");
                button.innerHTML = "Disconnect";
            });
        }
    }).catch(handle_error);

function toggle_rainbow() { }
function toggle_phosphor() { }
function toggle_background() { }

// WebAssembly.instantiateStreaming(fetch("example.wasm"))
// WebAssembly.instantiate(fetch("http://localhost:3000/test/example.wasm"))
//     .then(obj => {
//         const wasm = obj.instance.exports;
//         const buffer = wasm.memory.buffer;
//         wasm.__wasm_call_ctors();
//         wasm._start();
//         wasm.change_irate(sample_rate);

//         change_type = wasm.change_type;
//         toggle_rainbow = wasm.toggle_rainbow;
//         toggle_phosphor = wasm.toggle_phosphor;
//         toggle_background = () => {
//             const style = document.body.style;
//             if (style.backgroundColor == "black") {
//                 wasm.change_color(0);
//                 style.color = "black";
//                 style.backgroundColor = "white";
//             } else {
//                 wasm.change_color(0x00ffffff);
//                 style.color = "white";
//                 style.backgroundColor = "black";
//             }
//         }

//         const length = wasm.input_length();
//         var input = new Uint8Array(buffer, wasm.input_pointer(), 2 * length);
//         function feed_input() {
//             read_samples(length).then(buf => {
//                 let tmp = new Uint8Array(buf);
//                 for (let i = 0; i < 2 * length; ++i)
//                     input[i] = tmp[i];
//                 wasm.process_input();
//                 feed_input();
//             }, () => {
//                 window.requestAnimationFrame(feed_input);
//             });
//         }
//         for (let i = 0; i < 10; ++i)
//             feed_input();

//         var scope_rgba = new Uint8ClampedArray(buffer, wasm.scope_pointer(), 4 * wasm.scope_length());
//         var scope_image = new ImageData(scope_rgba, wasm.scope_width(), wasm.scope_height());
//         const scope_canvas = document.getElementById("scope");
//         scope_canvas.width = 32 + wasm.scope_width();
//         scope_canvas.height = 32 + wasm.scope_height();
//         const scope_ctx = scope_canvas.getContext("2d");

//         var spectrum_rgba = new Uint8ClampedArray(buffer, wasm.spectrum_pointer(), 4 * wasm.spectrum_length());
//         var spectrum_image = new ImageData(spectrum_rgba, wasm.spectrum_width(), wasm.spectrum_height());
//         const spectrum_canvas = document.getElementById("spectrum");
//         spectrum_canvas.width = 32 + wasm.spectrum_width();
//         spectrum_canvas.height = 32 + wasm.spectrum_height();
//         const spectrum_ctx = spectrum_canvas.getContext("2d");

//         var spectrogram_rgba = new Uint8ClampedArray(buffer, wasm.spectrogram_pointer(), 4 * wasm.spectrogram_length());
//         var spectrogram_image = new ImageData(spectrogram_rgba, wasm.spectrogram_width(), wasm.spectrogram_height());
//         const spectrogram_canvas = document.getElementById("spectrogram");
//         spectrogram_canvas.width = 32 + wasm.spectrogram_width();
//         spectrogram_canvas.height = 32 + wasm.spectrogram_height();
//         const spectrogram_ctx = spectrogram_canvas.getContext("2d");

//         var animate = timestamp => {
//             scope_ctx.putImageData(scope_image, 16, 16);
//             spectrum_ctx.putImageData(spectrum_image, 16, 16);
//             spectrogram_ctx.putImageData(spectrogram_image, 16, 16);
//             window.requestAnimationFrame(animate);
//         }
//         window.requestAnimationFrame(animate);

//         var context = new AudioContext();
//         var processor = context.createScriptProcessor(0, 0, 2);
//         wasm.change_orate(context.sampleRate);
//         wasm.change_region(1);
//         change_region = wasm.change_region;
//         var output = new Float32Array(buffer, wasm.output_pointer(), 2 * wasm.output_length());
//         processor.onaudioprocess = e => {
//             let real = e.outputBuffer.getChannelData(0);
//             let imag = e.outputBuffer.getChannelData(1);
//             for (let i = 0; i < real.length; ++i) {
//                 real[i] = output[2 * i + 0];
//                 imag[i] = output[2 * i + 1];
//             }
//             wasm.consumed_output(real.length);
//         };
//         processor.connect(context.destination);
//     });

