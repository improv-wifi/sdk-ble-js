import { IMPROV_BLE_SERVICE } from "./const";
import type { LaunchButton } from "./launch-button";
import { fireEvent } from "./util";

export const startProvisioning = async (button: LaunchButton) => {
  import("./provision-dialog");
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
  el.stateUpdateCallback = (state) => {
    fireEvent(button, "state-changed", state);
  };
  document.body.appendChild(el);
};
