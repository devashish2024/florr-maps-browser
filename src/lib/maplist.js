import { fetchTextWithMeta } from "./proxy.js";

const MAPS_LIST_URL = "https://florr.io/static/i18n/en_US/maps.txt";
const PYRAMID_MAP_ID = "pyramid";

const MAP_ORDER = [
  "Garden", "Desert", "Ocean", "Jungle", "Ant Hell", "Sewers", "Hel",
  "Factory", "Training Grounds", "Crystal Room", "Worm", "Ant Hole",
  "Rift: Garden", "Rift: Ant Hell", "Rift: Factory", "Rift: Hel",
  "Rift: Ocean", "Rift: Victory", "Pyramid",
];
const MAP_ORDER_INDEX = new Map(MAP_ORDER.map((name, i) => [name, i]));

const toMapName = (id) => {
  const normalize = (name) => name.replace(/\bAnt Hole(\d+)\b/g, "Termite Mound $1");

  const toTitle = (value) =>
    value.replace(/[_-]+/g, " ").split(" ").filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

  if (id === "br/main") return "Rift: Garden";
  if (id.startsWith("br/")) return `Rift: ${normalize(toTitle(id.slice(3)))}`;
  return normalize(toTitle(id));
};

const getOrderKey = (name) => {
  if (name.startsWith("Ant Hole ")) {
    const base = MAP_ORDER_INDEX.get("Ant Hole") ?? 1000;
    const num = Number(name.slice("Ant Hole ".length)) || 0;
    return base * 100 + num;
  }
  if (name === "Pyramid") return 9000 * 100;
  const known = MAP_ORDER_INDEX.get(name);
  if (known !== undefined) return known * 100;
  return 8000 * 100;
};

const compareMeta = (a, b) => {
  const ar = getOrderKey(a.name);
  const br = getOrderKey(b.name);
  if (ar !== br) return ar - br;
  return a.name.localeCompare(b.name);
};

export const loadMapList = async (onStatus) => {
  onStatus?.("Loading map list...");

  const { text: content, lastFetched } = await fetchTextWithMeta(MAPS_LIST_URL);
  const ids = new Set();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^Maps\/(.+)\/Name=/);
    if (!match) continue;
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }

  ids.add(PYRAMID_MAP_ID);

  const meta = [];
  for (const id of ids) {
    meta.push({ id, name: toMapName(id), ok: false, fetched: false });
  }

  meta.sort(compareMeta);

  onStatus?.(`Loaded map list (${meta.length} maps).`);
  return { meta, rawContent: content, lastFetched: lastFetched || new Date().toISOString() };
};

export { toMapName, compareMeta };
