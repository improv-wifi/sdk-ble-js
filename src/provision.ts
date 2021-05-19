import { IMPROV_BLE_SERVICE } from "./const";
import "./provision-dialog";

const DEBUG = true;

export const startProvisioning = async () => {
  let device: BluetoothDevice | undefined;
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [IMPROV_BLE_SERVICE] }],
    });
  } catch (err) {
    if (!DEBUG) {
      return;
    }
  }

  if (DEBUG && !device) {
    device = {
      gatt: {
        connected: true,
        disconnect() {},
        async getPrimaryService() {
          return {
            async getCharacteristic() {
              return {
                startNotifications() {},
                addEventListener() {},
                stopNotifications() {},
                writeValueWithoutResponse() {},
                readValue() {},
              };
            },
          };
        },
      },
      addEventListener() {},
      watchAdvertisements() {},
      unwatchAdvertisements() {},
    } as any as BluetoothDevice;
  }

  if (!device) {
    return;
  }

  const el = document.createElement("improv-wifi-provision-dialog");
  el.device = device;
  document.body.appendChild(el);
};
