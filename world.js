// world.js — the rules that govern the shared world
import { weightedChoice, randomInt } from "./utils.js";

/** A new biome unlocks every CLICKS_PER_BIOME global clicks. */
export const CLICKS_PER_BIOME = 500;

export const BIOMES = [
  { id: "genesis", name: "Genesis Void", icon: "✨", class: "biome-genesis" },
  { id: "forest", name: "Forest", icon: "🌲", class: "biome-forest" },
  { id: "ocean", name: "Ocean", icon: "🌊", class: "biome-ocean" },
  { id: "desert", name: "Desert", icon: "🏜️", class: "biome-desert" },
  { id: "cyber", name: "Cyber City", icon: "🌆", class: "biome-cyber" },
  { id: "space", name: "Space", icon: "🪐", class: "biome-space" },
  { id: "volcano", name: "Volcano", icon: "🌋", class: "biome-volcano" },
  { id: "ice", name: "Ice World", icon: "❄️", class: "biome-ice" },
  { id: "dream", name: "Dream World", icon: "🌌", class: "biome-dream" },
];

export function getBiomeIndex(totalClicks) {
  const idx = Math.floor(totalClicks / CLICKS_PER_BIOME);
  return Math.min(idx, BIOMES.length - 1);
}

export function getBiome(totalClicks) {
  return BIOMES[getBiomeIndex(totalClicks)];
}

export function clicksUntilNextBiome(totalClicks) {
  const idx = getBiomeIndex(totalClicks);
  if (idx >= BIOMES.length - 1) return 0;
  return (idx + 1) * CLICKS_PER_BIOME - totalClicks;
}

/**
 * The world event pool. `weight` controls rarity — lower is rarer.
 * `xp` is the base XP awarded when this event fires.
 * `rare` events count toward the "Lucky Click" achievement.
 */
export const EVENT_POOL = [
  { type: "tree", emoji: "🌳", message: "A tree grows somewhere in the world.", weight: 20, xp: 2 },
  { type: "flower", emoji: "🌸", message: "A flower blooms in the wind.", weight: 18, xp: 2 },
  { type: "star", emoji: "⭐", message: "A new star ignites in the sky.", weight: 16, xp: 3 },
  { type: "cloud", emoji: "☁️", message: "A cloud drifts into being.", weight: 16, xp: 1 },
  { type: "rain", emoji: "🌧️", message: "Rain begins to fall.", weight: 12, xp: 2 },
  { type: "snow", emoji: "🌨️", message: "Snow dusts the ground.", weight: 10, xp: 2 },
  { type: "wave", emoji: "🌊", message: "A wave crashes in the distance.", weight: 10, xp: 2 },
  { type: "crystal", emoji: "💎", message: "A crystal forms in the dark.", weight: 8, xp: 4 },
  { type: "lightning", emoji: "⚡", message: "Lightning splits the sky.", weight: 7, xp: 4 },
  { type: "rainbow", emoji: "🌈", message: "A rainbow arcs across the world.", weight: 5, xp: 6 },
  { type: "aurora", emoji: "🌠", message: "Auroras ripple over the horizon.", weight: 5, xp: 6 },
  { type: "volcano", emoji: "🌋", message: "A volcano erupts in the distance.", weight: 3, xp: 8, rare: true },
  { type: "meteor", emoji: "☄️", message: "A meteor shower streaks overhead.", weight: 2, xp: 10, rare: true },
  { type: "portal", emoji: "🌀", message: "A hidden portal flickers open.", weight: 1, xp: 15, rare: true },
  { type: "ruins", emoji: "🏛️", message: "Ancient ruins surface from the ground.", weight: 1, xp: 15, rare: true },
];

export function generateWorldEvent() {
  return weightedChoice(EVENT_POOL.map((e) => ({ value: e, weight: e.weight })));
}

/** XP awarded for a click: base event XP + small random bonus. */
export function calculateXpGain(event) {
  return event.xp + randomInt(0, 3);
}

/** Level curve: each level needs progressively more XP. */
export function getLevelForXp(xp) {
  let level = 1;
  let needed = 50;
  let remaining = xp;
  while (remaining >= needed) {
    remaining -= needed;
    level++;
    needed = Math.round(needed * 1.35);
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: needed };
}

export const ACHIEVEMENTS = [
  {
    id: "first_click",
    name: "First Click",
    desc: "Make your very first click.",
    icon: "🖱️",
    check: (stats) => stats.totalClicks >= 1,
  },
  {
    id: "ten_clicks",
    name: "10 Clicks",
    desc: "Click 10 times.",
    icon: "🔟",
    check: (stats) => stats.totalClicks >= 10,
  },
  {
    id: "hundred_clicks",
    name: "100 Clicks",
    desc: "Click 100 times.",
    icon: "💯",
    check: (stats) => stats.totalClicks >= 100,
  },
  {
    id: "thousand_clicks",
    name: "1000 Clicks",
    desc: "Click 1,000 times.",
    icon: "🏆",
    check: (stats) => stats.totalClicks >= 1000,
  },
  {
    id: "explorer",
    name: "Explorer",
    desc: "Trigger 5 different kinds of world events.",
    icon: "🧭",
    check: (stats) => stats.uniqueEventTypes >= 5,
  },
  {
    id: "lucky_click",
    name: "Lucky Click",
    desc: "Trigger a rare world event.",
    icon: "🍀",
    check: (stats) => stats.rareEventsTriggered >= 1,
  },
  {
    id: "world_builder",
    name: "World Builder",
    desc: "Be the click that unlocks a new biome.",
    icon: "🏗️",
    check: (stats) => stats.biomesUnlocked >= 1,
  },
  {
    id: "legend",
    name: "Legend",
    desc: "Reach level 10.",
    icon: "👑",
    check: (stats) => stats.level >= 10,
  },
];

export function checkNewAchievements(stats, alreadyUnlocked) {
  return ACHIEVEMENTS.filter((a) => !alreadyUnlocked.includes(a.id) && a.check(stats));
}

/** Weather is a lighter-weight cosmetic layer, loosely tied to recent events. */
export const WEATHER_FOR_EVENT = {
  rain: "rain",
  snow: "snow",
  lightning: "storm",
  meteor: "meteor",
  aurora: "aurora",
};
