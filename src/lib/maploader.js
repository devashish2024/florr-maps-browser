import { withFlorProxy } from "./proxy.js";
import { toMapName } from "./maplist.js";

const MAPS_BASE_URL = "https://florr.io/static/maps";

// In-memory cache: mapId -> raw TMJ string
const mapCache = new Map();
// In-memory cache: mapId -> last-fetched timestamp string
const mapLastFetched = new Map();

export const ensureMapLoaded = async (id, onStatus) => {
  if (mapCache.has(id)) return true;

  onStatus?.(`Loading map ${toMapName(id)}...`);

  const url = withFlorProxy(`${MAPS_BASE_URL}/${id}.tmj`);

  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const raw = await response.text();
    mapCache.set(id, raw);
    const lf = response.headers.get("X-Last-Fetched");
    if (lf) mapLastFetched.set(id, lf);
    return true;
  } catch {
    return false;
  }
};

export const refreshMap = async (id) => {
  mapCache.delete(id);
  mapLastFetched.delete(id);

  const url = withFlorProxy(`${MAPS_BASE_URL}/${id}.tmj`, true);

  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const raw = await response.text();
    mapCache.set(id, raw);
    const lf = response.headers.get("X-Last-Fetched");
    if (lf) mapLastFetched.set(id, lf);
    return true;
  } catch {
    return false;
  }
};

export const getMapRaw = (id) => mapCache.get(id);
export const getMapLastFetched = (id) => mapLastFetched.get(id) || null;
export const getAllMapLastFetched = () => Object.fromEntries(mapLastFetched);
