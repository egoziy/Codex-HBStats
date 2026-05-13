# HBS Stats — Mobile Prototype

High-fidelity mobile prototype for HBS Stats / ליגת העל, designed to match the real product (Hebrew RTL, red brand, real Israeli Premier League teams).

## Running it

This is a static HTML prototype — no build step, no `npm install`. You just need to serve the folder over HTTP (opening `index.html` via `file://` won't work because of how Babel loads the `.jsx` files).

### Option A — VS Code Live Server (recommended)

1. Open this folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` → **Open with Live Server**.

### Option B — Any local server

From this folder:

```bash
# Python 3
python3 -m http.server 5500

# Node
npx serve .
```

Then open <http://localhost:5500>.

## Structure

```
hbs-mobile/
├── index.html              ← entry — load this
├── app-il.jsx              ← top-level App + routing + Tweaks defaults
├── data-il.js              ← all mock data (teams, standings, fixtures, scorers…)
├── ios-frame.jsx           ← iPhone bezel / status bar
├── tweaks-panel.jsx        ← Tweaks UI controls
└── components/
    ├── il-shared.jsx       ← theme, header, bottom nav, crest, form pills, chips, tabs
    ├── il-screens.jsx      ← Home / Standings / Matches / Players / Live
    └── il-detail.jsx       ← Match detail / Team detail / Player detail
```

All files are vanilla **React 18 + Babel-in-browser JSX**, no bundler. The HTML pulls React, ReactDOM and Babel from `unpkg`, and Heebo + JetBrains Mono from Google Fonts.

## Customising

### Brand color, theme, layouts
Open `index.html` (or click the **Tweaks** toggle if running inside Omelette) — there's a floating panel with:
- Dark mode toggle
- Brand color (4 swatches)
- Live ticker stripe toggle
- Standings layout: **Table** / **Cards** / **Bars**
- Density: Compact / Regular / Spacious

### Swapping in real data
`data-il.js` exports a single `window.IL` object:

```js
window.IL = {
  TEAMS, STANDINGS, FIXTURES, SCORERS, ASSISTERS,
  SUSPENDED, CAUTIONS, NEWS,
  MATCH_DETAIL, PLAYER_DETAIL, TICKER, zone,
};
```

Replace the literal arrays at the top of the file with `fetch()` calls against your API, then call `ReactDOM.createRoot(...).render(<ILPage/>)` after the data settles. Each shape is documented inline.

### Swapping in real team crests
Right now each team uses a **color-blocked Hebrew monogram** (`team.mono`) as a placeholder. To use real crest images:

1. Drop SVG/PNG files into `hbs-mobile/crests/` (e.g. `hbs-mobile/crests/hapoel-bs.svg`).
2. Add a `crest` field to each team in `IL_TEAM_DEFS` and propagate it through `IL_TEAMS`.
3. Edit `ILCrest` in `components/il-shared.jsx` to render an `<img>` when `team.crest` is present.

(Note: club crests are usually trademarked. Make sure you have the right to use them.)

### Player photos
Same story — `PlayerAvatar` in `components/il-screens.jsx` renders a striped placeholder. Replace with an `<img src={p.photo}>` once you have headshot URLs.

## Notes

- **Source data** in this prototype was hand-typed from screenshots of the real site, so numbers match a single snapshot in time — they will drift from live.
- **Original Atlas Premier version** (English, generic teams) is preserved separately as `HBS Stats Mobile.html` in the parent project; this folder contains only the Hebrew Israeli-league v2.
- **No build step** keeps this fast to iterate on visually but means you can't use TypeScript or imports/exports the way you would in a real React app. If/when you want to migrate this into a proper project (Vite, Next, etc.), the components are written in standard React — you just need to swap the `Object.assign(window, …)` exports at the bottom of each file for `export {…}` and add the corresponding imports at the top.
