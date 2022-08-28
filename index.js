let readSamples = true;
import { Demodulator } from "./demodulator.js";
let button = document.querySelector("button");
let introSection = document.querySelector('.intro');
let mainSection = document.querySelector('.app');
let waitingMessage = document.querySelector('.blink-me');
let msgString = '';
let msgsArray = [];
let started = false;
let msgReceived = false;

const demodulator = new Demodulator();

async function start() {
    const sdr = await RtlSdr.requestDevice();
    introSection.style.display = "none";
    mainSection.style.display = "block";

    await sdr.open({
        ppm: 0.5
    });

    const actualSampleRate = await sdr.setSampleRate(2000000);
    const actualCenterFrequency = await sdr.setCenterFrequency(1090000000);

    await sdr.resetBuffer();

    while (readSamples) {
        if (!started) {
            console.log('starting...')
            started = true
        }

        // const samples = await sdr.readSamples(16 * 16384);
        const samples = await sdr.readSamples(128000);
        // console.log(samples)

        const data = new Uint8Array(samples);
        // console.log(data)

        demodulator.process(data, 256000, onMsg)
    }
}

const onMsg = (msg) => {
    if (!msgReceived) {
        waitingMessage.style.display = "none";
        msgReceived = true;
    }
    displayAircraftData(msg);
}


const displayAircraftData = msg => {
    let message = msg;
    msgsArray.push(JSON.stringify(message));
    handleData(msgsArray);
}

let msgIndex = 0;
let previousIndex;

const handleData = array => {
    if (msgIndex !== previousIndex) {
        let msg = JSON.parse(array[msgIndex]);

        let keys = Object.keys(msg);
        keys = keys.filter(k => k !== 'msg');

        keys.map(k => {
            msgString += `${k}: ${msg[k]},`;
        });

        showText(".data", msgString, 0, 20);

        previousIndex = msgIndex;
    }
}

let timer;

var showText = function (target, message, index, interval) {

    if (index < message.length) {
        document.querySelector('.data').append(`${message[index++]}`);

        if (message[index] === ",") {
            document.querySelector('.data').append(`${message[index++]}`);
            document.querySelector('.data').innerHTML += "</br>";
        }
        document.querySelector('.data').scrollTop = document.querySelector('.data').scrollHeight;

        timer = setTimeout(function () {
            showText(target, message, index, interval);
        }, interval);
    } else {
        clearTimeout(timer);
        msgIndex++;
    }
}

button.onclick = () => start();