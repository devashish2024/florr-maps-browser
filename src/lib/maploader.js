import { withFlorProxy } from "./proxy.js";
import { toMapName } from "./maplist.js";

const MAPS_BASE_URL = "https://florr.io/static/maps";

// In-memory cache: mapId -> raw TMJ string
const mapCache = new Map();

export const ensureMapLoaded = async (id, onStatus) => {
  if (mapCache.has(id)) return true;

  onStatus?.(`Loading map ${toMapName(id)}...`);

  const url = withFlorProxy(`${MAPS_BASE_URL}/${id}.tmj`);

  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const raw = await response.text();
    mapCache.set(id, raw);
    return true;
  } catch {
    return false;
  }
};

export const getMapRaw = (id) => mapCache.get(id);
