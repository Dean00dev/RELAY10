import test from "node:test";
import assert from "node:assert/strict";

import {
  applyIncomingGift,
  completeLeg,
  createRelayState,
  dailySeed,
  decodeRelay,
  encodeRelay,
  fnv1a,
  generateChunk,
  mulberry32,
  shareText,
  todayKey,
  validateRelayState,
} from "../src/relay-core.js";

test("FNV-1a and PRNG are deterministic", () => {
  assert.equal(fnv1a("relay"), fnv1a("relay"));
  assert.notEqual(fnv1a("relay"), fnv1a("relay!"));
  const first = mulberry32(42);
  const second = mulberry32(42);
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
});

test("daily keys use UTC and produce a stable seed", () => {
  const date = new Date("2026-08-21T23:59:59Z");
  assert.equal(todayKey(date), "2026-08-21");
  assert.equal(dailySeed(date), dailySeed(new Date("2026-08-21T00:00:01Z")));
  assert.notEqual(dailySeed(date), dailySeed(new Date("2026-08-22T00:00:00Z")));
});

test("relay state round-trips without mutation", () => {
  const state = createRelayState({ seed: 1234, mode: "open" });
  const encoded = encodeRelay(state);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/u);
  assert.deepEqual(decodeRelay(encoded), state);
  assert.deepEqual(state.chain, []);
  assert.equal(encodeRelay(state), encoded);
});

test("hundreds of bounded relay states round-trip exactly", () => {
  for (let index = 0; index < 500; index += 1) {
    const state = {
      ...createRelayState({ seed: (index * 2654435761) >>> 0, mode: index % 2 ? "open" : "daily" }),
      leg: (index % 998) + 1,
      distance: index * 10_003,
      score: index * 20_003,
      energy: index % 4,
      combo: index * 11,
      y: 0.08 + (index % 85) / 100,
      gift: ["none", "shield", "magnet", "calm"][index % 4],
      chain: Array.from({ length: index % 25 }, (_, leg) => ({ s: leg * 13, d: leg * 17 })),
    };
    assert.deepEqual(decodeRelay(encodeRelay(state)), state);
  }
});

test("damaged relay links fail their corruption check", () => {
  const encoded = encodeRelay(createRelayState({ seed: 9876 }));
  const final = encoded.at(-1) === "A" ? "B" : "A";
  assert.throws(() => decodeRelay(encoded.slice(0, -1) + final), /decoded|corruption/u);
});

test("unbounded or malformed incoming state is rejected", () => {
  assert.throws(() => decodeRelay("A".repeat(5000)), /size/u);
  assert.throws(() => validateRelayState({}), /version/u);
  assert.throws(() => validateRelayState({ ...createRelayState(), leg: 1000 }), /leg/u);
  assert.throws(() => validateRelayState({ ...createRelayState(), y: Number.NaN }), /position/u);
  assert.throws(() => validateRelayState({ ...createRelayState(), chain: Array(25).fill({ s: 1, d: 1 }) }), /history/u);
  assert.throws(() => validateRelayState({ ...createRelayState(), gift: "admin" }), /gift/u);
  assert.throws(() => validateRelayState({ ...createRelayState(), admin: true }), /unsupported field/u);
  assert.throws(() => validateRelayState({ ...createRelayState(), chain: [{ s: 1, d: 1, extra: 1 }] }), /unsupported field/u);
});

test("completing a leg advances exactly once and bounds the history", () => {
  const state = { ...createRelayState({ seed: 5 }), chain: Array(24).fill({ s: 2, d: 3 }) };
  const next = completeLeg(state, { distance: 210, score: 900, energy: 2, combo: 3, y: 0.7 }, "magnet");
  assert.equal(next.leg, 2);
  assert.equal(next.distance, 210);
  assert.equal(next.score, 900);
  assert.equal(next.gift, "magnet");
  assert.equal(next.chain.length, 24);
  assert.deepEqual(next.chain.at(-1), { s: 900, d: 210 });
});

test("completion cannot reduce cumulative score or distance", () => {
  const state = { ...createRelayState(), score: 500, distance: 300 };
  const next = completeLeg(state, { distance: 20, score: 10, energy: 2, combo: 0, y: 0.5 }, "calm");
  assert.equal(next.distance, 300);
  assert.equal(next.score, 500);
  assert.deepEqual(next.chain.at(-1), { s: 0, d: 0 });
});

test("shield gifts apply once and never exceed capacity", () => {
  const incoming = { ...createRelayState(), energy: 2, gift: "shield" };
  const applied = applyIncomingGift(incoming);
  assert.equal(applied.energy, 3);
  assert.equal(applied.gift, "none");
  assert.equal(incoming.energy, 2);
  assert.equal(applyIncomingGift(applied).energy, 3);
});

test("world chunks are deterministic, bounded, and change by seed", () => {
  const first = generateChunk(123, 9, 4);
  assert.deepEqual(first, generateChunk(123, 9, 4));
  assert.notDeepEqual(first, generateChunk(124, 9, 4));
  assert.ok(first.gateY >= 0.2 && first.gateY <= 0.8);
  assert.ok(first.opening > 0.1 && first.opening < 0.3);
  assert.ok(first.mines.every((mine) => mine.y >= 0.12 && mine.y <= 0.88));
  assert.ok(first.sparks.every((spark) => spark.y >= 0.12 && spark.y <= 0.88));
  for (let index = 0; index < 1000; index += 1) {
    const chunk = generateChunk(0xdecafbad, index, (index % 100) + 1);
    assert.ok(chunk.gateY >= 0.2 && chunk.gateY <= 0.8);
    assert.ok(chunk.opening >= 0.17 && chunk.opening <= 0.24);
    assert.ok(chunk.mines.length <= 2);
    assert.ok(chunk.sparks.length >= 2 && chunk.sparks.length <= 3);
  }
});

test("share text carries the leg, score, distance, and exact URL", () => {
  const state = { ...createRelayState(), leg: 7, score: 12345, distance: 6789 };
  const text = shareText(state, "https://example.test/#r=abc");
  assert.match(text, /LEG 7/u);
  assert.match(text, /6,789m/u);
  assert.match(text, /12,345 signal/u);
  assert.match(text, /https:\/\/example\.test\/#r=abc/u);
});
