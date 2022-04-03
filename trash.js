const doTheWasmThing = async () => {
  // WebAssembly.instantiateStreaming(fetch("example.wasm"))
  const response = await fetch("example.wasm");
  const buffer = await response.arrayBuffer();
  WebAssembly.instantiate(buffer).then((obj) => {
    const wasm = obj.instance.exports;
    const buffer = wasm.memory.buffer;
    wasm.__wasm_call_ctors();
    wasm._start();
    wasm.change_irate(sample_rate);

    change_type = wasm.change_type;
    toggle_rainbow = wasm.toggle_rainbow;
    toggle_phosphor = wasm.toggle_phosphor;
    toggle_background = () => {
      const style = document.body.style;
      if (style.backgroundColor == "black") {
        wasm.change_color(0);
        style.color = "black";
        style.backgroundColor = "white";
      } else {
        wasm.change_color(0x00ffffff);
        style.color = "white";
        style.backgroundColor = "black";
      }
    };

    const length = wasm.input_length();
    console.log("LENGTH", length);
    var input = new Uint8Array(buffer, wasm.input_pointer(), 2 * length);
    function feed_input() {
      read_samples(length).then(
        (buf) => {
          let tmp = new Uint8Array(buf);
          // console.log('here')
          for (let i = 0; i < 2 * length; ++i) input[i] = tmp[i];
          wasm.process_input();
          feed_input();
        },
        () => {
          window.requestAnimationFrame(feed_input);
        }
      );
    }
    for (let i = 0; i < 10; ++i) feed_input();

    var scope_rgba = new Uint8ClampedArray(
      buffer,
      wasm.scope_pointer(),
      4 * wasm.scope_length()
    );
    var scope_image = new ImageData(
      scope_rgba,
      wasm.scope_width(),
      wasm.scope_height()
    );
    const scope_canvas = document.getElementById("scope");
    scope_canvas.width = 32 + wasm.scope_width();
    scope_canvas.height = 32 + wasm.scope_height();
    const scope_ctx = scope_canvas.getContext("2d");

    var spectrum_rgba = new Uint8ClampedArray(
      buffer,
      wasm.spectrum_pointer(),
      4 * wasm.spectrum_length()
    );
    var spectrum_image = new ImageData(
      spectrum_rgba,
      wasm.spectrum_width(),
      wasm.spectrum_height()
    );
    const spectrum_canvas = document.getElementById("spectrum");
    spectrum_canvas.width = 32 + wasm.spectrum_width();
    spectrum_canvas.height = 32 + wasm.spectrum_height();
    const spectrum_ctx = spectrum_canvas.getContext("2d");

    var spectrogram_rgba = new Uint8ClampedArray(
      buffer,
      wasm.spectrogram_pointer(),
      4 * wasm.spectrogram_length()
    );
    var spectrogram_image = new ImageData(
      spectrogram_rgba,
      wasm.spectrogram_width(),
      wasm.spectrogram_height()
    );
    const spectrogram_canvas = document.getElementById("spectrogram");
    spectrogram_canvas.width = 32 + wasm.spectrogram_width();
    spectrogram_canvas.height = 32 + wasm.spectrogram_height();
    const spectrogram_ctx = spectrogram_canvas.getContext("2d");

    var animate = (timestamp) => {
      scope_ctx.putImageData(scope_image, 16, 16);
      spectrum_ctx.putImageData(spectrum_image, 16, 16);
      spectrogram_ctx.putImageData(spectrogram_image, 16, 16);
      window.requestAnimationFrame(animate);
    };
    window.requestAnimationFrame(animate);

    var context = new AudioContext();
    var processor = context.createScriptProcessor(0, 0, 2);
    wasm.change_orate(context.sampleRate);
    wasm.change_region(1);
    change_region = wasm.change_region;
    var output = new Float32Array(
      buffer,
      wasm.output_pointer(),
      2 * wasm.output_length()
    );
    processor.onaudioprocess = (e) => {
      let real = e.outputBuffer.getChannelData(0);
      let imag = e.outputBuffer.getChannelData(1);
      for (let i = 0; i < real.length; ++i) {
        real[i] = output[2 * i + 0];
        imag[i] = output[2 * i + 1];
      }
      wasm.consumed_output(real.length);
    };
    processor.connect(context.destination);
  });
};

// doTheWasmThing()
