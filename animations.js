// animations.js — every visual effect in the app lives here.
import { randomInt, lerp, clamp } from "./utils.js";

// ---------------------------------------------------------------------------
// Floating ambient particles (canvas)
// ---------------------------------------------------------------------------
let particleCanvas, particleCtx, particles = [];
let particleRAF = null;

export function initParticles(canvasEl) {
  particleCanvas = canvasEl;
  particleCtx = canvasEl.getContext("2d");
  resizeParticleCanvas();
  window.addEventListener("resize", resizeParticleCanvas);

  const count = window.innerWidth < 640 ? 35 : 70;
  particles = Array.from({ length: count }, () => spawnParticle());

  runParticleLoop();
}

function resizeParticleCanvas() {
  if (!particleCanvas) return;
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

function spawnParticle() {
  return {
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.8 + 0.4,
    speedY: Math.random() * 0.35 + 0.05,
    drift: (Math.random() - 0.5) * 0.3,
    alpha: Math.random() * 0.6 + 0.2,
    hue: randomInt(190, 280),
    twinkle: Math.random() * Math.PI * 2,
  };
}

function runParticleLoop() {
  function tick() {
    if (!particleCtx) return;
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    for (const p of particles) {
      p.y -= p.speedY;
      p.x += p.drift;
      p.twinkle += 0.02;
      if (p.y < -10) {
        p.y = window.innerHeight + 10;
        p.x = Math.random() * window.innerWidth;
      }
      if (p.x < -10) p.x = window.innerWidth + 10;
      if (p.x > window.innerWidth + 10) p.x = -10;

      const a = p.alpha * (0.6 + 0.4 * Math.sin(p.twinkle));
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      particleCtx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${a})`;
      particleCtx.fill();
    }
    particleRAF = requestAnimationFrame(tick);
  }
  if (particleRAF) cancelAnimationFrame(particleRAF);
  tick();
}

// ---------------------------------------------------------------------------
// Cursor glow (desktop only — pointer:fine)
// ---------------------------------------------------------------------------
export function initCursorGlow(glowEl) {
  if (!window.matchMedia("(pointer: fine)").matches) {
    glowEl.style.display = "none";
    return;
  }
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let cx = tx, cy = ty;

  window.addEventListener("pointermove", (e) => {
    tx = e.clientX;
    ty = e.clientY;
  });

  function loop() {
    cx = lerp(cx, tx, 0.18);
    cy = lerp(cy, ty, 0.18);
    glowEl.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(loop);
  }
  loop();
}

// ---------------------------------------------------------------------------
// Animated number counters
// ---------------------------------------------------------------------------
const counterState = new WeakMap();

export function animateCounter(el, to, duration = 700) {
  const from = counterState.get(el) ?? Number(el.textContent.replace(/,/g, "")) || 0;
  counterState.set(el, to);
  const start = performance.now();

  function frame(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(lerp(from, to, eased));
    el.textContent = value.toLocaleString("en-US");
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Confetti burst
// ---------------------------------------------------------------------------
export function triggerConfetti(originEl) {
  const rect = originEl?.getBoundingClientRect();
  const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const originY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

  const container = document.createElement("div");
  container.className = "confetti-layer";
  document.body.appendChild(container);

  const colors = ["#8b5cf6", "#22f6c8", "#ff4fa3", "#ffd166", "#7fe7ff"];
  const pieces = window.innerWidth < 640 ? 26 : 50;

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const angle = Math.random() * Math.PI * 2;
    const dist = randomInt(80, 260);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 100;
    piece.style.setProperty("--dx", `${dx}px`);
    piece.style.setProperty("--dy", `${dy}px`);
    piece.style.setProperty("--rot", `${randomInt(-540, 540)}deg`);
    piece.style.left = `${originX}px`;
    piece.style.top = `${originY}px`;
    piece.style.background = colors[i % colors.length];
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 1400);
}

// ---------------------------------------------------------------------------
// Meteor shower overlay
// ---------------------------------------------------------------------------
export function triggerMeteorShower(count = 8) {
  const layer = document.getElementById("meteor-layer");
  if (!layer) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const meteor = document.createElement("div");
      meteor.className = "meteor";
      meteor.style.left = `${randomInt(0, 100)}%`;
      meteor.style.animationDuration = `${randomInt(700, 1400)}ms`;
      layer.appendChild(meteor);
      setTimeout(() => meteor.remove(), 1600);
    }, i * 120);
  }
}

// ---------------------------------------------------------------------------
// Screen pulse / shake for big moments
// ---------------------------------------------------------------------------
export function pulseScreen() {
  document.body.classList.add("screen-pulse");
  setTimeout(() => document.body.classList.remove("screen-pulse"), 400);
}

export function shakeScreen() {
  document.body.classList.add("screen-shake");
  setTimeout(() => document.body.classList.remove("screen-shake"), 500);
}

// ---------------------------------------------------------------------------
// Weather overlays (rain / snow / storm)
// ---------------------------------------------------------------------------
let weatherTimeout = null;

export function applyWeatherEffect(type) {
  const layer = document.getElementById("weather-layer");
  if (!layer) return;
  layer.className = "";
  if (weatherTimeout) clearTimeout(weatherTimeout);

  if (!type) return;
  layer.classList.add(`weather-${type}`);

  if (type === "rain" || type === "snow") {
    const dropCount = window.innerWidth < 640 ? 30 : 60;
    layer.innerHTML = "";
    for (let i = 0; i < dropCount; i++) {
      const d = document.createElement("span");
      d.className = type === "rain" ? "raindrop" : "snowflake";
      d.style.left = `${Math.random() * 100}%`;
      d.style.animationDelay = `${Math.random() * 2}s`;
      d.style.animationDuration = `${type === "rain" ? randomInt(600, 1000) : randomInt(3000, 6000)}ms`;
      layer.appendChild(d);
    }
  }

  weatherTimeout = setTimeout(() => {
    layer.className = "";
    layer.innerHTML = "";
  }, 8000);
}

// ---------------------------------------------------------------------------
// Day / night cycle — purely cosmetic, based on the visitor's local clock
// ---------------------------------------------------------------------------
export function applyDayNightCycle() {
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 19;
  document.body.classList.toggle("is-night", isNight);
  document.body.classList.toggle("is-day", !isNight);
}

// ---------------------------------------------------------------------------
// Achievement toast
// ---------------------------------------------------------------------------
export function popToast(container, { title, subtitle, icon }) {
  const toast = document.createElement("div");
  toast.className = "toast glass";
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-subtitle">${subtitle}</div>
    </div>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-in"));
  setTimeout(() => {
    toast.classList.remove("toast-in");
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 400);
  }, 4200);
}

// ---------------------------------------------------------------------------
// Click ripple on the big button
// ---------------------------------------------------------------------------
export function spawnRipple(buttonEl, x, y) {
  const rect = buttonEl.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.left = `${x - rect.left}px`;
  ripple.style.top = `${y - rect.top}px`;
  buttonEl.appendChild(ripple);
  setTimeout(() => ripple.remove(), 900);
}

// ---------------------------------------------------------------------------
// Floating "+XP" text
// ---------------------------------------------------------------------------
export function floatXpGain(originEl, amount) {
  const rect = originEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "xp-float";
  el.textContent = `+${amount} XP`;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
