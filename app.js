// app.js — the conductor. Imports every module and wires events, data, and UI.
import {
  auth, signInAnon, ensureWorldDoc, ensureUserDoc, subscribeUserDoc, updateUserDoc,
  subscribeWorldState, subscribeClickFeed, subscribeOnlineCount, heartbeatPresence,
  recordClick, recordUserClickStats, addUserAchievement, setUserNickname,
} from "./firebase.js";
import {
  BIOMES, getBiomeIndex, generateWorldEvent, calculateXpGain, checkNewAchievements,
  WEATHER_FOR_EVENT,
} from "./world.js";
import {
  generateClickId, formatNumber, timeAgo, throttle, storage, todayKey, todaySeed,
  seededRandom, vibrate,
} from "./utils.js";
import {
  cacheDom, dom, showApp, renderTotalClicks, renderOnlineCount, renderWorldAge,
  renderLastEvent, renderBiome, flashBiomeUnlock, showClickId, renderXp, renderFeed,
  prependFeedItem, openModal, closeModal, promptNickname, renderProfile,
  renderAchievementsGrid, renderDailyChallenge, toast, setOfflineBanner,
} from "./ui.js";
import {
  initParticles, initCursorGlow, triggerConfetti, triggerMeteorShower, pulseScreen,
  shakeScreen, applyWeatherEffect, applyDayNightCycle, spawnRipple, floatXpGain,
} from "./animations.js";
import { initLeaderboard } from "./leaderboard.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let uid = null;
let currentUser = null; // latest snapshot of /users/{uid}
let worldStartDate = null;
let worldTotalClicks = 0;

const DAILY_CHALLENGES = [
  { label: "Click 15 times today", goal: 15 },
  { label: "Trigger 3 different world events", goal: 3, kind: "unique" },
  { label: "Click 30 times today", goal: 30 },
  { label: "Trigger a rare event today", goal: 1, kind: "rare" },
  { label: "Click 20 times today", goal: 20 },
];

function getTodaysChallenge() {
  const rand = seededRandom(todaySeed());
  const idx = Math.floor(rand() * DAILY_CHALLENGES.length);
  return { key: todayKey(), ...DAILY_CHALLENGES[idx] };
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------
async function boot() {
  cacheDom();
  initParticles(dom.particleCanvas);
  initCursorGlow(dom.cursorGlow);
  applyDayNightCycle();
  setInterval(applyDayNightCycle, 60000);
  wireStaticUI();
  registerServiceWorker();
  window.addEventListener("online", () => setOfflineBanner(false));
  window.addEventListener("offline", () => setOfflineBanner(true));
  setOfflineBanner(!navigator.onLine);

  try {
    const user = await signInAnon();
    uid = user.uid;

    let nickname = storage.get("tlc_nickname");
    if (!nickname) {
      nickname = await promptNickname(randomGuestName());
      storage.set("tlc_nickname", nickname);
    }
    dom.nicknameDisplay.textContent = nickname;

    await ensureWorldDoc();
    currentUser = await ensureUserDoc(uid, nickname);

    subscribeUserDoc(uid, onUserUpdate);
    subscribeWorldState(onWorldUpdate);
    subscribeClickFeed((items) => renderFeed(items), 25);
    subscribeOnlineCount((n) => renderOnlineCount(n));
    initLeaderboard(uid);

    heartbeatPresence(uid, nickname);
    setInterval(() => heartbeatPresence(uid, nickname), 20000);

    setInterval(() => {
      if (worldStartDate) renderWorldAge(worldStartDate);
    }, 1000);

    ensureDailyChallenge();
    showApp();
  } catch (err) {
    console.error("Boot failed:", err);
    dom.loadingScreen.querySelector(".loading-status").textContent =
      "Connection failed. Check your Firebase config in firebase.js and your network, then reload.";
  }
}

function randomGuestName() {
  const adjectives = ["Silent", "Cosmic", "Neon", "Quantum", "Lucid", "Solar", "Astral", "Hidden"];
  const nouns = ["Wanderer", "Voyager", "Spark", "Drifter", "Signal", "Nomad", "Echo", "Pioneer"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return `${a} ${n}`;
}

// ---------------------------------------------------------------------------
// Realtime callbacks
// ---------------------------------------------------------------------------
function onWorldUpdate(world) {
  worldTotalClicks = world.totalClicks || 0;
  renderTotalClicks(worldTotalClicks);
  renderBiome(worldTotalClicks);
  renderLastEvent(world.lastEvent);
  if (world.worldStartedAt?.toDate) {
    worldStartDate = world.worldStartedAt.toDate();
    renderWorldAge(worldStartDate);
  }
}

function onUserUpdate(user) {
  const prevAchievements = currentUser?.achievements || [];
  currentUser = user;
  const level = renderXp(user.xp || 0);
  currentUser._level = level;

  if (dom.profileModal.classList.contains("modal-open")) {
    renderProfile(user, uid);
  }
  if (dom.achievementsModal.classList.contains("modal-open")) {
    renderAchievementsGrid(user.achievements || []);
  }

  // Surface any achievement that appeared since our last snapshot (covers
  // multi-tab / multi-device sync too, not just this tab's own clicks).
  const newlyPresent = (user.achievements || []).filter((id) => !prevAchievements.includes(id));
  // (Toasts for achievements the *current click* earned are fired directly
  // in handleClick for snappier feedback; this guards other cases.)
  void newlyPresent;

  const challenge = getTodaysChallenge();
  if (user.dailyChallenge?.key === challenge.key) {
    renderDailyChallenge(challenge, user.dailyChallenge.progress || 0);
  }
}

// ---------------------------------------------------------------------------
// The click
// ---------------------------------------------------------------------------
const handleClick = throttle(async (clientX, clientY) => {
  if (!uid || !currentUser) return;

  const event = generateWorldEvent();
  const clickId = generateClickId();
  const xpGain = calculateXpGain(event);
  const nickname = currentUser.nickname;

  spawnRipple(dom.clickBtn, clientX, clientY);
  pulseScreen();
  vibrate(15);
  showClickId(clickId);
  floatXpGain(dom.clickBtn, xpGain);

  if (event.rare) {
    shakeScreen();
    triggerConfetti(dom.clickBtn);
  }
  if (event.type === "meteor") triggerMeteorShower();
  if (WEATHER_FOR_EVENT[event.type]) applyWeatherEffect(WEATHER_FOR_EVENT[event.type]);

  try {
    const result = await recordClick({
      uid,
      nickname,
      event,
      clickId,
      biomeIndexFor: getBiomeIndex,
    });

    if (result.biomeJustUnlocked) {
      flashBiomeUnlock();
      triggerConfetti(dom.clickBtn);
      toast({
        icon: BIOMES[result.biomeIndex].icon,
        title: "New biome unlocked!",
        subtitle: `The world has entered the ${BIOMES[result.biomeIndex].name} era.`,
      });
    }

    await recordUserClickStats(uid, {
      xpGain,
      eventType: event.type,
      isRare: !!event.rare,
      biomeUnlockedByMe: result.biomeJustUnlocked,
    });

    await updateStreakAndChallenge(event);
    await evaluateAchievements(result.biomeJustUnlocked);
  } catch (err) {
    console.error("Click failed to sync:", err);
    toast({ icon: "⚠️", title: "Sync issue", subtitle: "That click will sync once you're back online." });
  }
}, 120);

async function updateStreakAndChallenge(event) {
  const today = todayKey();
  const updates = {};

  if (currentUser.lastClickDay !== today) {
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    })();
    updates.streak = currentUser.lastClickDay === yesterday ? (currentUser.streak || 0) + 1 : 1;
    updates.lastClickDay = today;
  }

  const challenge = getTodaysChallenge();
  let dc = currentUser.dailyChallenge;
  if (!dc || dc.key !== challenge.key) {
    dc = { key: challenge.key, progress: 0 };
  }
  const before = dc.progress || 0;
  if (challenge.kind === "rare") {
    if (event.rare) dc = { ...dc, progress: 1 };
  } else if (challenge.kind === "unique") {
    const uniqueCount = new Set([...(currentUser.uniqueEventTypes || []), event.type]).size;
    dc = { ...dc, progress: Math.min(uniqueCount, challenge.goal) };
  } else {
    dc = { ...dc, progress: (dc.progress || 0) + 1 };
  }
  updates.dailyChallenge = dc;

  if (Object.keys(updates).length) {
    await updateUserDoc(uid, updates);
    if ((dc.progress || 0) >= challenge.goal && before < challenge.goal) {
      toast({ icon: "🎯", title: "Daily challenge complete!", subtitle: challenge.label });
      triggerConfetti(dom.dailyChallengeCard);
    }
  }
}

async function evaluateAchievements(biomeJustUnlocked) {
  const stats = {
    totalClicks: (currentUser.totalClicks || 0) + 1,
    uniqueEventTypes: new Set(currentUser.uniqueEventTypes || []).size,
    rareEventsTriggered: currentUser.rareEventsTriggered || 0,
    biomesUnlocked: (currentUser.biomesUnlocked || 0) + (biomeJustUnlocked ? 1 : 0),
    level: currentUser._level || 1,
  };
  const newly = checkNewAchievements(stats, currentUser.achievements || []);
  for (const a of newly) {
    await addUserAchievement(uid, a.id);
    toast({ icon: a.icon, title: `Achievement unlocked: ${a.name}`, subtitle: a.desc });
    triggerConfetti(dom.clickBtn);
  }
}

function ensureDailyChallenge() {
  const challenge = getTodaysChallenge();
  if (!currentUser.dailyChallenge || currentUser.dailyChallenge.key !== challenge.key) {
    updateUserDoc(uid, { dailyChallenge: { key: challenge.key, progress: 0 } });
    renderDailyChallenge(challenge, 0);
  } else {
    renderDailyChallenge(challenge, currentUser.dailyChallenge.progress || 0);
  }
}

// ---------------------------------------------------------------------------
// Static UI wiring: buttons, modals, easter eggs
// ---------------------------------------------------------------------------
function wireStaticUI() {
  // "click" fires for mouse, touch, AND keyboard activation (Enter/Space on
  // a focused button), so this single listener keeps the button accessible.
  // touch-action: manipulation in CSS removes the old 300ms mobile tap delay.
  dom.clickBtn.addEventListener("click", (e) => {
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    handleClick(x, y);
  });

  dom.openProfileBtn.addEventListener("click", () => {
    if (currentUser) renderProfile(currentUser, uid);
    openModal(dom.profileModal);
  });
  dom.closeProfile.addEventListener("click", () => closeModal(dom.profileModal));

  dom.openAchievementsBtn.addEventListener("click", () => {
    renderAchievementsGrid(currentUser?.achievements || []);
    openModal(dom.achievementsModal);
  });
  dom.closeAchievements.addEventListener("click", () => closeModal(dom.achievementsModal));

  document.querySelectorAll("[data-modal-backdrop]").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop);
    });
  });

  dom.nicknameDisplay.addEventListener("click", async () => {
    const newName = await promptNickname(dom.nicknameDisplay.textContent);
    dom.nicknameDisplay.textContent = newName;
    storage.set("tlc_nickname", newName);
    if (uid) await setUserNickname(uid, newName);
  });

  // --- Easter egg #1: click the title 10x quickly -> hidden portal ---
  let titleClicks = 0;
  let titleTimer = null;
  const titleEl = document.getElementById("main-title");
  titleEl.addEventListener("click", () => {
    titleClicks++;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => (titleClicks = 0), 3000);
    if (titleClicks >= 10) {
      titleClicks = 0;
      triggerMeteorShower(14);
      triggerConfetti(titleEl);
      toast({ icon: "🌀", title: "Hidden portal found!", subtitle: "You discovered a secret behind the title." });
    }
  });

  // --- Easter egg #2: Konami code -> rainbow storm ---
  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  let konamiIdx = 0;
  window.addEventListener("keydown", (e) => {
    konamiIdx = e.key === KONAMI[konamiIdx] ? konamiIdx + 1 : 0;
    if (konamiIdx === KONAMI.length) {
      konamiIdx = 0;
      document.body.classList.add("rainbow-mode");
      triggerConfetti(dom.clickBtn);
      toast({ icon: "🎮", title: "Konami code!", subtitle: "The world shimmers with color for a moment." });
      setTimeout(() => document.body.classList.remove("rainbow-mode"), 6000);
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    });
  }
}

boot();
