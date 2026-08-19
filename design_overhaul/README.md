# Handoff: Nexus Accounting — Nocturne dashboard redesign

## Overview
This package redesigns the **Nexus Accounting** browser-extension dashboard (the `nexus-addon/dashboard.html` page) from its current GitHub-dark look into the **Nocturne** design system: a quiet, compact dark-blue-grey interface with a single blurple accent used as line and glow. The redesign replaces the single 15-tab row with a **grouped left sidebar**, adds a sticky top bar with live scrape status + global filters, and restyles every stat card, chart, table and form to Nocturne tokens.

Six screens are designed in full: **Global, Surveys, Asteroid Fields, Tech Tree, Market, Scouting**. The remaining nine tabs (Pirates, Mining, Battles, Debris, Expeditions, Wormhole, Xeno, Galaxy Scout, Fleet Templates) reuse the exact same shell, card, table and chart patterns — apply the documented patterns to them.

## About the design files
The `.dc.html` files in this bundle are **design references** — HTML/JS prototypes showing the intended look and behaviour. They are **not** production code to paste in. Your task is to **recreate the design in the existing codebase's environment**: the extension is **vanilla JavaScript** (no framework, no build step) — plain `dashboard.html`, a single `dashboard.css` stylesheet, and DOM-building render functions in `tabs/*.js` + `common.js`, using **Chart.js** (`chart.umd.js`) for charts.

**Do the redesign in place. Do not rewrite in React/Vue.** Specifically:
- Keep every render function in `tabs/*.js`, `common.js`, and `dashboard.js` and **every DOM element `id`** they read/write (e.g. `g-stats-collected`, `chart-global-period`, `reports-tbody`, `mode-select`, `zone-select`, `af-results-tbody`, `tt-queue`, `m-buy`). The JS wiring must keep working untouched.
- Rework **`dashboard.css`** into a token-based stylesheet (see Design Tokens) and restyle the existing class names (`.stat-card`, `.chart-box`, `.tabs`/`.tab`, `.table`/`thead`/`tbody`, `.badge`, `.finder-controls`, `.tt-node`, `.res-icon`, etc.) to match Nocturne — this is the bulk of the work and needs no JS changes.
- Rework **`dashboard.html`** structure to introduce the sidebar shell + top bar (see "Navigation" below). This is the one place markup changes; keep all existing content `id`s.

## Fidelity
**High-fidelity.** Colours, typography, spacing, radii and states below are final — implement them exactly.

---

## Design tokens

### Nocturne base (from the bound design system — `_ds/.../styles.css`)
Prefer wiring these as CSS custom properties at `:root` and referencing `var(--…)` everywhere.

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#161826` | Page ground |
| `--color-surface` | `#232532` | Cards, panels, table rows, inputs |
| `--color-text` | `#e9e9ed` | Primary text |
| `--color-divider` | `color-mix(in srgb, #e9e9ed 16%, transparent)` | Borders, rules |
| `--color-accent` | `#9184d9` | Accent (blurple) — links, active nav, primary outline, net hero |
| Neutral ramp | `--color-neutral-100 #f3f5fe … -500 #9397ab … -800 #3f424d -900 #292b31` | Muted text (500/600), chart grid (900 `#292b31`), borders |
| Accent ramp | `--color-accent-800 #423a6a`, `-300 #d2cefd`, `-400 #b5abfc` | Tinted fills / accent text on dark |
| `--radius-md` | `8px` | Cards, inputs, buttons, tags |
| `--radius-lg` | `14px` | Hero, dialog |
| `--shadow-sm` | `0 0 0 1px #3f424d` | Card elevation (edge, not drop shadow) |
| Font | **Inter** 400/500/600 (`--font-heading`, `--font-body`), headings weight **500**, letter-spacing −0.015em | All type |
| Spacing | density 0.70×: `--space-2 5.6 / -3 8.4 / -4 11.2 / -6 16.8 / -8 22.4` (px) | Gaps, padding |

Muted text = `color-mix(in srgb, var(--color-text) 55%, transparent)`. Never pure black/white.

### Functional resource palette (data encoding — keep these recognizable across every screen)
These are categorical data colours (kept from the current app but retuned to sit on the Nocturne ground). Use for resource cell text, KPI accents, chart series, doughnut slices.

| Resource | Hex |
|---|---|
| Ore | `#e0894e` |
| Silicates | `#6fce8f` |
| Hydrogen | `#7fb8f2` |
| Alloys | `#d8b055` |
| Quantum Dust / rare | `#b9a9ef` |
| Plasma Core | `#e08a86` |

### Semantic
| Role | Hex |
|---|---|
| Success / positive net / "up" | `#6fce8f` |
| Danger / losses / "down" | `#e0736b` |
| Warning / researching | `#d8b055` |

### Zone badge colours (text colour on a `.tag-neutral` chip)
sentinel `#6fce8f` · open `#e0a24e` · dead `#e0736b` · rift `#b5abfc` · unknown `#9397ab`

### Event badge tints (background = 16% of the text colour mixed into transparent)
anomaly rift / ancient signal → `#7fb8f2` · resource cache / abandoned cargo / debris fragment → `#6fce8f` · rogue drone / booby trap → `#e0736b` · other → neutral (`--color-neutral-800` bg, `-100` text)

### Icons
**Phosphor icons** throughout (`@phosphor-icons/web`). Nav icons: Global `ph-gauge`, Surveys `ph-radar`, Pirates `ph-skull`, Mining `ph-mountains`, Battles `ph-crosshair-simple`, Debris `ph-shooting-star`, Expeditions `ph-compass`, Wormhole `ph-circle-dashed`, Xeno `ph-alien`, Galaxy Scout `ph-magnifying-glass`, Asteroid Fields `ph-planet`, Scouting `ph-binoculars`, Market `ph-scales`, Fleet Templates `ph-rocket`, Tech Tree `ph-tree-structure`. **Brand mark**: a custom inline SVG (see "Brand mark" below), not a Phosphor glyph.

---

## Navigation (the structural change to `dashboard.html`)

Replace the top `.tabs` row with a **two-column app shell**: `grid-template-columns: 238px 1fr; height: 100vh`.

### Left sidebar (`238px`, `overflow-y:auto`, right border `--color-divider`; subtle top-down accent wash: `linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 6%, var(--color-bg)), var(--color-bg) 220px)`)
- **Brand block** (top, 18px padding): a 30×30 rounded-8 box with a 1px accent border + accent glow (`box-shadow:0 0 14px color-mix(in srgb,var(--color-accent) 45%,transparent)`) holding the **Nexus orbit mark** (custom SVG, see below, ~20px); beside it "Nexus" (Inter 600, 16px) over "ACCOUNTING" (10.5px, letter-spacing 0.14em, uppercase, muted).
- **Grouped nav.** Four group headers (10px, letter-spacing 0.13em, uppercase, muted, margin 14px 16px 5px), each with items:
  - **Overview** → Global
  - **Operations** → Surveys, Pirates, Mining, Battles, Debris, Expeditions, Wormhole, Xeno
  - **Explore** → Galaxy Scout, Asteroid Fields, Scouting
  - **Market & R&D** → Market, Fleet Templates, Tech Tree
- **Nav item**: `display:flex; gap:11px; margin:1px 8px; padding:8px 10px; border-radius:8px; font-size:13.5px`. Icon (16px, 18px-wide slot) + label. Inactive text `color-mix(text 80%)`; hover `background: color-mix(text 6%)`. **Active**: `color: accent; background: color-mix(accent 15%); box-shadow: inset 2px 0 0 accent`. (Currently active-tab logic lives in `dashboard.js` `document.querySelectorAll('.tab')…` — repoint it at the sidebar items; keep the `data-tab` → content-`id` show/hide mechanism exactly as-is.)
- **Footer** (margin-top:auto, top border): storage line `ph-database  47,912 reports · ~18.4 MB` (wire to the existing `storage-footer` text) + a `Combat Simulator` link (`ph-crosshair-simple`, accent) pointing at `simulator.html`.

### Top bar (sticky, inside the main column)
`position:sticky; top:0; display:flex; flex-wrap:wrap; gap:12px 16px; padding:16px 24px; background:color-mix(bg 82%); backdrop-filter:blur(10px); border-bottom:1px divider`.
- Left: **screen title** (h1, 22px, letter-spacing −0.02em, single line + ellipsis) over a **subtitle** (12.5px muted, ellipsis). Title column `flex:1 1 220px; min-width:180px`.
- A live-status pill: 7px green (`#6fce8f`) dot with glow + `nxpulse` 2s animation + "Scraped 2m ago" (wire to `status-text`).
- **View** segmented control (All time / 7 days / Hourly → the existing `mode-select` values) — an inline row inside a 1px-divider rounded-8 border; active option `color:accent; box-shadow:inset 0 0 0 1px accent`.
- **Zone** select (existing `zone-select`) styled as `.input`.
- **Scrape Now** = `.btn .btn-primary` (accent outline, `ph-arrows-clockwise`) → existing `btn-scrape` handler.
- The other global controls (Days pickers, Records cap, Reset/Rebuild/Export/Import) move into an overflow "⋯" menu or a settings dialog (Nocturne `.dialog`) to declutter — keep their element `id`s.

The existing `positionControls()` in `dashboard.js` moves the controls bar above each tab's charts; with the fixed top bar you can retire that and keep the View/Zone controls permanently in the top bar.

---

## Screens

### 1. Global (`#global-content` — renderer `tabs/global.js`)
- **Net hero** (full-width, `radius-lg`, padding 24px, `background: linear-gradient(120deg, color-mix(accent 16%, surface), surface 62%)`, `shadow-sm`): kicker "NET GAIN · ALL SOURCES · ALL TIME" (11px, accent, uppercase, 0.1em); the weighted total (Inter 600, **52px**, −0.03em) in `--color-text`; a "▲ 8.4% vs last week" chip in success green + the weighting legend in muted; on the right a 260×80 accent **sparkline** (line `#9184d9` 2.5px + vertical alpha-fade area fill). Wire the value from `renderNetCards`'s weighted total.
- **KPI strip**: `grid` of 5 equal cards (Ore, Silicates, Hydrogen, Alloys, Operations). Card = `surface`, `radius-md`, padding var, `shadow-sm`, **2px top border in the resource colour**. Content: 11px uppercase muted label; 26px Inter-600 value in the resource colour (Operations uses accent); a trend line "▲/▼ x.x%" in success/danger. These map to the existing `makeStatCard` output — restyle `.stat-card` to this and add the top-border-by-resource rule.
- **Charts row**: `grid 1.55fr 1fr`. Left "Collected per period" line chart (`chart-global-period`), right "Collected composition" doughnut (`chart-global`), both in `surface` cards (padding 18, title Inter 15px). See Chart.js theming below.
- **Share by source**: a `surface` card with horizontal bars — label (96px) · track (`height:9px; radius:6; background:color-mix(text 7%)`) with a coloured fill · right-aligned % (tabular-nums). Source colours: Survey accent, Mining `#d8b055`, Pirates `#e0736b`, Debris `#6fce8f`, Expeditions `#b9a9ef`, Wormhole `#5fb0c9`, Xeno `#d8a24e`. (Replaces the current `chart-global-source` doughnut — either restyle as a doughnut or switch to these bars.)

### 2. Surveys (`#main-content` — `tabs/surveys.js`)
- **Event filter** as a chip row (existing `event-select` options): pill chips, `padding:5px 12px; radius:20px; border:1px divider`; selected chip `color:accent; background:color-mix(accent 12%); border-color:accent`. (Restyle from the native select, or keep the select styled as `.input` if simpler — chips preferred.)
- **Resources collected**: 4-col grid of `surface` cards (Ore/Silicates/Hydrogen/Alloys/Quantum Dust/Missions/Ships lost/Fuel spent), value 22px in resource colour; Ships lost in danger. Maps to `renderCollected` + `appendExtraResourceCards`.
- **Resources lost** (destroyed ships): 2-col grid, cards get a danger tint `background:color-mix(#e0736b 8%, surface)` + `box-shadow:inset 0 0 0 1px color-mix(#e0736b 22%)`, values danger. Section label in danger.  **Net gain**: 2-col grid, values in resource colour, Total net in success. Maps to `renderLostCards` / `renderNetCards`.
- **Charts**: `grid 1.5fr 1fr` — "Resources per period" line (`chart-resources`) + "Event type breakdown" doughnut (`chart-events`); the wide "Resources by event" bar (`chart-by-event`) stays full-width below.
- **Recent reports table**: Nocturne `.table` (see Tables). Resource cells coloured, tabular-nums; zone + event as `.tag`s. Pager buttons = `.btn .btn-secondary`. Keep `reports-tbody`, sort headers, `page-info`, `btn-prev/next`.

### 3. Asteroid Fields (`#asteroids-content` — `tabs/asteroids.js`)
- **Filter bar**: a `surface` card, `display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end`. Each control is a Nocturne `.field` (12px label over `.input`): Mining from (select), Mult ≥, Qty ≥, Left % ≥, Nearest systems; **Type** as a chip group (Ore/Plasma/Cryo/Gas — coloured when selected, using `res-icon`→chip). Scan = `.btn .btn-primary` (`ph-radar`), right-aligned.
- **Availability strip** (existing `af-avail`): inline muted row "On Homeworld:" + icon+count chips per ship; right-aligned "3 / 12 fleet slots in use".
- **Results table** (`af-results-tbody`): columns — action, System, Type, Mult., **Content** (a thin progress bar `remaining/total` coloured by type + a "320k / 364k" tabular label), Left %, Zone, Outpost, Distance, Fuel, Ships rec. Action cell = a 26px rounded rocket button (1px accent border, accent icon `ph-rocket-launch`, hover `background:color-mix(accent 16%)`). Type cell = icon+label in the resource colour. Mult ≥4 → success, ≥3 → gold. Fuel in hydrogen blue.

### 4. Tech Tree (`#techtree-content` — `tabs/techtree.js`, `.tt-*` classes)
- **Toolbar**: search `.input` with a leading `ph-magnifying-glass` + a **legend** row (11px squares): Available accent, Researched `#7f76c9`, Researching `#d8b055`, Maxed `#6fce8f`, Locked `#3f424d`.
- **Main**: `grid 1fr 288px`. Left = the scrollable dependency graph in a `surface` card (`height:520px`, `overflow:auto`); right = the **research queue** panel.
- **Graph**: absolutely-positioned nodes over an SVG edge layer (keep the existing `#techtree` canvas/DOM approach). Node = `196×60`, `surface`, `radius-8`, `border:1px divider`, **`border-left:3px` in the state colour**; name 12.5px, meta 10.5px. States: **maxed** left-border `#6fce8f`; **researched** accent; **researching** `#d8b055` + faint gold bg (`color-mix(#d8b055 8%, surface)`); **available** left-border `#b5abfc`, bg `color-mix(accent 12%, surface)`, **glow** `box-shadow:0 0 14px color-mix(accent 40%)`, and a small accent `+` add-button top-right; **locked** `border-left:#3f424d; opacity:0.5`. Edges = SVG cubic-bezier paths, `--color-divider` at 1.5px, **highlighted path** in accent at 2px. (This maps directly onto the current `.tt-node.maxed/.researched/.researching/.available/.locked` and `.tt-edge` rules — just re-colour them to the tokens above.)
- **Queue panel** (`surface`, `radius-md`, padding 16, `height:520px`, flex column): title; "Launch from" select; scrollable item list — each row `seq · name · eta` with an `ph-x` remove in danger; the **active/researching** item gets `border-left:2px #d8b055; padding-left:8px` and gold name. Totals block (top divider): Silicates/Ore in resource colours + Total time. Clear queue = `.btn .btn-secondary .btn-block` (`ph-trash`). Keep `tt-queue`, `tt-queue-totals`, `tt-queue-clear`, `tt-planet-select`.

### 5. Market (`#market-content` — `tabs/market.js`)
- **Filter bar** (`surface` card, flex, gap 22): **Market** source as a 2-option segmented control (Public / Alliance — replaces the `m-source` toggle switch; keep the checkbox semantics); **Buy (offered)** and **Sell (you pay)** as resource chip groups (34×34 rounded-8, coloured 2px border + tint when selected, dim otherwise — restyle `.res-icon`/`.res-icons`; keep `m-buy`/`m-sell`); **Ratio wanted ≥** `.field`+`.input`; Clear = `.btn .btn-secondary`, Refresh = `.btn .btn-primary`.
- **Open offers table** (`m-*` tbody): Offering / For (resource dot + name in resource colour) · **Ratio** (tabular; ≥1 success, ≥0.5 gold) · Available · Trader · Zone `.tag` · a "Fill" `.btn .btn-secondary`.

---

### 6. Scouting (`#scouting-content` — `tabs/scouting.js`)
Four stacked sections, each a `surface` card. Shared element: an **inline mission progress bar** (from `makeMissionBar`/`missionProgress`) — a 6px track (`background:color-mix(text 8%)`) with a coloured fill + a caption row `phase · eta` (tabular-nums). **Phase colours**: En route = accent, on-site work (Surveying/Investigating/Collecting) = `#d8b055`, Returning = `#6fce8f`. Idle cell = a muted em-dash. Keep all `sc-*` element ids and the per-row action buttons.
- **Launch bar**: `.field`s — Survey from (`sc-planet`), **Zone** as coloured toggle chips (`sc-zone`, per-zone border/fill, selected = filled), Probe template (`sc-scan-template`); Launch Scan = `.btn .btn-primary` (`ph-radar`); right-aligned `sc-slots` count.
- **Scanning fleets in transit** (`sc-transit-list`, count `sc-transit-count`): a stacked list — each row is `System · Survey` over a progress bar. Empty state: muted "No scanning fleets in transit."
- **Active surveys** (`sc-surveys-tbody`): header carries the Investigate template select (`sc-inv-template`) + Refresh. Columns: action (Launch Investigation = `.btn .btn-primary`; Investigating…/Returning… = disabled `.btn .btn-secondary`), Progress, System, Anomaly, Zone `.tag`, Fuel (hydrogen blue), Travel, Expires in (all tabular-nums).
- **Live debris fields** (`sc-debris-tbody`): header carries `sc-debris-last`, an independent debris Zone toggle set (`sc-debris-zone`), the Investigated-only + Nearest-planet switches, and a **Collect with** cargo-ship chip group (`sc-debris-ships`, selected = green border+tint). Columns: Collect action, Progress, System, Zone, Ore/Silicates/Alloys (resource colours), Total (bold), Ships (auto-planned fleet, muted), Fuel, Travel, and a hide (`✕`) toggle.
- **Uncollected salvage** (`sc-salvage-tbody`): Collect action, Progress, System, Zone, Resources left (comma list), Total, Ships, Fuel, Travel, Expires in.

## Brand mark (the Nexus logo)
The app has a **custom SVG logo** — the "Orbit" mark — replacing the old `ph-orbit` glyph. It is two crossed elliptical orbital paths around a filled core, with one satellite dot. Draw it as inline SVG (crisp at any size; recolours with the accent token). `viewBox="0 0 64 64"`:

```html
<svg viewBox="0 0 64 64" fill="none">
  <ellipse cx="32" cy="32" rx="27" ry="12.5" transform="rotate(-30 32 32)" stroke="var(--color-accent)" stroke-width="2.8"/>
  <ellipse cx="32" cy="32" rx="27" ry="12.5" transform="rotate(30 32 32)" stroke="color-mix(in srgb, var(--color-accent) 40%, transparent)" stroke-width="2"/>
  <circle cx="32" cy="32" r="7.5" fill="var(--color-accent)"/>
  <circle cx="50.5" cy="19.5" r="3.6" fill="var(--color-text)"/>
</svg>
```

- **Favicon / app-icon variant**: drop the faint second ellipse and the satellite, thicken strokes (primary ellipse `stroke-width:3.4`, core `r:8.5`) so it holds at 16–34px.
- **On light backgrounds**: swap `--color-accent` → `--color-accent-600` and the satellite `--color-text` → `--color-neutral-900`.
- `Nexus Logo.dc.html` in this bundle shows the mark at all three sizes plus the inverted (light-chip) treatment.

## Tables (global pattern — restyle `dashboard.css` `table`)
Nocturne `.table`: `width:100%; border-collapse:collapse; font-size:14px`. `th` = 11px, uppercase, 0.08em, muted, left-aligned. Row rules are **row-level fading gradient strips** (fade to transparent 48px from each end), not solid cell borders:
- header row bottom rule: `linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent) no-repeat bottom / 100% 1px`.
- body rows: same but with `color-mix(text 8%)`; hover overlays `color-mix(text 4%)`.
Cell padding uses the density var (`9px 12px` comfortable / `5px 12px` compact). Numeric cells `font-variant-numeric: tabular-nums`. Zero values render as an em-dash in `color-mix(text 30%)`.

## Chart.js theming (charts stay Chart.js)
Set once: `Chart.defaults.color = '#9397ab'`, `Chart.defaults.font.family = 'Inter, system-ui, sans-serif'`, `font.size = 11`. Grid `color:'#292b31'`, ticks `color:'#75798c'`. Line datasets: `borderColor` = resource colour, `backgroundColor` = resource colour + `'1f'` alpha, `fill:true, tension:0.35, pointRadius:0`. Doughnuts: `cutout:'62%'`, slice `borderColor:'#232532', borderWidth:2`, legend `position:'right'`, `usePointStyle:true`. Legend/point labels `#c7cad6`.

## Interactions & behaviour
- **Nav**: click a sidebar item → show its `*-content` div, hide the rest (existing mechanism), set active styling, run the tab's render fn (existing `renderAll()` switch). Keep hash-deep-linking (`dashboard.html#asteroids`).
- **Top-bar View / Zone**: unchanged handlers (`mode-select`, `zone-select` change → `onViewChange` / `renderAll`).
- **Status dot** pulses via `@keyframes nxpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }`.
- **Hover/press/focus**: use Nocturne states — accent-tint hovers, `:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px }`. Never leave default browser focus rings. Disabled controls at 45% opacity.
- **Two optional theme knobs** shown in the prototype (not required in the extension): accent colour and a Comfortable/Compact density that swaps table/card padding via `--nx-pad`/`--nx-row` custom properties.

## Files in this bundle
- `Nexus Redesign.dc.html` — the full redesign prototype (sidebar shell + all five screens). Primary reference.
- `Nexus Dashboard (current).dc.html` — a faithful recreation of the **current** UI, for before/after comparison.
- `Nexus Logo.dc.html` — the brand-mark reference: the Orbit logo as a full lockup, a 34px favicon, and inverted on a light chip.

Both are Design-Component prototypes: they load the Nocturne stylesheet from this project's `_ds/` folder, `support.js` (the DC runtime), Chart.js and Phosphor from CDNs. To view them, open inside this project. They are references — implement against `nexus-addon/dashboard.html`, `dashboard.css`, `common.js` and `tabs/*.js` as described above.

## Suggested order of work
1. Add the token `:root` block + Inter/Phosphor loads to `dashboard.css` / `dashboard.html` head.
2. Restyle the shared primitives: `.stat-card`, `table`, `.badge`, `.chart-box`, `.btn`/controls, `.finder-controls`/`.field`, `.tag`. This alone reskins most of every tab.
3. Build the sidebar + top-bar shell in `dashboard.html`; repoint the tab-switch code in `dashboard.js`.
4. Apply per-screen specifics (Global hero + KPI top-borders, Surveys loss tint, Asteroids content bars, Tech-Tree node/edge colours, Market chip filters).
5. Theme Chart.js defaults.
6. Apply the same primitives to the ten non-focus tabs.
