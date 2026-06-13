# FlorrMapBrowser

**by [VortexPrime](https://ashish.top)**

---

An interactive map viewer for [florr.io](https://florr.io) — explore every biome, zone, and map the game has to offer.

## What is this?

FlorrMapBrowser fetches the latest map data directly from florr.io's APIs and renders them in real-time, so you always see the most up-to-date version of every map. Browse through biomes like Garden, Desert, Ocean, Jungle, Ant Hell, and many more — including Rift maps and hidden zones.

### Features

- **Live map data** — Maps are fetched directly from florr.io's servers, always current.
- **Interactive pan & zoom** — Click and drag to pan, scroll to zoom, middle-click to reset zoom.
- **Difficulty zones** — See mob spawner regions with difficulty levels, density values, and spawn details.
- **Mob tooltips** — Hover over spawner zones to see which mobs spawn there, with sprite previews.
- **Checkpoint visualization** — View checkpoint locations and their level requirements.
- **Tile viewer** — Inspect individual tile assets used to build maps.
- **File browser** — VS Code-style sidebar to navigate between maps and tile assets.

## Developing / Running locally

Install [npm](https://nodejs.org/en/download) and [git](https://git-scm.com/) first.
(i) `git clone https://github.com/devashish2024/florr-maps-browser.git`
(ii) `cd florr-maps-browser`
(iii) `npm i`
(iv) `npm run dev`

## Also check out

| [![FlorrMobNotify Banner](https://mobs.ashish.top/banner.png)](https://mobs.ashish.top) | **[FlorrMobNotify](https://mobs.ashish.top)**<br/>24/7 reliable, centralised website for florr.io **alive mobs**, **rifts**, mobs, **mapcodes** & more features!<br/><br/>[Visit site](https://mobs.ashish.top) · [Join Discord](https://mobs.ashish.top/discord) |

## Credits

- **[VortexPrime](https://github.com/devashish2024)** — Live fetching, bug fixes, and publishing.
- **[nardzy](https://github.com/nardzy)**'s [florr-io-maps repo](https://github.com/nardzy/florr-io-maps) — Original florr.io map viewer logic. (most of the logic is same as his code)

### Inspiration

This project is based on [nardzy's florr-io-maps](https://github.com/nardzy/florr-io-maps) and inspired by the [florr.io map viewer on Glitch](https://florr-io-map-viewer.glitch.me/). (the map viewer on glitch is dead; that's why I made this.)

---

Built with React and Vite. Map data belongs to florr.io.