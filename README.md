# The Last Click

> Every visitor permanently changes this website. Every click updates a shared
> world in real time — no two visitors ever see exactly the same thing twice.

A single shared world, synced live across every visitor via Firebase
Firestore. Vanilla HTML/CSS/JS (ES Modules) — no build step, no framework,
no bundler required.

---

## 1. What's in this project

```
index.html          Page structure (loading screen, hero, feed, leaderboard, modals)
style.css            Full theme: glassmorphism, aurora background, neon button, animations
firebase.js           Firebase init + every Firestore/Auth read & write
world.js               Biomes, world events, XP/level curve, achievements
ui.js                    DOM rendering (stats, feed, leaderboard, modals, toasts)
animations.js         Particles, cursor glow, confetti, meteors, weather, counters
leaderboard.js       Wires the realtime leaderboard query to the UI
app.js                  Main entry point — wires everything together
utils.js                Small stateless helpers (formatting, IDs, RNG, storage)
manifest.json         PWA manifest
sw.js                    Service worker (offline app-shell caching)
firestore.rules        Security rules for the Firestore data model
icons/                  App icons (192px, 512px)
```

Nothing here is a placeholder — every file is complete and functional once
you plug in your own Firebase project config (step 2 below).

---

## 2. Firebase setup

### 2.1 Create a project

1. Go to <https://console.firebase.google.com/> and click **Add project**.
2. Name it (e.g. `the-last-click`) and finish the wizard (Google Analytics
   is optional — you can skip it).

### 2.2 Register a Web App

1. In the project overview, click the **</>** (Web) icon to add a web app.
2. Give it a nickname (e.g. "Last Click Web"). You do **not** need Firebase
   Hosting at this step — skip that checkbox unless you plan to deploy via
   Firebase Hosting (see §4.2).
3. Firebase will show you a `firebaseConfig` object that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "the-last-click.firebaseapp.com",
     projectId: "the-last-click",
     storageBucket: "the-last-click.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456",
   };
   ```

4. Open **`firebase.js`** in this project and paste your values into the
   `firebaseConfig` object near the top of the file (it currently has
   placeholder strings like `"YOUR_API_KEY"` — replace all six fields).

### 2.3 Enable Anonymous Authentication

1. In the Firebase Console sidebar: **Build → Authentication → Get started**.
2. Go to the **Sign-in method** tab.
3. Click **Anonymous**, toggle it **Enable**, and **Save**.

This is the only auth provider the app uses — visitors never see a login
screen; they're signed in silently in the background.

### 2.4 Create the Firestore database

1. Sidebar: **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (we'll supply real rules next).
3. Pick a Firestore location close to your expected audience.

### 2.5 Apply the security rules

1. In Firestore, go to the **Rules** tab.
2. Delete the default contents and paste in everything from
   **`firestore.rules`** in this project.
3. Click **Publish**.

These rules:
- Let anyone **read** the world state, click feed, leaderboard, and
  presence data (so the site works without login friction).
- Only let a signed-in visitor **write** their own user/presence documents.
- Only allow the global click counter to move **forward by exactly 1** per
  update, and make the click log append-only — so the world's history can
  never be rewritten or erased.

### 2.6 (First run only) Seed nothing — the app bootstraps itself

The very first visitor's browser will automatically create the
`/world/state` document (see `ensureWorldDoc()` in `firebase.js`). You don't
need to manually create any documents or collections.

---

## 3. Running it locally

Because this uses native ES Modules (`import`/`export`), you must serve the
files over `http://` — opening `index.html` directly via `file://` will not
work (browsers block module imports from the filesystem).

Any static file server works. For example:

```bash
# Python 3
python3 -m http.server 8080

# Node (no install needed)
npx serve .

# VS Code
# Right-click index.html → "Open with Live Server"
```

Then visit `http://localhost:8080`.

---

## 4. Deployment

### 4.1 GitHub Pages

1. Create a new GitHub repository and push this project's files to the
   `main` branch (root of the repo, or a `/docs` folder — either works).
2. In your repo: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Pick the `main` branch and the folder where `index.html` lives (`/root`
   or `/docs`), then **Save**.
5. GitHub will publish your site at:
   `https://<your-username>.github.io/<repo-name>/`
6. Back in the Firebase Console: **Authentication → Settings → Authorized
   domains → Add domain**, and add your GitHub Pages domain
   (`<your-username>.github.io`) — Firebase Auth blocks requests from
   unrecognized origins by default.

That's it — no build step, no CI config needed, since this is plain
HTML/CSS/JS.

### 4.2 Firebase Hosting (alternative)

If you'd rather host on Firebase itself:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
#   - Use an existing project → pick the one you created above
#   - Public directory → "." (the folder containing index.html)
#   - Configure as a single-page app → No
#   - Set up automatic builds with GitHub → optional

firebase deploy
```

Firebase will print your live URL (`https://<project-id>.web.app`).

---

## 5. How the shared world works

- **`/world/state`** — one document holding `totalClicks`, the current
  `biomeIndex`, `worldStartedAt`, and the most recent `lastEvent`. Every
  client subscribes to it with `onSnapshot`, so all visitors see the same
  counter tick up in real time, with no page refresh.
- **`/clickEvents/{id}`** — an append-only log of every click ever made
  (nickname, event type, timestamp). The live feed shows the most recent 25.
- **`/users/{uid}`** — each visitor's own profile: nickname, XP, level,
  total clicks, streak, unlocked achievements, and today's daily challenge.
- **`/presence/{uid}`** — a heartbeat document refreshed every 20 seconds;
  "online now" counts everyone whose heartbeat is under 60 seconds old.

A new **biome** (Forest → Ocean → Desert → Cyber City → Space → Volcano →
Ice World → Dream World) unlocks every 500 global clicks — for everyone,
simultaneously, the moment the counter crosses the threshold.

## 6. Notes on scale & cost

This design favors simplicity and correctness over raw scale:
- The `totalClicks == resource.data.totalClicks + 1` security rule prevents
  batched/fraudulent increments, but does mean two clicks arriving in the
  same instant will retry via Firestore's transaction mechanism
  (`runTransaction` in `firebase.js` already handles this).
- The click feed and leaderboard queries are capped (25 and 10 documents),
  so reads stay cheap regardless of how large the click log grows.
- Presence is a simple heartbeat/poll model, not Firebase Realtime
  Database's `onDisconnect()` — good enough for an approximate "online now"
  count without adding a second Firebase product to the stack.

Enjoy — and remember: whatever you click next, someone else caused the
world to look the way it does right now.
