import { fetchText, fetchTextWithMeta } from "./proxy.js";

const TILESET_URL = "https://florr.io/static/tiles/tileset.tsj";
const TILES_BASE_URL = "https://florr.io/static/tiles";

let tilesetLastFetched = null;

export const getTilesetLastFetched = () => tilesetLastFetched;

export const loadTiles = async (onStatus, skipCache) => {
  onStatus?.("Loading tileset...");

  const { text: raw, lastFetched } = await fetchTextWithMeta(TILESET_URL, skipCache);
  tilesetLastFetched = lastFetched;
  const tileset = JSON.parse(raw);

  const idToImage = new Map();
  for (const tile of tileset.tiles ?? []) {
    if (!tile.image || !tile.image.endsWith(".svg")) continue;
    idToImage.set(tile.id, tile.image);
  }

  const uniqueImages = [...new Set(idToImage.values())];
  const fetchedSvg = new Map();

  let done = 0;
  for (const image of uniqueImages) {
    const url = `${TILES_BASE_URL}/${image}`;
    const svg = await fetchText(url, skipCache);
    fetchedSvg.set(image, svg);
    done++;
    onStatus?.(`Loading tiles... ${done}/${uniqueImages.length}`);
  }

  const tiles = new Map();
  const tileFileEntries = [];
  const seenImages = new Set();
  for (const [id, image] of idToImage) {
    const svg = fetchedSvg.get(image);
    if (svg) tiles.set(id, svg);
    if (!seenImages.has(image)) {
      seenImages.add(image);
      tileFileEntries.push({ id, name: image });
    }
  }

  return { tiles, tileFileEntries, rawTileset: raw };
};
