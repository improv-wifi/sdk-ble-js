// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real @material/web elements rely on ElementInternals, which happy-dom
// does not implement, so they are replaced by lightweight stand-ins below.
vi.mock("@material/web/button/outlined-button.js", () => ({}));
vi.mock("@material/web/button/filled-button.js", () => ({}));
vi.mock("@material/web/button/filled-tonal-button.js", () => ({}));
vi.mock("@material/web/dialog/dialog.js", () => ({}));
vi.mock("@material/web/progress/circular-progress.js", () => ({}));
vi.mock("@material/web/textfield/outlined-text-field.js", () => ({}));
vi.mock("@material/web/chips/chip-set.js", () => ({}));
vi.mock("@material/web/chips/filter-chip.js", () => ({}));
vi.mock("@material/web/select/select-option.js", () => ({}));
vi.mock("@material/web/select/outlined-select.js", () => ({}));
vi.mock("@material/web/icon/icon.js", () => ({}));
vi.mock("@material/web/iconbutton/outlined-icon-button.js", () => ({}));

const fakes = vi.hoisted(() => ({
  clients: [] as any[],
  configure: undefined as undefined | ((client: any) => void),
}));

vi.mock("../src/ble", async (importActual) => {
  const actual = await importActual<typeof import("../src/ble")>();
  class FakeBLE extends EventTarget {
    currentState: number | undefined = undefined;
    errorState = 0;
    capabilities = 0;
    deviceInfo: unknown = undefined;
    wifiNetworks: unknown[] = [];
    nextUrl: string | undefined = undefined;
    name: string | undefined = "My Device";
    initialize = vi.fn(async () => {});
    close = vi.fn();
    identify = vi.fn();
    provision = vi.fn(async (_ssid: string, _password: string) => {});
    scanWifiNetworks = vi.fn(async () => {});
    constructor(
      public device: unknown,
      public logger: unknown,
    ) {
      super();
      fakes.clients.push(this);
      fakes.configure?.(this);
    }
  }
  return { ...actual, ImprovBluetoothLE: FakeBLE };
});

import {
  ImprovBluetoothDeviceInfo,
  ImprovBluetoothWifiNetwork,
} from "../src/ble";

class StandInTextField extends HTMLElement {
  value = "";
  updateComplete: Promise<boolean> = Promise.resolve(true);
  focus(): void {}
}
class StandInSelect extends HTMLElement {
  selectedIndex = 0;
  updateComplete: Promise<boolean> = Promise.resolve(true);
  focus(): void {}
}
customElements.define("md-outlined-text-field", StandInTextField);
customElements.define("md-outlined-select", StandInSelect);

// Importing the module registers the custom element.
await import("../src/provision-dialog");

const AUTH_REQUIRED = 1;
const AUTHORIZED = 2;
const PROVISIONING = 3;
const PROVISIONED = 4;

const CAP_IDENTIFY = 1;
const CAP_WIFI_SCAN = 4;

interface Mounted {
  el: any;
  client: any;
  cb: ReturnType<typeof vi.fn>;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function settle(el: any): Promise<void> {
  await el.updateComplete;
  await tick();
  await el.updateComplete;
  await tick();
}

async function mount(
  configure?: (client: any) => void,
  device: unknown = { name: "dev" },
): Promise<Mounted> {
  fakes.configure = configure;
  const cb = vi.fn();
  const el: any = document.createElement("improv-wifi-provision-dialog");
  el.device = device;
  el.stateUpdateCallback = cb;
  document.body.appendChild(el);
  await settle(el);
  return { el, client: fakes.clients[fakes.clients.length - 1], cb };
}

const q = (el: any, selector: string): any =>
  el.shadowRoot.querySelector(selector);
const qa = (el: any, selector: string): any[] =>
  Array.from(el.shadowRoot.querySelectorAll(selector));
const text = (el: any): string =>
  (el.shadowRoot.textContent as string).replace(/\s+/g, " ");
const button = (el: any, label: string): any =>
  qa(el, "md-outlined-button, md-filled-button").find(
    (b) => b.textContent.trim() === label,
  );

const authorized = (client: any): void => {
  client.currentState = AUTHORIZED;
};

beforeEach(() => {
  fakes.clients.length = 0;
  fakes.configure = undefined;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("connecting and errors", () => {
  it("shows progress while connecting and no heading without a name", async () => {
    const { el, client, cb } = await mount((c) => {
      c.name = undefined;
      c.initialize = vi.fn(() => new Promise<void>(() => {}));
    });
    expect(text(el)).toContain("Connecting");
    expect(q(el, "md-circular-progress")).not.toBeNull();
    expect(q(el, "[slot=actions]")).toBeNull();
    expect(q(el, "[slot=headline]").textContent.trim()).toBe("");
    expect(client.initialize).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ state: "CONNECTING" });
  });

  it("uses the same client for the lifetime of the element", async () => {
    const { el } = await mount((c) => authorized(c));
    el.requestUpdate();
    await settle(el);
    expect(fakes.clients).toHaveLength(1);
    expect(fakes.clients[0].device).toEqual({ name: "dev" });
  });

  it("shows an error when connecting fails and closes via the action", async () => {
    const { el, client, cb } = await mount((c) => {
      c.initialize = vi.fn(async () => {
        throw new Error("boom");
      });
    });
    expect(text(el)).toContain("An error occurred. boom");
    expect(text(el)).toContain("My Device");
    expect(cb).toHaveBeenLastCalledWith({ state: "ERROR" });

    button(el, "Close").click();
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(el.isConnected).toBe(false);
  });

  it("closes and removes itself when the dialog emits close", async () => {
    const { el, client } = await mount((c) => authorized(c));
    q(el, "md-dialog").dispatchEvent(new Event("close"));
    expect(client.close).toHaveBeenCalledTimes(1);
    expect(el.isConnected).toBe(false);
  });

  it("reports disconnects as an error while connecting", async () => {
    const { el, client, cb } = await mount((c) => {
      c.initialize = vi.fn(() => new Promise<void>(() => {}));
    });
    client.dispatchEvent(new CustomEvent("disconnect"));
    await settle(el);
    expect(text(el)).toContain("An error occurred. Device disconnected.");
    expect(cb).toHaveBeenLastCalledWith({ state: "ERROR" });
  });

  it("reports disconnects as an error when not provisioned", async () => {
    const { el, client } = await mount((c) => authorized(c));
    client.dispatchEvent(new CustomEvent("disconnect"));
    await settle(el);
    expect(text(el)).toContain("An error occurred. Device disconnected.");
  });

  it("ignores disconnects once provisioned", async () => {
    const { el, client } = await mount((c) => {
      c.currentState = PROVISIONED;
    });
    client.dispatchEvent(new CustomEvent("disconnect"));
    await settle(el);
    expect(text(el)).toContain("Provisioned!");
    expect(text(el)).not.toContain("An error occurred");
  });

  it("updates the callback only for state changes", async () => {
    const { el, client, cb } = await mount((c) => {
      c.initialize = vi.fn(() => new Promise<void>(() => {}));
    });
    client.dispatchEvent(new CustomEvent("disconnect"));
    await settle(el);
    cb.mockClear();
    // Only an unrelated property changes while in the ERROR state.
    client.errorState = 5;
    client.dispatchEvent(new CustomEvent("error-changed"));
    await settle(el);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("improv states", () => {
  it("asks the user to press the authorize button", async () => {
    const { el, cb } = await mount((c) => {
      c.currentState = AUTH_REQUIRED;
    });
    expect(text(el)).toContain("Press the authorize button on the device");
    expect(q(el, "[slot=actions]")).toBeNull();
    expect(cb).toHaveBeenLastCalledWith({ state: "AUTHORIZATION_REQUIRED" });
  });

  it("shows provisioning progress", async () => {
    const { el, cb } = await mount((c) => {
      c.currentState = PROVISIONING;
    });
    expect(text(el)).toContain("Provisioning");
    expect(q(el, "md-circular-progress")).not.toBeNull();
    expect(cb).toHaveBeenLastCalledWith({ state: "PROVISIONING" });
  });

  it("shows provisioned without a next url", async () => {
    const { el, cb } = await mount((c) => {
      c.currentState = PROVISIONED;
    });
    expect(text(el)).toContain("Provisioned!");
    expect(button(el, "Close")).toBeDefined();
    expect(button(el, "Next")).toBeUndefined();
    expect(cb).toHaveBeenLastCalledWith({ state: "PROVISIONED" });
  });

  it("shows provisioned with a next url", async () => {
    const { el } = await mount((c) => {
      c.currentState = PROVISIONED;
      c.nextUrl = "http://device.local/";
    });
    const next = button(el, "Next");
    expect(next.getAttribute("href")).toBe("http://device.local/");
    expect(button(el, "Close")).toBeDefined();
  });

  it("shows an unexpected state message with an unknown improv state", async () => {
    const { el, cb } = await mount((c) => {
      c.currentState = undefined;
    });
    expect(text(el)).toContain("Unexpected state: IMPROV-STATE - undefined");
    expect(button(el, "Close")).toBeDefined();
    expect(cb).toHaveBeenLastCalledWith({ state: "UNKNOWN" });
  });

  it("follows state-changed events from the client", async () => {
    const { el, client, cb } = await mount((c) => {
      c.currentState = AUTH_REQUIRED;
    });
    client.currentState = PROVISIONING;
    client.dispatchEvent(new CustomEvent("state-changed"));
    await settle(el);
    expect(text(el)).toContain("Provisioning");
    expect(cb).toHaveBeenLastCalledWith({ state: "PROVISIONING" });
  });

  it("state-changed while still connecting switches to improv state", async () => {
    const { el, client, cb } = await mount((c) => {
      c.initialize = vi.fn(() => new Promise<void>(() => {}));
    });
    client.currentState = AUTH_REQUIRED;
    client.dispatchEvent(new CustomEvent("state-changed"));
    await settle(el);
    expect(text(el)).toContain("Press the authorize button");
    expect(cb).toHaveBeenLastCalledWith({ state: "AUTHORIZATION_REQUIRED" });
  });
});

describe("authorized view", () => {
  it("renders the form without identify or network scanning", async () => {
    const { el, cb } = await mount((c) => {
      authorized(c);
      c.capabilities = 0;
    });
    expect(text(el)).toContain("Configure Wi-Fi");
    expect(text(el)).toContain("My Device to connect to");
    expect(button(el, "Identify")).toBeUndefined();
    expect(button(el, "Close")).toBeDefined();
    expect(button(el, "Connect")).toBeDefined();
    expect(q(el, "md-outlined-select")).toBeNull();
    expect(q(el, "md-outlined-text-field[name=ssid]")).not.toBeNull();
    expect(q(el, "md-outlined-text-field[name=password]")).not.toBeNull();
    expect(q(el, ".device-info")).toBeNull();
    expect(q(el, "p.error")).toBeNull();
    expect(cb).toHaveBeenLastCalledWith({ state: "AUTHORIZED" });
  });

  it("falls back to a generic device name", async () => {
    const { el } = await mount((c) => {
      authorized(c);
      c.name = undefined;
    });
    expect(text(el)).toContain("your device to connect to");
  });

  it("shows the identify button and calls identify", async () => {
    const { el, client } = await mount((c) => {
      authorized(c);
      c.capabilities = CAP_IDENTIFY;
    });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button(el, "Identify").dispatchEvent(event);
    expect(client.identify).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("identify works without an event", async () => {
    const { el, client } = await mount((c) => authorized(c));
    el._identify();
    expect(client.identify).toHaveBeenCalledTimes(1);
  });

  it("renders full device info", async () => {
    const { el } = await mount((c) => {
      authorized(c);
      c.deviceInfo = new ImprovBluetoothDeviceInfo(
        "FirmwareX",
        "1.2.3",
        "ESP32-S3",
        "DeviceY",
        "OSName",
        "9.9",
      );
    });
    const info = text(el);
    expect(info).toContain("DeviceY");
    expect(info).toContain("FirmwareX");
    expect(info).toContain("1.2.3");
    expect(info).toContain("ESP32-S3");
    expect(info).toContain("OSName");
    expect(info).toContain("OS Version9.9");
  });

  it("omits null os name and version in device info", async () => {
    const { el } = await mount((c) => {
      authorized(c);
      c.deviceInfo = new ImprovBluetoothDeviceInfo(
        "FirmwareX",
        "1.2.3",
        "ESP32",
        "DeviceY",
        null,
        null,
      );
    });
    const rows = qa(el, ".device-info > div").map((d) => d.textContent.trim());
    expect(rows.some((r) => r.startsWith("OS"))).toBe(false);
    expect(rows.some((r) => r.startsWith("Firmware"))).toBe(true);
  });

  it("shows unable to connect error state", async () => {
    const { el, client } = await mount((c) => authorized(c));
    client.errorState = 3;
    client.dispatchEvent(new CustomEvent("error-changed"));
    await settle(el);
    expect(q(el, "p.error").textContent).toBe("Unable to connect");
  });

  it("shows an unknown error state", async () => {
    const { el, client } = await mount((c) => authorized(c));
    client.errorState = 0xff;
    client.dispatchEvent(new CustomEvent("error-changed"));
    await settle(el);
    expect(q(el, "p.error").textContent).toBe("Unknown error (255)");
  });

  it("shows an initial error state from the client", async () => {
    const { el } = await mount((c) => {
      authorized(c);
      c.errorState = 3;
    });
    expect(q(el, "p.error").textContent).toBe("Unable to connect");
  });

  it("toggles password visibility", async () => {
    const { el } = await mount((c) => authorized(c));
    expect(
      q(el, "md-outlined-text-field[name=password]").getAttribute("type"),
    ).toBe("password");
    const toggle = q(el, "md-icon-button");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    toggle.dispatchEvent(event);
    await settle(el);
    expect(event.defaultPrevented).toBe(true);
    expect(
      q(el, "md-outlined-text-field[name=password]").getAttribute("type"),
    ).toBe("text");
    expect(q(el, "md-icon-button").selected).toBe(true);
    q(el, "md-icon-button").click();
    await settle(el);
    expect(
      q(el, "md-outlined-text-field[name=password]").getAttribute("type"),
    ).toBe("password");
  });
});

describe("error-changed handling", () => {
  it("only clears busy on real errors", async () => {
    let release!: () => void;
    const { el, client } = await mount((c) => {
      authorized(c);
      c.provision = vi.fn(
        () => new Promise<void>((resolve) => (release = resolve)),
      );
    });
    q(el, "md-outlined-text-field[name=ssid]").value = "Home";
    button(el, "Connect").click();
    await settle(el);
    expect(text(el)).toContain("Provisioning");

    // No error: still busy.
    client.errorState = 0;
    client.dispatchEvent(new CustomEvent("error-changed"));
    await settle(el);
    expect(text(el)).toContain("Provisioning");

    // A real error ends the busy state.
    client.errorState = 3;
    client.dispatchEvent(new CustomEvent("error-changed"));
    await settle(el);
    expect(text(el)).toContain("Unable to connect");
    release();
    await settle(el);
  });
});

describe("provisioning", () => {
  it("requires a network name", async () => {
    const { el, client } = await mount((c) => authorized(c));
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button(el, "Connect").dispatchEvent(event);
    await settle(el);
    expect(event.defaultPrevented).toBe(true);
    expect(q(el, "p.error").textContent).toBe("Please enter a Network Name.");
    expect(client.provision).not.toHaveBeenCalled();
  });

  it("provisions using the typed network name and password", async () => {
    const { el, client } = await mount((c) => authorized(c));
    el._error = "old error";
    q(el, "md-outlined-text-field[name=ssid]").value = "HomeNet";
    q(el, "md-outlined-text-field[name=password]").value = "secret";
    button(el, "Connect").click();
    await settle(el);
    expect(client.provision).toHaveBeenCalledWith("HomeNet", "secret");
    expect(el._error).toBeUndefined();
    expect(el._busy).toBe(false);
    expect(q(el, "md-circular-progress")).toBeNull();
  });

  it("shows busy progress while provisioning is in flight", async () => {
    let release!: () => void;
    const { el } = await mount((c) => {
      authorized(c);
      c.provision = vi.fn(
        () => new Promise<void>((resolve) => (release = resolve)),
      );
    });
    q(el, "md-outlined-text-field[name=ssid]").value = "HomeNet";
    button(el, "Connect").click();
    await settle(el);
    expect(text(el)).toContain("Provisioning");
    expect(button(el, "Connect")).toBeUndefined();
    release();
    await settle(el);
    expect(text(el)).toContain("Configure Wi-Fi");
  });

  it("ignores a provision failure", async () => {
    const { el, client } = await mount((c) => {
      authorized(c);
      c.provision = vi.fn(async () => {
        throw new Error("nope");
      });
    });
    q(el, "md-outlined-text-field[name=ssid]").value = "HomeNet";
    button(el, "Connect").click();
    await settle(el);
    expect(client.provision).toHaveBeenCalled();
    expect(el._busy).toBe(false);
    expect(el._error).toBeUndefined();
  });

  it("uses the selected network when provisioning", async () => {
    const { el, client } = await mount((c) => {
      authorized(c);
      c.capabilities = CAP_WIFI_SCAN;
      c.wifiNetworks = [
        new ImprovBluetoothWifiNetwork("Alpha", -40, ["WPA2"]),
        new ImprovBluetoothWifiNetwork("Beta", -80, ["NO"]),
      ];
    });
    q(el, "md-outlined-text-field[name=password]").value = "pw";
    button(el, "Connect").click();
    await settle(el);
    expect(client.provision).toHaveBeenCalledWith("Alpha", "pw");
  });

  it("copes with a missing network name field", async () => {
    const { el, client } = await mount((c) => {
      c.initialize = vi.fn(() => new Promise<void>(() => {}));
    });
    const event = new Event("click", { cancelable: true });
    await el._provision(event);
    expect(event.defaultPrevented).toBe(true);
    expect(client.provision).not.toHaveBeenCalled();
  });
});

describe("wifi network list", () => {
  const networks = () => [
    new ImprovBluetoothWifiNetwork("n-full", -50, ["WPA"]),
    new ImprovBluetoothWifiNetwork("n-3bar", -60, ["WPA2", "WPA2 EAP"]),
    new ImprovBluetoothWifiNetwork("n-2bar", -70, ["WPA3", "WAPI"]),
    new ImprovBluetoothWifiNetwork("n-1bar", -71, ["NO"]),
    new ImprovBluetoothWifiNetwork("n-weak", -95, ["WEP"]),
  ];

  async function mountNetworks(
    list: ImprovBluetoothWifiNetwork[] = networks(),
  ): Promise<Mounted> {
    return mount((c) => {
      authorized(c);
      c.capabilities = CAP_WIFI_SCAN;
      c.wifiNetworks = list;
    });
  }

  it("renders every network with signal and security classes", async () => {
    const { el } = await mountNetworks();
    const options = qa(el, "md-select-option");
    // Five networks plus "Join other".
    expect(options).toHaveLength(6);
    expect(
      options
        .slice(0, 5)
        .map((o) => o.querySelector("[slot=headline]").textContent),
    ).toEqual(["n-full", "n-3bar", "n-2bar", "n-1bar", "n-weak"]);
    expect(
      options
        .slice(0, 5)
        .map((o) => o.querySelector("[slot=start]").getAttribute("class")),
    ).toEqual([
      "signal-excellent",
      "signal-good",
      "signal-fair",
      "signal-weak",
      "signal-weak",
    ]);
    expect(options[0].querySelector(".signal-strength").textContent).toBe(
      "-50dBm",
    );
    const chips = qa(el, "md-filter-chip").map((c) => [
      c.getAttribute("label"),
      c.getAttribute("class"),
    ]);
    expect(chips).toEqual([
      ["WPA", "security-fair"],
      ["WPA2", "security-good"],
      ["WPA2 EAP", "security-good"],
      ["WPA3", "security-excellent"],
      ["WAPI", "security-excellent"],
      ["Open", "security-weak"],
      ["WEP", "security-weak"],
    ]);
    expect(options[5].textContent).toContain("Join other");
    // The first network is selected and no manual SSID field is shown.
    expect(options[0].selected).toBe(true);
    expect(options[5].selected).toBe(false);
    expect(q(el, "md-outlined-text-field[name=ssid]")).toBeNull();
  });

  it("selects another network from the dropdown", async () => {
    const { el } = await mountNetworks();
    const select = q(el, "md-outlined-select");
    select.selectedIndex = 2;
    select.dispatchEvent(new Event("change"));
    await settle(el);
    expect(el._selectedSsid).toBe("n-2bar");
    expect(q(el, "md-outlined-text-field[name=ssid]")).toBeNull();
  });

  it("shows the network name field when join other is chosen", async () => {
    const focus = vi.spyOn(StandInTextField.prototype, "focus");
    const { el } = await mountNetworks();
    focus.mockClear();
    const select = q(el, "md-outlined-select");
    select.selectedIndex = 5;
    select.dispatchEvent(new Event("change"));
    await settle(el);
    expect(el._selectedSsid).toBeNull();
    expect(q(el, "md-outlined-text-field[name=ssid]")).not.toBeNull();
    expect(focus).toHaveBeenCalled();
  });

  it("stops the closed event from the select leaking out", async () => {
    const { el } = await mountNetworks();
    const outer = vi.fn();
    q(el, "md-dialog").addEventListener("closed", outer);
    q(el, "md-outlined-select").dispatchEvent(
      new Event("closed", { bubbles: true }),
    );
    expect(outer).not.toHaveBeenCalled();
  });

  it("focuses the dropdown after networks load", async () => {
    const focus = vi.spyOn(StandInSelect.prototype, "focus");
    await mountNetworks();
    expect(focus).toHaveBeenCalled();
  });

  it("focuses the text field when there are no networks", async () => {
    const focus = vi.spyOn(StandInTextField.prototype, "focus");
    const { el } = await mountNetworks([]);
    expect(focus).toHaveBeenCalled();
    expect(q(el, "md-outlined-text-field[name=ssid]")).not.toBeNull();
  });

  it("refreshes the network list", async () => {
    const { el, client } = await mountNetworks();
    client.scanWifiNetworks = vi.fn(async () => {
      client.wifiNetworks = [
        new ImprovBluetoothWifiNetwork("fresh", -45, ["WPA3"]),
      ];
    });
    el._error = "old";
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    q(el, "[data-refresh]").dispatchEvent(event);
    await settle(el);
    expect(event.defaultPrevented).toBe(true);
    expect(client.scanWifiNetworks).toHaveBeenCalledTimes(1);
    expect(el._error).toBeUndefined();
    expect(qa(el, "md-select-option")).toHaveLength(2);
    expect(qa(el, "md-select-option")[0].textContent).toContain("fresh");
  });

  it("shows an error when refreshing fails", async () => {
    const { el, client } = await mountNetworks();
    client.scanWifiNetworks = vi.fn(async () => {
      throw new Error("scan failed");
    });
    q(el, "[data-refresh]").click();
    await settle(el);
    expect(q(el, "p.error").textContent).toBe("scan failed");
  });
});
