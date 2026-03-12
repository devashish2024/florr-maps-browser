import { fetchTextWithMeta } from "./proxy.js";
import { toMapName } from "./maplist.js";

const MAPS_BASE_URL = "https://florr.io/static/maps";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// In-memory cache: mapId -> raw TMJ string
const mapCache = new Map();
// In-memory cache: mapId -> last-fetched timestamp string
const mapLastFetched = new Map();

export const ensureMapLoaded = async (id, onStatus) => {
  if (mapCache.has(id)) return true;

  onStatus?.(`Loading map ${toMapName(id)}...`);

  const url = `${MAPS_BASE_URL}/${id}.tmj`;

  try {
    const { text: raw, lastFetched } = await fetchTextWithMeta(url, false, {
      ttlMs: ONE_WEEK_MS,
      cacheKey: `map:${id}`,
    });
    mapCache.set(id, raw);
    mapLastFetched.set(id, lastFetched || new Date().toISOString());
    return true;
  } catch (err) {
    console.error(`Failed to load map ${id}:`, err);
    return false;
  }
};

export const refreshMap = async (id) => {
  mapCache.delete(id);
  mapLastFetched.delete(id);

  const url = `${MAPS_BASE_URL}/${id}.tmj`;

  try {
    const { text: raw, lastFetched } = await fetchTextWithMeta(url, true, {
      ttlMs: ONE_WEEK_MS,
      cacheKey: `map:${id}`,
    });
    mapCache.set(id, raw);
    mapLastFetched.set(id, lastFetched || new Date().toISOString());
    return true;
  } catch {
    return false;
  }
};

export const ensureArchivedMapLoaded = async (id, onStatus) => {
  const cacheKey = `archived/${id}`;
  if (mapCache.has(cacheKey)) return true;

  onStatus?.(`Loading archived map ${id}...`);

  try {
    const response = await fetch(`/archived_maps/${id}.tmj`);
    if (!response.ok) {
      console.error(`Failed to load archived map ${id}: ${response.status}`);
      return false;
    }
    const raw = await response.text();
    mapCache.set(cacheKey, raw);
    mapLastFetched.set(cacheKey, new Date().toISOString());
    return true;
  } catch (err) {
    console.error(`Failed to load archived map ${id}:`, err);
    return false;
  }
};

export const getMapRaw = (id) => mapCache.get(id);
export const getMapLastFetched = (id) => mapLastFetched.get(id) || null;
export const getAllMapLastFetched = () => Object.fromEntries(mapLastFetched);
export const isMapLoaded = (id) => mapCache.has(id);

// Find a warp or warp_destination by name in a map
export const findWarpPointInMap = (mapId, warpPointName) => {
  const rawText = mapCache.get(mapId);
  if (!rawText) return null;

  try {
    const data = JSON.parse(rawText);
    let fallback = null;
    for (const layer of data.layers) {
      if (!layer.objects) continue;
      for (const obj of layer.objects) {
        if (obj.name !== warpPointName) continue;
        const cx = (obj.x + (obj.width ?? 0) / 2) * 0.75;
        const cy = (obj.y + (obj.height ?? 0) / 2) * 0.75;
        if (obj.type === "warp_destination") {
          const result = { x: cx, y: cy };
          console.log(`Found warp_destination "${warpPointName}" in ${mapId}:`, result);
          return result;
        }
        if (obj.type === "warp" && !fallback) {
          fallback = { x: cx, y: cy };
        }
      }
    }
    if (fallback) {
      console.log(`Found warp (fallback) "${warpPointName}" in ${mapId}:`, fallback);
      return fallback;
    }
    console.log(`Warp "${warpPointName}" NOT found in ${mapId}`);
    return null;
  } catch (err) {
    console.error(`Error parsing map ${mapId}:`, err);
    return null;
  }
};
