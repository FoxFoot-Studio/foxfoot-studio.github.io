/* ============================================================
   FoxDash — script.js
   ============================================================

   ┌──────────────────────────────────────────────────────────┐
   │  🦊 HOW TO ADD OR REMOVE AN APP                          │
   │                                                          │
   │  This APPS array below is the ONLY place you edit.       │
   │  Each app is one { } block. The dashboard reads this     │
   │  list and builds one card per app, in order.             │
   │                                                          │
   │  TO ADD:    copy an existing { } block, paste it in,     │
   │             change the values, make sure there's a       │
   │             comma between blocks.                        │
   │                                                          │
   │  TO REMOVE: delete the whole { } block (including its    │
   │             trailing comma). Or comment it out with      │
   │             /* ... *​/ to keep it for later.              │
   │                                                          │
   │  FIELDS:                                                 │
   │    name   → shown as the card title                      │
   │    emoji  → the card's icon                              │
   │    desc   → one-line description under the title         │
   │    link   → folder name of the app + "/"                 │
   │             (e.g. "financefox/" — this matches the       │
   │             subfolder in your repo)                      │
   │    color  → OPTIONAL stripe colour for the card's left   │
   │             edge. Delete the line to use fox orange.     │
   └──────────────────────────────────────────────────────────┘
*/

const APPS = [
  {
    name: "FinanceFox",
    emoji: "🏦",
    desc: "Income, outgoings, bills and debts — the money den.",
    link: "financefox/index.html",
    color: "#e8590c",
  },
  {
    name: "CountingFoxes",             // ← rename me
    emoji: "🦊",
    desc: "A simple word counting app",
    link: "countingfoxes/index.html",            // ← must match the folder name
    color: "#7048e8",
  },
  {
    name: "ResponseFox",
    emoji: "📖",
    desc: "Comparing Responses ScratchPad.",
    link: "responsefox/ResponseFox.html",
    color: "#0ca678",
  },


  /* ── PARKED APPS ─────────────────────────────────────────
     Apps you've removed from the dashboard but might bring
     back later. Move { } blocks down here and wrap them in
     comment markers, like this:

  {
    name: "Old Experiment",
    emoji: "🧪",
    desc: "Retired for now.",
    link: "old-experiment/",
  },

  ───────────────────────────────────────────────────────── */
];


/* ============================================================
   BELOW THIS LINE: the machinery.
   You shouldn't need to touch anything under here when
   adding or removing apps — but read it, it's short!
   ============================================================ */


/* ---------- BUILD THE CARDS ----------
   Loops over APPS and creates one clickable card per entry. */
function buildCards() {
  const grid = document.getElementById("app-grid");
  const emptyMessage = document.getElementById("empty-message");

  // If the list is empty, show the friendly empty-den message
  if (APPS.length === 0) {
    emptyMessage.hidden = false;
    return;
  }

  APPS.forEach((app) => {
    const card = document.createElement("a");
    card.className = "app-card";
    card.href = app.link;

    // Per-app stripe colour (falls back to CSS default if absent)
    if (app.color) {
      card.style.borderLeftColor = app.color;
    }

    card.innerHTML = `
      <span class="app-emoji">${app.emoji}</span>
      <h2>${app.name}</h2>
      <p>${app.desc}</p>
    `;

    grid.appendChild(card);
  });
}


/* ---------- THEME TOGGLE ----------
   Swaps data-theme on <html> between "dark" and "light".
   The CSS variables in style.css do the actual restyling.
   The choice is saved to localStorage so it survives refreshes
   (wrapped in try/catch in case storage is unavailable). */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  // Button shows the theme you'd SWITCH TO, not the current one
  const button = document.getElementById("theme-toggle");
  button.textContent = theme === "dark" ? "☀️" : "🌙";

  try {
    localStorage.setItem("foxdash-theme", theme);
  } catch (e) {
    // Storage blocked (private mode etc.) — theme still works,
    // it just won't be remembered on the next visit.
  }
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem("foxdash-theme");
  } catch (e) {
    // Storage unavailable — fall through to system preference
  }

  // Priority: saved choice → system dark-mode setting → light
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
}


/* ---------- BOOT ---------- */
buildCards();
initTheme();
