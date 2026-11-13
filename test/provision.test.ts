// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IMPROV_BLE_SERVICE } from "../src/const";
import type { LaunchButton } from "../src/launch-button";

// Avoid loading lit and material web; the dialog element is not defined, so
// the created element is a plain HTMLElement we can inspect.
const dialog = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock("../src/provision-dialog", () => {
  dialog.loaded();
  return {};
});

import { startProvisioning } from "../src/provision";

const requestDevice = vi.fn();

const fakeButton = () =>
  document.createElement("div") as unknown as LaunchButton;

beforeEach(() => {
  requestDevice.mockReset();
  dialog.loaded.mockClear();
  Object.defineProperty(navigator, "bluetooth", {
    value: { requestDevice },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("startProvisioning", () => {
  it("requests a device by Improv service and appends the dialog", async () => {
    const device = { name: "Improv Device" };
    requestDevice.mockResolvedValue(device);
    const button = fakeButton();

    await startProvisioning(button);

    expect(requestDevice).toHaveBeenCalledOnce();
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [IMPROV_BLE_SERVICE] }],
    });
    const el = document.body.querySelector(
      "improv-wifi-provision-dialog",
    ) as any;
    expect(el).not.toBeNull();
    expect(el.parentElement).toBe(document.body);
    expect(el.device).toBe(device);
    expect(typeof el.stateUpdateCallback).toBe("function");
  });

  it("starts loading the dialog module", async () => {
    requestDevice.mockResolvedValue({});
    // The module graph is cached, so reset it to see the import happen again.
    vi.resetModules();
    dialog.loaded.mockClear();
    vi.doMock("../src/provision-dialog", () => {
      dialog.loaded();
      return {};
    });
    const fresh = await import("../src/provision");

    await fresh.startProvisioning(fakeButton());

    await vi.waitFor(() => expect(dialog.loaded).toHaveBeenCalledOnce());
  });

  it("forwards state updates as state-changed events on the button", async () => {
    requestDevice.mockResolvedValue({});
    const button = fakeButton();
    const listener = vi.fn();
    button.addEventListener("state-changed", listener);

    await startProvisioning(button);
    const el = document.body.querySelector(
      "improv-wifi-provision-dialog",
    ) as any;
    el.stateUpdateCallback({ state: "PROVISIONED" });

    expect(listener).toHaveBeenCalledOnce();
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toEqual({ state: "PROVISIONED" });
    expect(ev.bubbles).toBe(true);
    expect(ev.composed).toBe(true);
  });

  it("logs and creates no dialog when the chooser is rejected", async () => {
    const err = new Error("User cancelled the requestDevice() chooser.");
    requestDevice.mockRejectedValue(err);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await startProvisioning(fakeButton());

    expect(consoleError).toHaveBeenCalledWith("Failed to get device", err);
    expect(
      document.body.querySelector("improv-wifi-provision-dialog"),
    ).toBeNull();
  });

  it("creates no dialog when no device is returned", async () => {
    requestDevice.mockResolvedValue(undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await startProvisioning(fakeButton());

    expect(consoleError).not.toHaveBeenCalled();
    expect(
      document.body.querySelector("improv-wifi-provision-dialog"),
    ).toBeNull();
  });
});
