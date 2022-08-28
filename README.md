## Aircraft radar system JavaScript

![Demo of the airplanes tracker. After clicking on a button to start the connection with the RTL-SDR USB device, live data from an airplane is being displayed on the screen, include raw latitude, longitude, altitude.](https://res.cloudinary.com/devdevcharlie/image/upload/v1661321970/rtl-sdr-tracking-live-demo-3_b61gv6.gif)

This project uses the [Web USB API](https://developer.mozilla.org/en-US/docs/Web/API/USB), a [RTL-SDR dongle + antenna](https://www.rtl-sdr.com/buy-rtl-sdr-dvb-t-dongles/) and some vanilla JS code.

If you'd like to learn more about how I built it, you can check out the [blog post](https://charliegerard.dev/blog/aircraft-radar-system-rtl-sdr-web-usb).

## How to run

As it doesn't use any front-end framework, you can start it quickly by running: 

```bash
python -m http.server 8000
```

## Credits

This project probably wouldn't have been possible if I hadn't come across [AirplaneJS](https://github.com/watson/airplanejs) and [rtl-sdr](https://github.com/watson/rtl-sdr) by [Thomas Watson](https://github.com/watson) and [rtlsdrjs](https://github.com/sandeepmistry/rtlsdrjs) by [Sandeep Mistry](https://github.com/sandeepmistry). 
