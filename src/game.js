import {
  LEG_SECONDS,
  applyIncomingGift,
  completeLeg,
  createRelayState,
  dailySeed,
  decodeRelay,
  encodeRelay,
  generateChunk,
  shareText,
  todayKey,
} from "./relay-core.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#game-canvas");
const context = canvas.getContext("2d", { alpha: false });
const screens = {
  start: $("#start-screen"),
  countdown: $("#countdown-screen"),
  handoff: $("#handoff-screen"),
  crash: $("#crash-screen"),
};

const elements = {
  frame: $("#game-frame"), hud: $("#hud"), hudLeg: $("#hud-leg"), hudTimer: $("#hud-timer"),
  hudScore: $("#hud-score"), energy: $("#energy"), incomingCard: $("#incoming-card"),
  incomingTitle: $("#incoming-title"), incomingGift: $("#incoming-gift"), primaryStart: $("#primary-start"),
  openStart: $("#open-start"), countdownValue: $("#countdown-value"), resultDistance: $("#result-distance"),
  resultScore: $("#result-score"), resultLeg: $("#result-leg"), shareButton: $("#share-button"),
  continueButton: $("#continue-button"), shareStatus: $("#share-status"), crashLeg: $("#crash-leg"),
  crashScore: $("#crash-score"), memorialButton: $("#memorial-button"), retryButton: $("#retry-button"),
  pause: $("#pause-overlay"), toast: $("#toast"), help: $("#help-dialog"),
  sound: $("#sound-button"), motion: $("#motion-button"),
};

let width = 900;
let height = 1200;
let dpr = 1;
let scene = "start";
let relayState = createRelayState();
let incomingState = null;
let pendingState = null;
let completedResult = null;
let selectedGift = "shield";
let run = null;
let lastFrame = performance.now();
let paused = false;
let dragging = false;
let toastTimer = 0;
let audioContext = null;
let soundOn = localStorage.getItem("relay10:sound") === "on";
let reduceMotion = localStorage.getItem("relay10:motion") === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;

function resize() {
  const rectangle = canvas.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  width = Math.max(320, rectangle.width);
  height = Math.max(520, rectangle.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function showScreen(name) {
  for (const [key, screen] of Object.entries(screens)) screen.classList.toggle("is-hidden", key !== name);
  elements.hud.classList.toggle("is-hidden", name !== "game");
  scene = name;
}

function toast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function beep(frequency = 480, duration = 0.06, volume = 0.045) {
  if (!soundOn) return;
  audioContext ??= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function formatNumber(number) {
  return Math.max(0, Math.round(number)).toLocaleString("en-US");
}

function giftLabel(gift) {
  return {
    shield: "A runner left you one energy.",
    magnet: "A runner boosted your spark magnet.",
    calm: "A runner calmed the static for this leg.",
    none: "No gift. Just the baton.",
  }[gift] ?? "The baton is waiting.";
}

function loadIncomingLink() {
  const match = location.hash.match(/^#r=([A-Za-z0-9_-]+)$/u);
  if (!match) return;
  try {
    incomingState = decodeRelay(match[1]);
    relayState = incomingState;
    elements.incomingCard.classList.remove("is-hidden");
    elements.incomingTitle.textContent = `LEG ${String(incomingState.leg).padStart(2, "0")} · ${formatNumber(incomingState.distance)}m`;
    elements.incomingGift.textContent = giftLabel(incomingState.gift);
    elements.primaryStart.textContent = "ACCEPT THE BATON";
  } catch (error) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setTimeout(() => toast(error.message), 150);
  }
}

function newOpenSeed() {
  const numbers = new Uint32Array(1);
  crypto.getRandomValues(numbers);
  return numbers[0];
}

function beginFromState(state) {
  const incomingGift = state.gift;
  relayState = applyIncomingGift(state);
  pendingState = null;
  completedResult = null;
  selectedGift = "shield";
  document.querySelectorAll(".gift-button").forEach((button) => {
    const selected = button.dataset.gift === selectedGift;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  showScreen("countdown");
  let count = 3;
  elements.countdownValue.textContent = count;
  beep(420, 0.08);
  const timer = setInterval(() => {
    count -= 1;
    if (count > 0) {
      elements.countdownValue.textContent = count;
      beep(420 + (3 - count) * 90, 0.08);
      return;
    }
    clearInterval(timer);
    elements.countdownValue.textContent = "GO";
    beep(820, 0.12);
    setTimeout(() => startRun(incomingGift), 320);
  }, 700);
}

function startRun(incomingGift) {
  const baseSpeed = 185 + Math.min(95, (relayState.leg - 1) * 7);
  run = {
    elapsed: 0,
    distanceStart: relayState.distance,
    distance: relayState.distance,
    scoreStart: relayState.score,
    score: relayState.score,
    energy: relayState.energy,
    combo: relayState.combo,
    shipY: relayState.y * height,
    targetY: relayState.y * height,
    speed: incomingGift === "calm" ? baseSpeed * 0.84 : baseSpeed,
    magnet: incomingGift === "magnet" ? 112 : 58,
    invulnerable: 0,
    consumed: new Set(),
    particles: [],
    trail: [],
    keys: new Set(),
  };
  showScreen("game");
  updateHud();
}

function updateHud() {
  if (!run) return;
  elements.hudLeg.textContent = String(relayState.leg).padStart(2, "0");
  elements.hudTimer.textContent = Math.max(0, LEG_SECONDS - run.elapsed).toFixed(1);
  elements.hudScore.textContent = formatNumber(run.score);
  elements.energy.setAttribute("aria-label", `${run.energy} energy remaining`);
  elements.energy.replaceChildren(...Array.from({ length: 3 }, (_, index) => {
    const marker = document.createElement("i");
    if (index >= run.energy) marker.className = "empty";
    return marker;
  }));
}

function worldObjects() {
  if (!run) return [];
  const chunkSize = Math.max(330, width * 0.56);
  const currentChunk = Math.floor(run.distance / chunkSize);
  const objects = [];
  for (let chunk = Math.max(0, currentChunk - 1); chunk <= currentChunk + 4; chunk += 1) {
    const generated = generateChunk(relayState.seed, chunk, relayState.leg);
    const start = chunk * chunkSize;
    objects.push({ id: `g:${chunk}`, type: "gate", x: start + chunkSize * 0.88, y: generated.gateY, opening: generated.opening });
    generated.mines.forEach((mine, index) => objects.push({ id: `m:${chunk}:${index}`, type: "mine", x: start + mine.x * chunkSize, ...mine }));
    generated.sparks.forEach((spark, index) => objects.push({ id: `s:${chunk}:${index}`, type: "spark", x: start + spark.x * chunkSize, y: spark.y }));
  }
  return objects;
}

function collide() {
  if (!run || run.invulnerable > 0) return;
  const shipX = width * 0.19;
  const radius = Math.max(10, width * 0.014);
  for (const object of worldObjects()) {
    if (run.consumed.has(object.id)) continue;
    const screenX = shipX + object.x - run.distance;
    if (object.type === "spark") {
      const dy = run.shipY - object.y * height;
      if (Math.hypot(screenX - shipX, dy) < run.magnet) {
        run.consumed.add(object.id);
        run.combo += 1;
        run.score += 70 + Math.min(430, run.combo * 10);
        burst(shipX, run.shipY, "#43f8ff", 10);
        beep(620 + Math.min(600, run.combo * 24), 0.05, 0.032);
      }
      continue;
    }
    let hit = false;
    if (object.type === "gate" && Math.abs(screenX - shipX) < radius + 9) {
      const center = object.y * height;
      const halfGap = object.opening * height;
      hit = run.shipY < center - halfGap + radius || run.shipY > center + halfGap - radius;
    }
    if (object.type === "mine") {
      const mineY = (object.y + Math.sin(run.elapsed * 2.2 + object.phase) * 0.018) * height;
      hit = Math.hypot(screenX - shipX, mineY - run.shipY) < object.r * Math.min(width, height) + radius;
    }
    if (hit) {
      run.consumed.add(object.id);
      damage();
      return;
    }
  }
}

function damage() {
  run.energy -= 1;
  run.combo = 0;
  run.invulnerable = 1.05;
  burst(width * 0.19, run.shipY, "#ff526f", 24);
  beep(115, 0.25, 0.09);
  if (navigator.vibrate) navigator.vibrate([35, 25, 45]);
  updateHud();
  if (run.energy <= 0) finishCrash();
}

function burst(x, y, color, count) {
  if (reduceMotion) return;
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 35 + Math.random() * 160;
    run.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35 + Math.random() * 0.45, color });
  }
}

function update(delta) {
  if (!run || scene !== "game" || paused) return;
  run.elapsed += delta;
  run.invulnerable = Math.max(0, run.invulnerable - delta);
  const keyboardDirection = (run.keys.has("ArrowDown") || run.keys.has("s") ? 1 : 0) - (run.keys.has("ArrowUp") || run.keys.has("w") ? 1 : 0);
  if (keyboardDirection) run.targetY += keyboardDirection * 420 * delta;
  run.targetY = Math.max(height * 0.08, Math.min(height * 0.92, run.targetY));
  run.shipY += (run.targetY - run.shipY) * Math.min(1, delta * 11);
  run.distance += run.speed * delta;
  run.score += run.speed * delta * (0.12 + Math.min(0.18, run.combo * 0.004));
  run.trail.unshift({ x: width * 0.19, y: run.shipY });
  run.trail.length = Math.min(reduceMotion ? 5 : 22, run.trail.length);
  for (const particle of run.particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  }
  run.particles = run.particles.filter((particle) => particle.life > 0);
  collide();
  updateHud();
  if (run && run.elapsed >= LEG_SECONDS) finishLeg();
}

function finishLeg() {
  if (!run) return;
  const legDistance = Math.round(run.distance - run.distanceStart);
  const result = { distance: run.distance, score: run.score, energy: run.energy, combo: run.combo, y: run.shipY / height };
  completedResult = result;
  pendingState = completeLeg(relayState, completedResult, selectedGift);
  elements.resultDistance.textContent = `${formatNumber(legDistance)}m`;
  elements.resultScore.textContent = formatNumber(result.score);
  elements.resultLeg.textContent = String(relayState.leg + 1).padStart(2, "0");
  elements.shareStatus.textContent = "";
  run = null;
  beep(880, 0.12, 0.055);
  setTimeout(() => beep(1120, 0.16, 0.045), 90);
  showScreen("handoff");
}

function finishCrash() {
  if (!run) return;
  elements.crashLeg.textContent = String(relayState.leg).padStart(2, "0");
  elements.crashScore.textContent = formatNumber(run.score);
  const best = Math.max(Number(localStorage.getItem("relay10:best") || 0), Math.round(run.score));
  localStorage.setItem("relay10:best", String(best));
  run = null;
  showScreen("crash");
}

function handoffUrl() {
  pendingState = completeLeg(relayState, completedResult, selectedGift);
  const url = new URL(location.href);
  url.hash = `r=${encodeRelay(pendingState)}`;
  return url.href;
}

async function passBaton() {
  const url = handoffUrl();
  const text = shareText(pendingState, url);
  const caption = shareText(pendingState, "").trim();
  try {
    if (navigator.share) {
      await navigator.share({ title: "RELAY//10 — Take the baton", text: caption, url });
      elements.shareStatus.textContent = "Baton passed. The chain is out of your hands.";
    } else {
      await navigator.clipboard.writeText(text);
      elements.shareStatus.textContent = "Relay link copied.";
      toast("BATON LINK COPIED");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      try {
        await navigator.clipboard.writeText(text);
        elements.shareStatus.textContent = "Relay link copied.";
      } catch {
        history.replaceState(null, "", url);
        elements.shareStatus.textContent = "Sharing is unavailable here. The baton is now in the address bar.";
      }
    }
  }
}

async function shareMemorial() {
  const score = elements.crashScore.textContent;
  const text = `RELAY//10 — SIGNAL LOST\nLeg ${elements.crashLeg.textContent} · ${score} signal\n\nStart a new chain: ${location.origin}${location.pathname}`;
  try {
    if (navigator.share) await navigator.share({ title: "RELAY//10 — Signal lost", text });
    else await navigator.clipboard.writeText(text);
  } catch (error) {
    if (error.name !== "AbortError") toast("SHARE CANCELLED");
  }
}

function setTargetFromPointer(event) {
  const rectangle = canvas.getBoundingClientRect();
  if (run) run.targetY = ((event.clientY - rectangle.top) / rectangle.height) * height;
}

function drawBackground(time) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#080b19");
  gradient.addColorStop(1, "#05060d");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const shift = run ? run.distance * 0.11 : time * 0.012;
  context.fillStyle = "rgba(150,170,255,.32)";
  for (let index = 0; index < 52; index += 1) {
    const x = ((index * 137.31 - shift) % (width + 80) + width + 80) % (width + 80) - 40;
    const y = ((index * 83.77) % height);
    const size = index % 7 === 0 ? 1.7 : 0.8;
    context.fillRect(x, y, size, size);
  }
  context.strokeStyle = "rgba(89,70,170,.08)";
  context.lineWidth = 1;
  const grid = 80;
  const offset = run ? -(run.distance % grid) : 0;
  for (let x = offset; x < width; x += grid) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
}

function drawWorld() {
  if (!run) return;
  const shipX = width * 0.19;
  for (const object of worldObjects()) {
    if (run.consumed.has(object.id)) continue;
    const x = shipX + object.x - run.distance;
    if (x < -90 || x > width + 90) continue;
    if (object.type === "gate") {
      const center = object.y * height;
      const halfGap = object.opening * height;
      const glow = context.createLinearGradient(x - 16, 0, x + 16, 0);
      glow.addColorStop(0, "rgba(154,108,255,0)"); glow.addColorStop(.5, "rgba(154,108,255,.75)"); glow.addColorStop(1, "rgba(154,108,255,0)");
      context.fillStyle = glow;
      context.fillRect(x - 18, 0, 36, center - halfGap);
      context.fillRect(x - 18, center + halfGap, 36, height - center - halfGap);
      context.fillStyle = "#b99aff";
      context.fillRect(x - 2, 0, 4, center - halfGap);
      context.fillRect(x - 2, center + halfGap, 4, height - center - halfGap);
    } else if (object.type === "mine") {
      const y = (object.y + Math.sin(run.elapsed * 2.2 + object.phase) * 0.018) * height;
      const radius = object.r * Math.min(width, height);
      context.save(); context.translate(x, y); context.rotate(run.elapsed + object.phase);
      context.strokeStyle = "#ff526f"; context.fillStyle = "rgba(255,82,111,.14)"; context.lineWidth = 2;
      context.beginPath();
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        const r = index % 2 ? radius * .62 : radius * 1.25;
        context.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      context.closePath(); context.fill(); context.stroke(); context.restore();
    } else {
      const y = object.y * height;
      const radius = 5 + Math.sin(run.elapsed * 4 + object.x) * 1.5;
      context.shadowBlur = 18; context.shadowColor = "#43f8ff"; context.fillStyle = "#bffcff";
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;
    }
  }
}

function drawShip() {
  if (!run) return;
  const x = width * 0.19;
  context.lineCap = "round";
  for (let index = run.trail.length - 1; index >= 1; index -= 1) {
    const alpha = (1 - index / run.trail.length) * .45;
    context.strokeStyle = `rgba(67,248,255,${alpha})`;
    context.lineWidth = Math.max(1, 8 * (1 - index / run.trail.length));
    context.beginPath(); context.moveTo(run.trail[index].x - index * 2.4, run.trail[index].y); context.lineTo(run.trail[index - 1].x, run.trail[index - 1].y); context.stroke();
  }
  const visible = run.invulnerable <= 0 || Math.floor(run.invulnerable * 12) % 2 === 0;
  if (visible) {
    context.save(); context.translate(x, run.shipY);
    context.shadowBlur = 24; context.shadowColor = "#43f8ff"; context.fillStyle = "#e9ffff";
    context.beginPath(); context.moveTo(15, 0); context.lineTo(-11, -9); context.lineTo(-5, 0); context.lineTo(-11, 9); context.closePath(); context.fill();
    context.fillStyle = "#43f8ff"; context.fillRect(-15, -2, 10, 4); context.restore(); context.shadowBlur = 0;
  }
  for (const particle of run.particles) {
    context.globalAlpha = Math.min(1, particle.life * 2); context.fillStyle = particle.color;
    context.fillRect(particle.x, particle.y, 3, 3);
  }
  context.globalAlpha = 1;
}

function frame(time) {
  const delta = Math.min(0.034, (time - lastFrame) / 1000);
  lastFrame = time;
  update(delta);
  drawBackground(time);
  drawWorld();
  drawShip();
  requestAnimationFrame(frame);
}

elements.primaryStart.addEventListener("click", () => beginFromState(incomingState ?? createRelayState({ seed: dailySeed(), mode: "daily" })));
elements.openStart.addEventListener("click", () => beginFromState(createRelayState({ seed: newOpenSeed(), mode: "open" })));
elements.retryButton.addEventListener("click", () => beginFromState(createRelayState({ seed: newOpenSeed(), mode: "open" })));
elements.continueButton.addEventListener("click", () => {
  pendingState = completeLeg(relayState, completedResult, selectedGift);
  beginFromState(pendingState);
});
elements.shareButton.addEventListener("click", passBaton);
elements.memorialButton.addEventListener("click", shareMemorial);
$("#help-button").addEventListener("click", () => elements.help.showModal());

document.querySelectorAll(".gift-button").forEach((button) => button.addEventListener("click", () => {
  selectedGift = button.dataset.gift;
  document.querySelectorAll(".gift-button").forEach((candidate) => {
    const selected = candidate === button;
    candidate.classList.toggle("selected", selected);
    candidate.setAttribute("aria-checked", String(selected));
  });
  beep(550, 0.045, 0.025);
}));

elements.sound.addEventListener("click", () => {
  soundOn = !soundOn;
  localStorage.setItem("relay10:sound", soundOn ? "on" : "off");
  elements.sound.setAttribute("aria-pressed", String(soundOn));
  elements.sound.setAttribute("aria-label", soundOn ? "Turn sound off" : "Turn sound on");
  if (soundOn) beep(620, 0.08);
});

elements.motion.addEventListener("click", () => {
  reduceMotion = !reduceMotion;
  localStorage.setItem("relay10:motion", reduceMotion ? "reduced" : "full");
  document.body.classList.toggle("reduce-motion", reduceMotion);
  elements.motion.setAttribute("aria-pressed", String(reduceMotion));
  toast(reduceMotion ? "REDUCED MOTION ON" : "FULL MOTION ON");
});

canvas.addEventListener("pointerdown", (event) => { dragging = true; canvas.setPointerCapture(event.pointerId); setTargetFromPointer(event); });
canvas.addEventListener("pointermove", (event) => { if (dragging) setTargetFromPointer(event); });
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointercancel", () => { dragging = false; });

window.addEventListener("keydown", (event) => {
  if (!run) return;
  if (["ArrowUp", "ArrowDown", "w", "s"].includes(event.key)) {
    event.preventDefault(); run.keys.add(event.key);
  }
  if (event.key === "Escape") setPaused(true);
});
window.addEventListener("keyup", (event) => run?.keys.delete(event.key));

function setPaused(value) {
  if (scene !== "game") return;
  paused = value;
  elements.pause.classList.toggle("is-hidden", !paused);
  lastFrame = performance.now();
}
elements.pause.addEventListener("click", () => setPaused(false));
document.addEventListener("visibilitychange", () => { if (document.hidden && scene === "game") setPaused(true); });
window.addEventListener("resize", resize);

elements.sound.setAttribute("aria-pressed", String(soundOn));
elements.sound.setAttribute("aria-label", soundOn ? "Turn sound off" : "Turn sound on");
elements.motion.setAttribute("aria-pressed", String(reduceMotion));
document.body.classList.toggle("reduce-motion", reduceMotion);
elements.primaryStart.title = `Daily seed ${todayKey()}`;
resize();
loadIncomingLink();
requestAnimationFrame(frame);
