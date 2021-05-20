import { IMPROV_BLE_SERVICE } from "./const";
import "./provision-dialog";

export const startProvisioning = async () => {
  let device: BluetoothDevice | undefined;
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [IMPROV_BLE_SERVICE] }],
    });
  } catch (err) {
    console.error("Failed to get device", err);
  }

  if (!device) {
    return;
  }

  const el = document.createElement("improv-wifi-provision-dialog");
  el.device = device;
  document.body.appendChild(el);
};
