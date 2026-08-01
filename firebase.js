// firebase.js — all Firebase wiring lives here. Every other module talks to
// Firestore only through the functions exported below.

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
  arrayUnion,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------------------------------------------------------------------------
// 1. PASTE YOUR FIREBASE PROJECT CONFIG HERE.
//    See README.md → "Firebase setup" for step-by-step instructions.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Offline support: cache reads/writes locally and sync when back online.
enableIndexedDbPersistence(db).catch(() => {
  // Fails silently in multi-tab scenarios or unsupported browsers —
  // the app still works, it just won't cache across tabs.
});

const WORLD_DOC = doc(db, "world", "state");
const CLICK_EVENTS = collection(db, "clickEvents");
const USERS = collection(db, "users");
const PRESENCE = collection(db, "presence");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Sign the visitor in anonymously and resolve once we have a uid. */
export function signInAnon() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user);
        }
      },
      reject
    );
    signInAnonymously(auth).catch(reject);
  });
}

// ---------------------------------------------------------------------------
// World document
// ---------------------------------------------------------------------------

/** Create the shared world document if it doesn't exist yet (first-ever visitor). */
export async function ensureWorldDoc() {
  const snap = await getDoc(WORLD_DOC);
  if (!snap.exists()) {
    await setDoc(WORLD_DOC, {
      totalClicks: 0,
      biomeIndex: 0,
      worldStartedAt: serverTimestamp(),
      lastEvent: null,
    });
  }
  return (await getDoc(WORLD_DOC)).data();
}

export function subscribeWorldState(callback) {
  return onSnapshot(WORLD_DOC, (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export function subscribeClickFeed(callback, feedLimit = 25) {
  const q = query(CLICK_EVENTS, orderBy("timestamp", "desc"), limit(feedLimit));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export function subscribeLeaderboard(callback, topN = 10) {
  const q = query(USERS, orderBy("totalClicks", "desc"), limit(topN));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    callback(items);
  });
}

// ---------------------------------------------------------------------------
// User document
// ---------------------------------------------------------------------------

export async function ensureUserDoc(uid, nickname) {
  const ref = doc(USERS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      nickname,
      xp: 0,
      level: 1,
      totalClicks: 0,
      achievements: [],
      uniqueEventTypes: [],
      rareEventsTriggered: 0,
      biomesUnlocked: 0,
      streak: 0,
      lastClickDay: null,
      createdAt: serverTimestamp(),
      dailyChallenge: null,
    });
    return (await getDoc(ref)).data();
  }
  return snap.data();
}

export function subscribeUserDoc(uid, callback) {
  return onSnapshot(doc(USERS, uid), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function updateUserDoc(uid, data) {
  await updateDoc(doc(USERS, uid), data);
}

export async function setUserNickname(uid, nickname) {
  await updateDoc(doc(USERS, uid), { nickname });
}

// ---------------------------------------------------------------------------
// Presence (lightweight "online now" tracking via heartbeats)
// ---------------------------------------------------------------------------

export async function heartbeatPresence(uid, nickname) {
  await setDoc(
    doc(PRESENCE, uid),
    { nickname, lastSeen: serverTimestamp() },
    { merge: true }
  );
}

/** Re-queries every `refreshMs` so the "online" window keeps sliding forward. */
export function subscribeOnlineCount(callback, windowSeconds = 60, refreshMs = 15000) {
  let unsub = null;
  function resubscribe() {
    if (unsub) unsub();
    const cutoff = Timestamp.fromMillis(Date.now() - windowSeconds * 1000);
    const q = query(PRESENCE, where("lastSeen", ">", cutoff));
    unsub = onSnapshot(q, (snap) => callback(snap.size));
  }
  resubscribe();
  const interval = setInterval(resubscribe, refreshMs);
  return () => {
    clearInterval(interval);
    if (unsub) unsub();
  };
}

// ---------------------------------------------------------------------------
// The core action: recording a click atomically
// ---------------------------------------------------------------------------

/**
 * Runs a transaction that:
 *  1. increments the global click counter
 *  2. records the world event as the new "lastEvent"
 *  3. detects whether this click unlocked a new biome
 *  4. writes a click-feed document
 *  5. updates the user's own stats (xp, level, achievements are computed by caller)
 *
 * Returns { totalClicks, biomeIndex, biomeJustUnlocked }.
 */
export async function recordClick({ uid, nickname, event, clickId, biomeIndexFor }) {
  const result = await runTransaction(db, async (tx) => {
    const worldSnap = await tx.get(WORLD_DOC);
    const world = worldSnap.data();
    const newTotal = (world.totalClicks || 0) + 1;
    const oldBiomeIndex = world.biomeIndex || 0;
    const newBiomeIndex = biomeIndexFor(newTotal);
    const biomeJustUnlocked = newBiomeIndex > oldBiomeIndex;

    tx.update(WORLD_DOC, {
      totalClicks: increment(1),
      biomeIndex: newBiomeIndex,
      lastEvent: {
        type: event.type,
        emoji: event.emoji,
        message: event.message,
        nickname,
        timestamp: Timestamp.now(),
      },
    });

    return { totalClicks: newTotal, biomeIndex: newBiomeIndex, biomeJustUnlocked };
  });

  await addDoc(CLICK_EVENTS, {
    clickId,
    uid,
    nickname,
    type: event.type,
    emoji: event.emoji,
    message: event.message,
    biomeIndex: result.biomeIndex,
    timestamp: serverTimestamp(),
  });

  return result;
}

/**
 * Atomically apply the stat changes that result from one click to the
 * user's own document. Numeric fields use increment() and the event-type
 * set uses arrayUnion() so concurrent rapid clicks never clobber each other.
 */
export async function recordUserClickStats(uid, { xpGain, eventType, isRare, biomeUnlockedByMe }) {
  const update = {
    xp: increment(xpGain),
    totalClicks: increment(1),
    uniqueEventTypes: arrayUnion(eventType),
  };
  if (isRare) update.rareEventsTriggered = increment(1);
  if (biomeUnlockedByMe) update.biomesUnlocked = increment(1);
  await updateDoc(doc(USERS, uid), update);
}

export async function addUserAchievement(uid, achievementId) {
  await updateDoc(doc(USERS, uid), { achievements: arrayUnion(achievementId) });
}

export { serverTimestamp, increment, Timestamp };
