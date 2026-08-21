export const STATE_VERSION = 1;
export const LEG_SECONDS = 10;
export const MAX_STATE_BYTES = 2048;

const GIFTS = new Set(["shield", "magnet", "calm"]);
const MODES = new Set(["daily", "open"]);

export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function todayKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailySeed(date = new Date()) {
  return fnv1a(`relay10:daily:${todayKey(date)}`);
}

export function createRelayState({ seed = dailySeed(), mode = "daily" } = {}) {
  return {
    v: STATE_VERSION,
    seed: seed >>> 0,
    mode,
    leg: 1,
    distance: 0,
    score: 0,
    energy: 2,
    combo: 0,
    y: 0.5,
    gift: "none",
    chain: [],
  };
}

function canonicalState(state) {
  return JSON.stringify({
    v: state.v,
    seed: state.seed,
    mode: state.mode,
    leg: state.leg,
    distance: state.distance,
    score: state.score,
    energy: state.energy,
    combo: state.combo,
    y: state.y,
    gift: state.gift,
    chain: state.chain,
  });
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(encoded) {
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new Error("Relay code contains invalid characters.");
  const padded = encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeRelay(state) {
  const clean = validateRelayState(state);
  const payload = canonicalState(clean);
  const envelope = JSON.stringify({ p: payload, c: fnv1a(`relay10:${payload}`).toString(36) });
  return toBase64Url(envelope);
}

export function decodeRelay(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > MAX_STATE_BYTES * 2) {
    throw new Error("Relay code has an invalid size.");
  }
  let envelope;
  try {
    envelope = JSON.parse(fromBase64Url(encoded));
  } catch (error) {
    throw new Error("Relay code could not be decoded.", { cause: error });
  }
  if (!envelope || typeof envelope.p !== "string" || typeof envelope.c !== "string") {
    throw new Error("Relay code has an invalid envelope.");
  }
  if (new TextEncoder().encode(envelope.p).length > MAX_STATE_BYTES) {
    throw new Error("Relay state is too large.");
  }
  const expected = fnv1a(`relay10:${envelope.p}`).toString(36);
  if (envelope.c !== expected) throw new Error("Relay code failed its corruption check.");
  let state;
  try {
    state = JSON.parse(envelope.p);
  } catch (error) {
    throw new Error("Relay state is not valid JSON.", { cause: error });
  }
  return validateRelayState(state);
}

export function validateRelayState(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Relay state must be an object.");
  }
  const state = structuredClone(candidate);
  const allowedKeys = new Set(["v", "seed", "mode", "leg", "distance", "score", "energy", "combo", "y", "gift", "chain"]);
  if (Object.keys(state).some((key) => !allowedKeys.has(key))) throw new Error("Relay state contains an unsupported field.");
  if (state.v !== STATE_VERSION) throw new Error("Relay version is not supported.");
  if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff) throw new Error("Relay seed is invalid.");
  if (!MODES.has(state.mode)) throw new Error("Relay mode is invalid.");
  if (!Number.isInteger(state.leg) || state.leg < 1 || state.leg > 999) throw new Error("Relay leg is invalid.");
  for (const field of ["distance", "score", "combo"]) {
    if (!Number.isInteger(state[field]) || state[field] < 0 || state[field] > 1_000_000_000) throw new Error(`Relay ${field} is invalid.`);
  }
  if (!Number.isInteger(state.energy) || state.energy < 0 || state.energy > 3) throw new Error("Relay energy is invalid.");
  if (typeof state.y !== "number" || !Number.isFinite(state.y) || state.y < 0.08 || state.y > 0.92) throw new Error("Relay position is invalid.");
  if (state.gift !== "none" && !GIFTS.has(state.gift)) throw new Error("Relay gift is invalid.");
  if (!Array.isArray(state.chain) || state.chain.length > 24) throw new Error("Relay history is invalid.");
  for (const leg of state.chain) {
    if (!leg || typeof leg !== "object" || !Number.isInteger(leg.s) || leg.s < 0 || leg.s > 1_000_000_000 || !Number.isInteger(leg.d) || leg.d < 0 || leg.d > 1_000_000_000) {
      throw new Error("Relay history entry is invalid.");
    }
    if (Object.keys(leg).some((key) => key !== "s" && key !== "d")) throw new Error("Relay history entry contains an unsupported field.");
  }
  return state;
}

export function applyIncomingGift(state) {
  const next = structuredClone(state);
  if (next.gift === "shield") next.energy = Math.min(3, next.energy + 1);
  next.gift = "none";
  return next;
}

export function completeLeg(state, result, gift) {
  if (!GIFTS.has(gift)) throw new Error("Choose a valid handoff gift.");
  const current = validateRelayState(state);
  const distance = Math.max(current.distance, Math.round(result.distance));
  const score = Math.max(current.score, Math.round(result.score));
  const chain = [...current.chain, { s: Math.max(0, score - current.score), d: Math.max(0, distance - current.distance) }].slice(-24);
  return validateRelayState({
    ...current,
    leg: current.leg + 1,
    distance,
    score,
    energy: Math.max(0, Math.min(3, Math.round(result.energy))),
    combo: Math.max(0, Math.round(result.combo)),
    y: Math.max(0.08, Math.min(0.92, result.y)),
    gift,
    chain,
  });
}

export function generateChunk(seed, chunkIndex, leg = 1) {
  const random = mulberry32(fnv1a(`${seed}:${chunkIndex}:relay10`));
  const opening = Math.max(0.17, 0.24 - (leg - 1) * 0.004);
  const gateY = 0.2 + random() * 0.6;
  const mineCount = random() > 0.48 ? 1 + (random() > 0.82 ? 1 : 0) : 0;
  const mines = Array.from({ length: mineCount }, (_, index) => ({
    x: 0.36 + index * 0.25 + random() * 0.12,
    y: 0.12 + random() * 0.76,
    r: 0.022 + random() * 0.013,
    phase: random() * Math.PI * 2,
  }));
  const sparks = Array.from({ length: 2 + (random() > 0.7 ? 1 : 0) }, (_, index) => ({
    x: 0.18 + index * 0.25 + random() * 0.12,
    y: 0.12 + random() * 0.76,
  }));
  return { gateY, opening, mines, sparks };
}

export function shareText(state, url) {
  const date = state.mode === "daily" ? "DAILY " : "";
  return `RELAY//10 ${date}LEG ${state.leg}\n${state.distance.toLocaleString("en-US")}m · ${state.score.toLocaleString("en-US")} signal\n\nI kept it alive. You have ten seconds.\n${url}`;
}
