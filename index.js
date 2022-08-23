let device;
import { Demodulator } from "./demodulator.js";
let button = document.querySelector("button");
let introSection = document.querySelector('.intro');
let mainSection = document.querySelector('.app');
let waitingMessage = document.querySelector('.blink-me');
let previousPlaneDetectedIcao;
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
        .then(() => {
            introSection.style.display = "none";
            mainSection.style.display = "block";
            // displayAircraftData();
            return device.claimInterface(0)
        }) // Request exclusive control over interface #2.
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

    // if (previousPlaneDetectedIcao !== msg.icao) {
    displayAircraftData(msg);
    // previousPlaneDetectedIcao = msg.icao;
    // }
    // if (msg.callsign) {
    // console.log('AIRCRAFT: ', msg.callsign)
    // }

    // displayAircraftData(msg);
}

let started = false;
let msgReceived = false;

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

let msgString = '';

const displayAircraftData = msg => {
    // let message = {
    //     aircraftType: null,
    //     altitude: null,
    //     ca: 5,
    //     callsign: "",
    //     crc: 16033899,
    //     crcOk: true,
    //     dr: 20,
    //     errorbit: -1,
    //     ewDir: null,
    //     ewVelocity: null,
    //     fflag: null,
    //     fs: 5,
    //     heading: null,
    //     headingIsValid: null,
    //     icao: 10939975,
    //     identity: 3426,
    //     mesub: 4,
    //     metype: 30,
    //     msgbits: 56,
    //     msgtype: 11,
    //     nsDir: null,
    //     nsVelocity: null,
    //     phaseCorrected: false,
    //     rawLatitude: null,
    //     rawLongitude: null,
    //     speed: null,
    //     tflag: null,
    //     um: 55,
    //     unit: null,
    //     vertRate: null,
    //     vertRateSign: null,
    //     vertRateSource: null,
    // }

    let message = msg;

    let keys = Object.keys(message);
    keys = keys.filter(k => k !== 'msg');


    keys.map(k => {
        msgString += `${k}: ${message[k]},`;
    });

    showText(".data", msgString, 0, 20);

}

var showText = function (target, message, index, interval) {
    if (index < message.length) {
        document.querySelector('.data').append(`${message[index++]}`);

        if (message[index] === ",") {
            document.querySelector('.data').append(`${message[index++]}`);
            document.querySelector('.data').innerHTML += "</br>";
        }
        document.querySelector('.data').scrollTop = document.querySelector('.data').scrollHeight;

        setTimeout(function () { showText(target, message, index, interval); }, interval);
    }
}