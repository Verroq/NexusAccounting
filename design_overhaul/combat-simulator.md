# Combat Simulator — implementation notes

The Combat Simulator is one screen of the Nexus redesign (sidebar item `combatsim`, icon `ph-crosshair-simple`, group header "Combat Simulator", subtitle "Battle outcome projection · 5 rounds resolved"). It is a **battle outcome projector**: the user configures two fleets, runs a simulation, and reads back a round-by-round resolution with losses and salvage.

Source of truth: the `isCombat` branch in `Nexus Redesign.dc.html` (template ~L533–657, data ~L952–985). This file describes only that screen; the top-level `README.md` covers global patterns (tokens, sidebar, header, tables).

## Screen anatomy (top → bottom)

1. **Setup** — two fleet-config panels side by side (Attacker, Defender), then an action row.
2. **Simulation Result** — an uppercase section label with a rule that fades to transparent on the right.
3. **Fleets** — two result cards summarising each side's surviving/lost ships.
4. **Combat Rounds** — a vertical list, one card per resolved round.
5. **Losses** — two columns, attacker vs defender totals.
6. **Debris Field** — a gold-tinted salvage summary band.

Everything sits in a single `display:flex; flex-direction:column; gap:24px` column.

## 1 · Setup panels

Two panels in a `1fr 1fr` grid (`gap:16px`), one per side. Each is a rounded-`--radius-lg` card, 1px `--color-divider` border, `--shadow-sm`, with a **side-tinted diagonal gradient** background:

```
linear-gradient(120deg, color-mix(in srgb, {accent} 14%, var(--color-surface)), var(--color-surface) 70%)
```

- **Attacker accent** = `#e0736b` (red); **Defender accent** = the design-system accent `var(--color-accent)`. These two colors carry the entire attacker/defender language across the screen — keep them consistent.
- **Header**: a 30×30 rounded-8 icon box outlined in the side accent (attacker `ph-lightning`, defender `ph-shield`), an uppercase side label (`letter-spacing:0.15em`) in the accent, and the fleet name as an **editable `<input>`** styled to look like a heading (transparent, borderless, `--font-heading` 600/17px).
- **Combat Ships**: a `1fr 1fr` grid of ship rows. Roster: Frigate, Cruiser, Destroyer, Battlecruiser, Battleship, Carrier. Each row is a label + a right-aligned numeric `<input>` (64px, `--color-bg` fill, tabular-nums). Defaults put the whole count on Cruiser (attacker 600 / defender 1000), the rest 0.
- **Research levels**: three flex-equal numeric inputs — Weapons, Shielding, Armor (attacker 12/11/10).

**Action row**: primary button `Simulate Battle` (`ph-crosshair-simple`), a ghost `Reset` (`ph-arrow-counter-clockwise`), and muted helper text: "Resolves up to 6 rounds · Monte-Carlo over 100 runs". Primary buttons are outline-accent per Nocturne — do not fill them.

## 2 · Fleet result cards

Same `1fr 1fr` grid and side-tinted gradient as the setup panels (slightly stronger tint, 18–20%). Each shows the side label + fleet name, a "Combat Ships" subheader chip, then a ship row with:

- ship name,
- **lost** count in red (`#e0736b`, e.g. `-53`),
- **remaining** count, colored green (`#6fce8f`) if any survive, red if wiped to `0`.

## 3 · Combat Rounds

Heading "Combat Rounds (N)" then one `--color-surface` card per round. Each round line reads:

```
Round {n}:  ⚔ {attackerDmg} dmg → 🛡 {defenderDmg} dmg      [ATK {atk}% / DEF {def}%]
```

Sword icon `ph-sword` in red, shield `ph-shield` in the defender accent; the `[ATK/DEF %]` bracket is muted and right-aligned. Below it, per-side losses ("Lost: N× Cruiser") — attacker line red, defender line a red/text mix. The attacker-loss line is conditional (`showALost`): hide it on rounds where the attacker took none (round 5 in the sample data).

Sample data lives in `combatRounds` (5 rows, damage falling and DEF% decaying to 0 as the defender is ground down).

## 4 · Losses & 5 · Debris

- **Losses**: two columns, "Attacker Losses" / "Defender Losses", each a rocket icon + red quantity (`53× Cruiser`) + muted breakdown (`(38 destroyed, 15 repairable)`).
- **Debris Field**: a band bordered/filled with a **gold** tint (`#d8b055` — a one-off callout color, not a Nocturne token; keep it only for salvage). Heading `ph-shooting-star`, then a flex row of `value + label` pairs (Ore 213,000 / Silicates 106,500 / Alloys 26,625).

## Color note for developers

Three colors on this screen are intentionally outside the Nocturne token set and should stay hard-coded as semantic constants, not folded into the ramp:

| Constant | Value | Meaning |
| --- | --- | --- |
| `RED` (attacker / losses) | `#e0736b` | hostile / destroyed |
| `GRN` (survivors) | `#6fce8f` | survived |
| gold (debris) | `#d8b055` | salvage |

The **defender** side uses `var(--color-accent)` — it is the "friendly/you" side, so it inherits the brand accent. Everything else (surfaces, borders, muted text, inputs, buttons) comes from Nocturne tokens exactly as in the rest of the app.

## Suggested data contract

When wiring to a real simulation backend, the screen needs:

```ts
type Side = 'ATTACKER' | 'DEFENDER';
interface FleetConfig { side: Side; name: string; ships: Record<ShipClass, number>; tech: { weapons: number; shielding: number; armor: number } }
interface Round { n: number; aDmg: number; dDmg: number; atk: number; def: number; aLost: number | null; dLost: number }
interface SimResult {
  fleets: { side: Side; ship: ShipClass; lost: number; remain: number }[];
  rounds: Round[];
  losses: { side: Side; qty: string; destroyed: number; repairable: number }[];
  debris: { label: string; value: number }[];
}
```

Format all numbers with thousands separators and `font-variant-numeric: tabular-nums` (already set on every numeric cell).
