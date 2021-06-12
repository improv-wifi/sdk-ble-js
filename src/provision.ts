import { IMPROV_BLE_SERVICE, State } from "./const";
import { LaunchButton } from "./launch-button";
import "./provision-dialog";
import { fireEvent } from "./util";

export const startProvisioning = async (button: LaunchButton) => {
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
  el.stateUpdateCallback = (state: State) => {
    fireEvent(button, "state-changed", { state });
  };
  document.body.appendChild(el);
};
