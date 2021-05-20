# JavaScript SDK for Improv Wi-Fi

## Installation

You can use the JavaScript SDK by adding the following HTML to your website:

```html
<script type="module" src="https://www.improv-wifi.com/sdk-js/launch-button.js"></script>
```

If you are using a bundler and JavaScript package manager, you can install the SDK via NPM:

```
npm install --save improv-wifi-sdk
```

And then import it in your code:

```
import 'improv-wifi-sdk';
```

## Usage

Add the following to your website to show a button to start the provisioning process:

```html
<improv-wifi-launch-button></improv-wifi-launch-button>
```

A warning message will be rendered if the browser does not support WebBluetooth.

It is possible to customize the button and the message. You do this by putting your elements inside the `<improv-wifi-launch-button>` element and adding the appropriate `slot` attribute. Use `activate` to replace the activation button and `unsupported` to replace the unsupported message:

```html
<improv-wifi-launch-button>
  <button slot='activate'>Start provisioning!</button>
  <span slot='unsupported'>Your browser does not support provisioning.</span>
</improv-wifi-launch-button>
```

## Browser Support

This SDK requires a browser with support for WebBluetooth. Currently this is supported by Google Chrome, Microsoft Edge and other browsers based on the Blink engine.

No iOS devices are supported.
