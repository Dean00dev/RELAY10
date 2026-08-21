import test from "node:test";
import assert from "node:assert/strict";

import { createRelayState, encodeRelay } from "../src/relay-core.js";

class FakeClassList {
  values = new Set();
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    if (force ?? !this.values.has(value)) this.values.add(value);
    else this.values.delete(value);
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.title = "";
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  replaceChildren(...children) { this.children = children; }
  showModal() { this.open = true; }
  getBoundingClientRect() { return { width: 430, height: 856, top: 0, left: 0 }; }
  setPointerCapture() {}
}

test("game module boots and paints its idle frame without a browser dependency", async () => {
  const elements = new Map();
  const giftButtons = ["shield", "magnet", "calm"].map((gift) => {
    const element = new FakeElement();
    element.dataset.gift = gift;
    return element;
  });
  const gradient = { addColorStop() {} };
  const drawing = new Proxy({ createLinearGradient: () => gradient }, { get: (target, key) => target[key] ?? (() => {}) });
  const canvas = new FakeElement();
  canvas.getContext = () => drawing;
  elements.set("#game-canvas", canvas);

  const documentListeners = new Map();
  const fakeDocument = {
    hidden: false,
    body: new FakeElement(),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new FakeElement());
      return elements.get(selector);
    },
    querySelectorAll(selector) { return selector === ".gift-button" ? giftButtons : []; },
    createElement() { return new FakeElement(); },
    addEventListener(type, handler) { documentListeners.set(type, handler); },
  };
  const windowListeners = new Map();
  const fakeWindow = {
    devicePixelRatio: 2,
    addEventListener(type, handler) { windowListeners.set(type, handler); },
  };
  const storage = new Map();
  const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const baton = encodeRelay(createRelayState({ seed: 20, mode: "open" }));
  const location = { hash: `#r=${baton}`, href: `https://example.test/#r=${baton}`, origin: "https://example.test", pathname: "/", search: "" };
  let animationFrame;

  Object.assign(globalThis, {
    document: fakeDocument,
    window: fakeWindow,
    localStorage,
    location,
    history: { replaceState() {} },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback) => { animationFrame = callback; return 1; },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { vibrate() {}, clipboard: { writeText: async () => {} } },
  });

  await import(`../src/game.js?bootstrap=${Date.now()}`);
  assert.equal(typeof animationFrame, "function");
  animationFrame(performance.now());
  assert.equal(canvas.width, 860);
  assert.equal(canvas.height, 1712);
  assert.ok(elements.get("#primary-start").title.startsWith("Daily seed "));
  assert.ok(windowListeners.has("resize"));
  assert.ok(documentListeners.has("visibilitychange"));

  const originalInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalTimeout = globalThis.setTimeout;
  let intervalCallback;
  globalThis.setInterval = (callback) => { intervalCallback = callback; return 1; };
  globalThis.clearInterval = () => {};
  globalThis.setTimeout = (callback) => { callback(); return 1; };
  elements.get("#primary-start").listeners.get("click")();
  intervalCallback();
  intervalCallback();
  intervalCallback();
  assert.equal(elements.get("#hud").classList.contains("is-hidden"), false);
  assert.equal(elements.get("#countdown-screen").classList.contains("is-hidden"), true);
  animationFrame(performance.now() + 16);
  assert.equal(elements.get("#hud-leg").textContent, "01");
  let simulatedTime = performance.now() + 16;
  for (let frame = 0; frame < 310; frame += 1) {
    simulatedTime += 34;
    animationFrame(simulatedTime);
  }
  assert.equal(elements.get("#handoff-screen").classList.contains("is-hidden"), false);
  assert.equal(elements.get("#result-leg").textContent, "02");
  giftButtons[2].listeners.get("click")();
  elements.get("#continue-button").listeners.get("click")();
  intervalCallback();
  intervalCallback();
  intervalCallback();
  assert.equal(elements.get("#hud-leg").textContent, "02");
  globalThis.setInterval = originalInterval;
  globalThis.clearInterval = originalClearInterval;
  globalThis.setTimeout = originalTimeout;
});
