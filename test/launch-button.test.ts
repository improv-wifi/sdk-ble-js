// @vitest-environment happy-dom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { LaunchButton as LaunchButtonType } from "../src/launch-button";

const provision = vi.hoisted(() => ({
  loaded: vi.fn(),
  startProvisioning: vi.fn(),
}));

vi.mock("../src/provision", () => {
  provision.loaded();
  return { startProvisioning: provision.startProvisioning };
});

let LaunchButton: typeof LaunchButtonType;

beforeAll(async () => {
  // happy-dom has no Web Bluetooth and reports an insecure context. Provide
  // both before the module evaluates its static support checks, so the
  // "supported" state is reached through real detection.
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "bluetooth", {
    value: {},
    configurable: true,
  });
  ({ LaunchButton } = await import("../src/launch-button"));
});

const render = () => {
  const el = document.createElement(
    "improv-wifi-launch-button",
  ) as LaunchButtonType;
  document.body.append(el);
  return el;
};

/** Remove a property wherever it lives on the prototype chain; returns a restore fn. */
const hideProperty = (proto: object, name: string): (() => void) => {
  let owner: object | null = proto;
  while (owner && !Object.prototype.hasOwnProperty.call(owner, name)) {
    owner = Object.getPrototypeOf(owner);
  }
  expect(owner, `${name} should exist on the prototype chain`).not.toBeNull();
  const desc = Object.getOwnPropertyDescriptor(owner!, name)!;
  delete (owner as any)[name];
  expect(name in proto).toBe(false);
  return () => Object.defineProperty(owner!, name, desc);
};

const withStatics = (
  isSupported: boolean,
  isAllowed: boolean,
  fn: () => void,
) => {
  const origSupported = LaunchButton.isSupported;
  const origAllowed = LaunchButton.isAllowed;
  LaunchButton.isSupported = isSupported;
  LaunchButton.isAllowed = isAllowed;
  try {
    fn();
  } finally {
    LaunchButton.isSupported = origSupported;
    LaunchButton.isAllowed = origAllowed;
  }
};

beforeEach(() => {
  provision.startProvisioning.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("LaunchButton support detection", () => {
  it("detects support and a secure context at module load", () => {
    expect(LaunchButton.isSupported).toBe(true);
    expect(LaunchButton.isAllowed).toBe(true);
  });

  it("is registered as a custom element", () => {
    expect(customElements.get("improv-wifi-launch-button")).toBe(LaunchButton);
  });

  it("shows the not-allowed slot in an insecure context", () => {
    withStatics(true, false, () => {
      const el = render();

      expect(el.hasAttribute("not-supported")).toBe(true);
      expect(el.hasAttribute("supported")).toBe(false);
      const slot = el.shadowRoot!.querySelector("slot")!;
      expect(slot.name).toBe("not-allowed");
      expect(slot.textContent).toBe(
        "You can only use Improv on HTTPS sites or localhost.",
      );
    });
  });

  it("prefers the not-allowed message when neither holds", () => {
    withStatics(false, false, () => {
      const el = render();

      expect(el.shadowRoot!.querySelector("slot")!.name).toBe("not-allowed");
    });
  });

  it("recommends supported browsers when Web Bluetooth is unavailable", () => {
    withStatics(false, true, () => {
      const el = render();

      expect(el.hasAttribute("not-supported")).toBe(true);
      expect(el.hasAttribute("supported")).toBe(false);
      const slot = el.shadowRoot!.querySelector("slot")!;
      expect(slot.name).toBe("unsupported");
      expect(slot.textContent).toBe(
        "Your browser does not support bluetooth provisioning. Use Google Chrome or Microsoft Edge.",
      );
    });
  });

  it("does not wire up the button when unsupported", () => {
    withStatics(false, true, () => {
      const el = render();
      el.dispatchEvent(new MouseEvent("mouseover"));

      expect(el.shadowRoot!.querySelector("button")).toBeNull();
      expect(provision.loaded).not.toHaveBeenCalled();
    });
  });
});

describe("LaunchButton when supported", () => {
  it("renders the activate slot with a default button", () => {
    const el = render();

    expect(el.hasAttribute("supported")).toBe(true);
    expect(el.hasAttribute("not-supported")).toBe(false);
    const slot = el.shadowRoot!.querySelector("slot")!;
    expect(slot.name).toBe("activate");
    const button = slot.querySelector("button")!;
    expect(button.innerText).toBe("Connect device to Wi-Fi");
  });

  it("styles the shadow root with an adopted stylesheet", () => {
    const el = render();

    const root = el.shadowRoot!;
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.querySelector("style")).toBeNull();
  });

  it("falls back to a <style> element without adoptedStyleSheets", () => {
    const restore = hideProperty(Document.prototype, "adoptedStyleSheets");
    try {
      const el = render();

      const root = el.shadowRoot!;
      const style = root.querySelector("style")!;
      expect(style).not.toBeNull();
      expect(style.innerText).toContain("var(--improv-primary-color, #03a9f4)");
      expect(root.adoptedStyleSheets ?? []).toHaveLength(0);
      // The style sheet comes before the activate slot.
      expect(root.firstElementChild).toBe(style);
      expect(root.querySelector("slot")!.name).toBe("activate");
    } finally {
      restore();
    }
  });

  it("falls back to a <style> element without replaceSync", () => {
    const restore = hideProperty(CSSStyleSheet.prototype, "replaceSync");
    try {
      const el = render();

      expect(el.shadowRoot!.querySelector("style")).not.toBeNull();
    } finally {
      restore();
    }
  });

  it("preloads the provisioning module on mouseover", async () => {
    const el = render();
    provision.loaded.mockClear();

    el.dispatchEvent(new MouseEvent("mouseover"));

    await vi.waitFor(() => expect(provision.loaded).toHaveBeenCalled());
    // Preloading must not start provisioning.
    expect(provision.startProvisioning).not.toHaveBeenCalled();
  });

  it("starts provisioning when the button is clicked", async () => {
    const el = render();
    const button = el.shadowRoot!.querySelector("button")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });

    button.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    await vi.waitFor(() =>
      expect(provision.startProvisioning).toHaveBeenCalledOnce(),
    );
    expect(provision.startProvisioning).toHaveBeenCalledWith(el);
  });

  it("starts provisioning when the slot itself is clicked", async () => {
    const el = render();

    el.shadowRoot!.querySelector("slot")!.dispatchEvent(
      new MouseEvent("click", { cancelable: true }),
    );

    await vi.waitFor(() =>
      expect(provision.startProvisioning).toHaveBeenCalledWith(el),
    );
  });

  it("only renders once when connected a second time", () => {
    const el = render();
    const root = el.shadowRoot!;
    const children = root.childNodes.length;
    const sheets = root.adoptedStyleSheets.length;

    // Moving the element re-runs connectedCallback.
    const other = document.createElement("div");
    document.body.append(other);
    other.append(el);

    expect(el.shadowRoot).toBe(root);
    expect(root.childNodes.length).toBe(children);
    expect(root.adoptedStyleSheets.length).toBe(sheets);
    expect(root.querySelectorAll("slot")).toHaveLength(1);
  });

  it("invokes the click handler once per click after reconnecting", async () => {
    const el = render();
    const other = document.createElement("div");
    document.body.append(other);
    other.append(el);

    el.shadowRoot!.querySelector("button")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() =>
      expect(provision.startProvisioning).toHaveBeenCalled(),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(provision.startProvisioning).toHaveBeenCalledOnce();
  });
});
