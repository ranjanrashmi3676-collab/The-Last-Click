// leaderboard.js — wires the realtime leaderboard query to the UI layer.
import { subscribeLeaderboard } from "./firebase.js";
import { renderLeaderboard } from "./ui.js";

let unsubscribe = null;

/** Start listening to the top-10 leaderboard. Returns a stop function. */
export function initLeaderboard(currentUid) {
  if (unsubscribe) unsubscribe();
  unsubscribe = subscribeLeaderboard((list) => {
    renderLeaderboard(list, currentUid);
  }, 10);
  return () => unsubscribe && unsubscribe();
}

export function stopLeaderboard() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
