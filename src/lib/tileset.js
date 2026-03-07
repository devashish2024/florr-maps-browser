import { fetchText } from "./proxy.js";

const TILESET_URL = "https://florr.io/static/tiles/tileset.tsj";
const TILES_BASE_URL = "https://florr.io/static/tiles";

export const loadTiles = async (onStatus) => {
  onStatus?.("Loading tileset...");

  const raw = await fetchText(TILESET_URL);
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
    const svg = await fetchText(url);
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
