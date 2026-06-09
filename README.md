# Nexus Accounting

Firefox addon that tracks survey mission data from [Nexus Legacy](https://s0.nexuslegacy.space).

<img width="1889" height="726" alt="image" src="https://github.com/user-attachments/assets/62757e1c-d4c6-422d-9889-4ad0144b8801" />

## What it does

- Scrapes survey reports from the game API every 15 minutes (or on demand)
- Aggregates resources collected: ore, hydrogen, silicates
- Tracks ship losses and computes their rebuild cost (ore, silicates, hydrogen, alloys, rare resources)
- Breaks down results by event type
- Displays all-time, daily, and hourly views
- Stores up to 500 survey reports locally (configurable, 0 = unlimited)

## How it works

The addon reads your `nexus_token` JWT directly from the browser cookies, no credentials to enter. You just need to be logged in to Nexus Legacy.

All data is stored locally in `browser.storage.local`. Nothing is sent anywhere.

## Usage

1. Log in to [Nexus Legacy](https://s0.nexuslegacy.space)
2. Click the Nexus Accounting toolbar icon to open the dashboard
3. Click **Scrape Now** to fetch data immediately, or wait for the automatic 15-minute scrape

## Dashboard

| Section | Description |
|---|---|
| Resources collected | Ore, hydrogen, silicates, mission count, ships lost |
| Resources lost | Build cost of destroyed ships per resource type |
| Resources per period | Line chart over time |
| Event type breakdown | Doughnut chart of mission types |
| Resources by event type | Bar chart of yields per mission type |
| Recent reports | Paginated table of individual survey reports |

Use the **View** selector (All time / Daily / Hourly) to filter all stats and charts to the latest day or hour.

## Settings

- **Records cap**: max survey reports kept locally. Oldest are dropped when limit is reached. Set to `0` for unlimited.
- **Reset all data**: drops all stored reports (keeps your cap setting).

## Screens


## Disclaimer

Web UI made with Claude Opus 4.8

## License

[Mozilla Public License](https://www.mozilla.org/en-US/MPL/2.0/)



