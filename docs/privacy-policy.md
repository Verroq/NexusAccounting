# Privacy Policy — Nexus Accounting

**Last updated: 2026-06-22**

Nexus Accounting is a browser extension that reads your Nexus Legacy game data and displays it locally as a personal accounting dashboard. This policy describes exactly what data the extension accesses, how it is used, and where it goes.

---

## 1. Data collected

The extension reads the following data from the Nexus Legacy game API (`s0.nexuslegacy.space`) on your behalf:

| Category | Examples |
|---|---|
| Mission reports | Survey, pirate raid, mining, expedition, wormhole run, and debris collection results |
| Fleet data | Your stationed ships; your own fleet compositions sent on missions |
| Combat intelligence | Enemy fleet and defense data from spy and camp-scout reports you ran in game |
| Research | Your tech tree progress, active research, per-planet lab levels and speed |
| Planets & buildings | Your planets, their buildings (to read lab levels), and stationed fleets |
| Galaxy map | System names, security zones, arm/sector coordinates (for zone tagging and the planet finder) |
| Fuel logs | Hydrogen cost per launched mission (type, zone, amount) |

The extension also reads your `nexus_token` session cookie from `nexuslegacy.space` to authenticate those API requests. No other cookies are read, and no cookies are written or modified.

---

## 2. How the data is used

All data is used **solely to operate the extension's dashboard** on your own device:

- Build aggregated statistics (resources collected, ships lost, fuel spent, etc.)
- Render charts, history tables, and the tech-tree planner
- Run the offline combat simulator
- Drive the planet-finder galaxy scan

No data is used for advertising, profiling, or any purpose unrelated to displaying your own game statistics back to you.

---

## 3. Where the data is stored

All data is stored **locally on your device only**, in the browser's `storage.local` area (isolated to this extension). Nothing is uploaded to any server operated by the extension author.

The extension also writes automatic backup files to your `Downloads/NexusAccounting/` folder before destructive operations (reset, import, schema migrations) and as a weekly auto-backup. These files are plain JSON and remain on your device under your control.

---

## 4. Data sharing and third parties

**No data is shared with any third party.** All network communication is exclusively between your browser and `nexuslegacy.space` (the game's own servers). The extension does not contact any analytics service, telemetry endpoint, or server operated by the extension author.

---

## 5. Write operations

The extension makes one type of write call to the game API: posting a research job when you click **Launch** in the tech-tree planner (`POST /api/research/{id}/start`). A confirmation dialog is shown before this action is taken. All other API calls are read-only.

---

## 6. Data retention and deletion

Data accumulates in local storage as long as the extension is installed. You can:

- **Export** a full JSON backup at any time from the dashboard.
- **Reset** all stored data from the dashboard (a backup is created first).
- **Uninstall** the extension — the browser removes all `storage.local` data on uninstall.

Backup files in your Downloads folder are not deleted automatically; you can delete them manually at any time.

---

## 7. Security

All communication with the game API uses HTTPS. Your session token is read from the browser's cookie store and transmitted only to `nexuslegacy.space`. The extension does not expose your token to any other origin.

---

## 8. Contact

If you have questions about this policy, open an issue at [github.com/Verroq/NexusAccounting](https://github.com/Verroq/NexusAccounting).
