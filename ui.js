// ui.js — all DOM reads/writes live here so app.js stays about logic/data.
import { formatNumber, formatWorldAge, timeAgo } from "./utils.js";
import { animateCounter, popToast } from "./animations.js";
import { BIOMES, getBiomeIndex, clicksUntilNextBiome, CLICKS_PER_BIOME, ACHIEVEMENTS, getLevelForXp } from "./world.js";

export const dom = {};

export function cacheDom() {
  const ids = [
    "loading-screen", "app",
    "particle-canvas", "cursor-glow", "meteor-layer", "weather-layer",
    "online-count", "nickname-display", "open-profile-btn",
    "click-btn", "click-id-display",
    "stat-total-clicks", "stat-online", "stat-world-age", "stat-last-event",
    "biome-icon", "biome-name", "biome-progress-fill", "biome-progress-text",
    "event-feed", "leaderboard-list",
    "daily-challenge-text", "daily-challenge-fill", "daily-challenge-card",
    "nickname-modal", "nickname-input", "nickname-submit",
    "profile-modal", "profile-content", "close-profile",
    "achievements-modal", "achievements-grid", "open-achievements-btn", "close-achievements",
    "toast-container", "offline-banner", "xp-bar-fill", "xp-level-badge",
    "biome-banner",
  ];
  ids.forEach((id) => (dom[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id)));
}

export function showApp() {
  dom.loadingScreen.classList.add("fade-out");
  setTimeout(() => {
    dom.loadingScreen.style.display = "none";
    dom.app.classList.add("visible");
  }, 600);
}

// ---------------------------------------------------------------------------
// World stats
// ---------------------------------------------------------------------------
export function renderTotalClicks(total) {
  animateCounter(dom.statTotalClicks, total);
}

export function renderOnlineCount(n) {
  dom.statOnline.textContent = formatNumber(Math.max(n, 1));
  dom.onlineCount.textContent = formatNumber(Math.max(n, 1));
}

export function renderWorldAge(startDate) {
  if (!startDate) return;
  dom.statWorldAge.textContent = formatWorldAge(Date.now() - startDate.getTime());
}

export function renderLastEvent(event) {
  if (!event) {
    dom.statLastEvent.textContent = "The world awaits its first click.";
    return;
  }
  dom.statLastEvent.textContent = `${event.emoji} ${event.message}`;
}

export function renderBiome(totalClicks) {
  const idx = getBiomeIndex(totalClicks);
  const biome = BIOMES[idx];
  dom.biomeIcon.textContent = biome.icon;
  dom.biomeName.textContent = biome.name;

  document.body.className = document.body.className
    .split(" ")
    .filter((c) => !c.startsWith("biome-"))
    .concat(biome.class)
    .join(" ")
    .trim();

  const remaining = clicksUntilNextBiome(totalClicks);
  const intoLevel = totalClicks % CLICKS_PER_BIOME;
  const pct = idx >= BIOMES.length - 1 ? 100 : (intoLevel / CLICKS_PER_BIOME) * 100;
  dom.biomeProgressFill.style.width = `${pct}%`;
  dom.biomeProgressText.textContent =
    idx >= BIOMES.length - 1
      ? "Final biome reached — the world is complete."
      : `${formatNumber(remaining)} clicks until the next biome`;
}

export function flashBiomeUnlock() {
  dom.biomeBanner.classList.add("biome-unlock-flash");
  setTimeout(() => dom.biomeBanner.classList.remove("biome-unlock-flash"), 1500);
}

// ---------------------------------------------------------------------------
// Click ID + XP
// ---------------------------------------------------------------------------
export function showClickId(id) {
  dom.clickIdDisplay.textContent = id;
  dom.clickIdDisplay.classList.remove("pop");
  void dom.clickIdDisplay.offsetWidth;
  dom.clickIdDisplay.classList.add("pop");
}

export function renderXp(xp) {
  const { level, xpIntoLevel, xpForNextLevel } = getLevelForXp(xp);
  dom.xpLevelBadge.textContent = `LV ${level}`;
  const pct = Math.min(100, (xpIntoLevel / xpForNextLevel) * 100);
  dom.xpBarFill.style.width = `${pct}%`;
  return level;
}

// ---------------------------------------------------------------------------
// Live event feed
// ---------------------------------------------------------------------------
export function renderFeed(items) {
  dom.eventFeed.innerHTML = "";
  if (items.length === 0) {
    dom.eventFeed.innerHTML = `<li class="feed-empty">No events yet — be the first.</li>`;
    return;
  }
  for (const item of items) {
    dom.eventFeed.appendChild(buildFeedRow(item));
  }
}

export function prependFeedItem(item) {
  const row = buildFeedRow(item, true);
  dom.eventFeed.prepend(row);
  while (dom.eventFeed.children.length > 25) {
    dom.eventFeed.removeChild(dom.eventFeed.lastChild);
  }
}

function buildFeedRow(item, animateIn = false) {
  const li = document.createElement("li");
  li.className = "feed-row" + (animateIn ? " feed-row-in" : "");
  const when = item.timestamp?.toDate ? item.timestamp.toDate() : null;
  li.innerHTML = `
    <span class="feed-emoji">${item.emoji}</span>
    <span class="feed-text"><strong>${escapeHtml(item.nickname || "Someone")}</strong> — ${escapeHtml(item.message)}</span>
    <span class="feed-time">${when ? timeAgo(when) : "now"}</span>
  `;
  return li;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
export function renderLeaderboard(list, currentUid) {
  dom.leaderboardList.innerHTML = "";
  if (list.length === 0) {
    dom.leaderboardList.innerHTML = `<li class="feed-empty">No clicks yet.</li>`;
    return;
  }
  list.forEach((user, i) => {
    const li = document.createElement("li");
    li.className = "leaderboard-row" + (user.id === currentUid ? " leaderboard-you" : "");
    const medals = ["🥇", "🥈", "🥉"];
    li.innerHTML = `
      <span class="lb-rank">${medals[i] || `#${i + 1}`}</span>
      <span class="lb-name">${escapeHtml(user.nickname || "Anonymous")}</span>
      <span class="lb-clicks">${formatNumber(user.totalClicks || 0)}</span>
    `;
    dom.leaderboardList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
export function openModal(el) {
  el.classList.add("modal-open");
}
export function closeModal(el) {
  el.classList.remove("modal-open");
}

export function promptNickname(defaultValue = "") {
  return new Promise((resolve) => {
    dom.nicknameInput.value = defaultValue;
    openModal(dom.nicknameModal);
    setTimeout(() => dom.nicknameInput.focus(), 200);

    function submit() {
      const value = dom.nicknameInput.value.trim().slice(0, 20) || "Explorer";
      cleanup();
      resolve(value);
    }
    function onKey(e) {
      if (e.key === "Enter") submit();
    }
    function cleanup() {
      dom.nicknameSubmit.removeEventListener("click", submit);
      dom.nicknameInput.removeEventListener("keydown", onKey);
      closeModal(dom.nicknameModal);
    }
    dom.nicknameSubmit.addEventListener("click", submit);
    dom.nicknameInput.addEventListener("keydown", onKey);
  });
}

export function renderProfile(user, uid) {
  const { level, xpIntoLevel, xpForNextLevel } = getLevelForXp(user.xp || 0);
  dom.profileContent.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${(user.nickname || "?")[0].toUpperCase()}</div>
      <div>
        <div class="profile-name">${escapeHtml(user.nickname || "Anonymous")}</div>
        <div class="profile-id">${uid.slice(0, 8)}</div>
      </div>
    </div>
    <div class="profile-stats-grid">
      <div class="profile-stat"><span class="ps-value">${formatNumber(user.totalClicks || 0)}</span><span class="ps-label">Clicks</span></div>
      <div class="profile-stat"><span class="ps-value">${level}</span><span class="ps-label">Level</span></div>
      <div class="profile-stat"><span class="ps-value">${formatNumber(user.xp || 0)}</span><span class="ps-label">Total XP</span></div>
      <div class="profile-stat"><span class="ps-value">${user.streak || 0}🔥</span><span class="ps-label">Day Streak</span></div>
    </div>
    <div class="xp-progress">
      <div class="xp-progress-label">${xpIntoLevel} / ${xpForNextLevel} XP to level ${level + 1}</div>
      <div class="xp-progress-track"><div class="xp-progress-fill" style="width:${(xpIntoLevel / xpForNextLevel) * 100}%"></div></div>
    </div>
    <div class="profile-achievements-label">Achievements (${(user.achievements || []).length}/${ACHIEVEMENTS.length})</div>
    <div class="profile-achievements-mini">
      ${ACHIEVEMENTS.map(
        (a) => `<span class="mini-badge ${(user.achievements || []).includes(a.id) ? "unlocked" : "locked"}" title="${a.name}">${a.icon}</span>`
      ).join("")}
    </div>
  `;
}

export function renderAchievementsGrid(unlockedIds) {
  dom.achievementsGrid.innerHTML = ACHIEVEMENTS.map((a) => {
    const unlocked = unlockedIds.includes(a.id);
    return `
      <div class="achievement-card ${unlocked ? "unlocked" : "locked"}">
        <div class="achievement-icon">${unlocked ? a.icon : "🔒"}</div>
        <div class="achievement-name">${a.name}</div>
        <div class="achievement-desc">${a.desc}</div>
      </div>
    `;
  }).join("");
}

// ---------------------------------------------------------------------------
// Daily challenge
// ---------------------------------------------------------------------------
export function renderDailyChallenge(challenge, progress) {
  if (!challenge) return;
  dom.dailyChallengeText.textContent = challenge.label;
  const pct = Math.min(100, (progress / challenge.goal) * 100);
  dom.dailyChallengeFill.style.width = `${pct}%`;
  dom.dailyChallengeCard.classList.toggle("challenge-complete", progress >= challenge.goal);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function toast(opts) {
  popToast(dom.toastContainer, opts);
}

// ---------------------------------------------------------------------------
// Offline banner
// ---------------------------------------------------------------------------
export function setOfflineBanner(isOffline) {
  dom.offlineBanner.classList.toggle("visible", isOffline);
}

// ---------------------------------------------------------------------------
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
