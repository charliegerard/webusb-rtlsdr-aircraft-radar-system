let device;
import { Demodulator } from "./demodulator.js";
let button = document.querySelector("button");
let introSection = document.querySelector('.intro');
let mainSection = document.querySelector('.app');
let waitingMessage = document.querySelector('.blink-me');
let decoder;

const demodulator = new Demodulator();

button.onclick = () => {
    navigator.usb
        .requestDevice({
            filters: [
                {
                    vendorId: 0x0bda,
                    productId: 0x2838,
                }
            ],
        })
        .then((selectedDevice) => {
            device = selectedDevice;
            return device.open(); // Begin a session.
        })
        .then(() => device.selectConfiguration(1)) // Select configuration #1 for the device.
        .then(() => {
            introSection.style.display = "none";
            mainSection.style.display = "block";
            return device.claimInterface(0)
        })
        .then(() => {
            return readLoop();
        })
        .catch((error) => {
            console.error(error);
        });
};

const onMsg = (msg) => {
    if (!msgReceived) {
        waitingMessage.style.display = "none";
        msgReceived = true;
    }

    displayAircraftData(msg);
}

let started = false;
let msgReceived = false;

const readLoop = () => {
    device
        .transferIn(1, 262144)
        // .transferIn(1, 256000) 
        .then((result) => {
            if (!started) {
                console.log('starting...')
                started = true
            }

            const data = new Uint8Array(result.data.buffer);
            demodulator.process(data, 256000, onMsg)

            readLoop();
        })
        .catch((ee) => console.log(ee));
};

let msgString = '';
let msgsArray = [];

const displayAircraftData = msg => {
    // let message = {
    //     "msgbits": 112,
    //     "msgtype": 17,
    //     "crcOk": true,
    //     "crc": 5939971,
    //     "errorbit": 81,
    //     "icao": 10652204,
    //     "phaseCorrected": false,
    //     "ca": 5,
    //     "metype": 11,
    //     "mesub": 0,
    //     "headingIsValid": null,
    //     "heading": null,
    //     "aircraftType": null,
    //     "fflag": 4,
    //     "tflag": 0,
    //     "rawLatitude": 102104,
    //     "rawLongitude": 975213,
    //     "callsign": "",
    //     "ewDir": null,
    //     "ewVelocity": null,
    //     "nsDir": null,
    //     "nsVelocity": null,
    //     "vertRateSource": null,
    //     "vertRateSign": null,
    //     "vertRate": null,
    //     "speed": null,
    //     "fs": 5,
    //     "dr": 20,
    //     "um": 20,
    //     "identity": 3302,
    //     "altitude": 4850,
    //     "unit": 0
    // }

    let message = msg;

    msgsArray.push(JSON.stringify(message));

    handleData(msgsArray)
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