// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { fireEvent } from "../src/util";

describe("fireEvent", () => {
  it("dispatches a bubbling, composed, non-cancelable event by default", () => {
    const el = document.createElement("div");
    const listener = vi.fn();
    el.addEventListener("state-changed", listener);

    fireEvent(el, "state-changed", { state: "PROVISIONED" });

    expect(listener).toHaveBeenCalledOnce();
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev).toBeInstanceOf(CustomEvent);
    expect(ev.detail).toEqual({ state: "PROVISIONED" });
    expect(ev.bubbles).toBe(true);
    expect(ev.composed).toBe(true);
    expect(ev.cancelable).toBe(false);
  });

  it("has a null detail when none is given", () => {
    const el = document.createElement("div");
    const listener = vi.fn();
    el.addEventListener("state-changed", listener);

    fireEvent(el, "state-changed");

    expect(listener.mock.calls[0][0].detail).toBeNull();
  });

  it("bubbles to ancestors by default", () => {
    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.append(child);
    const listener = vi.fn();
    parent.addEventListener("state-changed", listener);

    fireEvent(child, "state-changed", { state: "UNKNOWN" });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("honours explicit false and true options", () => {
    const el = document.createElement("div");
    const listener = vi.fn();
    el.addEventListener("state-changed", listener);

    fireEvent(
      el,
      "state-changed",
      { state: "UNKNOWN" },
      {
        bubbles: false,
        composed: false,
        cancelable: true,
      },
    );

    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.bubbles).toBe(false);
    expect(ev.composed).toBe(false);
    expect(ev.cancelable).toBe(true);
  });

  it("honours explicit true for bubbles and composed", () => {
    const el = document.createElement("div");
    const listener = vi.fn();
    el.addEventListener("state-changed", listener);

    fireEvent(
      el,
      "state-changed",
      { state: "UNKNOWN" },
      {
        bubbles: true,
        composed: true,
      },
    );

    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.bubbles).toBe(true);
    expect(ev.composed).toBe(true);
    expect(ev.cancelable).toBe(false);
  });
});
