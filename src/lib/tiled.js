import { ungzip } from "pako";
import { effectiveRarityFromSpawner } from "./color.js";
import { revmap, biomeSpawns } from "./mobs.js";
import { getMapRaw } from "./maploader.js";

const getProperty = (name, props) => {
  const p = props?.find((x) => x.name === name);
  return Number(p?.value ?? NaN);
};

const getPropertyStr = (name, props) => {
  const p = props?.find((x) => x.name === name);
  return p?.value?.toString();
};

const POINT_MARKER_RADIUS = 110;

const buildObjectPath = (obj, width, height) => {
  const points = new Path2D();

  if (obj.point === true || (!obj.polygon && width === 0 && height === 0)) {
    points.arc(0, 0, POINT_MARKER_RADIUS, 0, Math.PI * 2);
    return { points, width, height, isPoint: true };
  }

  if (!obj.polygon) {
    points.rect(0, 0, width, height);
    return { points, width, height, isPoint: false };
  }

  let first = true;
  let pw = 0;
  let ph = 0;
  for (const p of obj.polygon) {
    p.x *= 0.75;
    p.y *= 0.75;
    if (pw < p.x) pw = p.x;
    if (ph < p.y) ph = p.y;
    if (first) {
      first = false;
      points.moveTo(p.x, p.y);
      continue;
    }
    points.lineTo(p.x, p.y);
  }
  points.closePath();

  return { points, width: width || pw, height: height || ph, isPoint: false };
};

const parseMobEntry = (entry) => {
  const parts = entry.split(":");
  const rawName = parts[0]?.trim();
  const normalizedName = rawName?.toLowerCase();
  const id = revmap.get(normalizedName) ?? -1;
  if (id === -1) {
    return {
      id: -1,
      chance: parseFloat(parts[1]) || 0,
      isUnknown: true,
      name: normalizedName || "unknown",
    };
  }
  return { id, chance: parseFloat(parts[1]) || 0, name: normalizedName };
};

const extractBiomeMobs = (mobstr) => {
  if (!mobstr) return { mobs: [], isBiome: false, biomeName: null };

  const cleanStr = mobstr.toLowerCase().replaceAll("\n", "").trim();
  const semicolonParts = cleanStr.split(";").map((part) => part.trim()).filter(Boolean);

  let biomeKey = null;
  for (const part of semicolonParts) {
    const biomeCandidate = part.split(",")[0]?.split(":")[0]?.trim();
    if (biomeCandidate && biomeSpawns[biomeCandidate]) {
      biomeKey = biomeCandidate;
      break;
    }
  }

  if (biomeKey) {
    const biomeConfig = biomeSpawns[biomeKey];
    const extraMobs = [];
    let biomeWeight = 0;

    for (const part of semicolonParts) {
      if (!part) continue;

      const commaParts = part.split(",").map((item) => item.trim()).filter(Boolean);
      for (const item of commaParts) {
        const itemName = item.split(":")[0]?.trim();
        if (!item) continue;

        if (itemName === biomeKey) {
          const biomeValue = item.split(":")[1];
          biomeWeight = parseFloat(biomeValue?.trim()) || biomeWeight;
          continue;
        }

        if (item.includes("=")) {
          const [mobName, weightStr] = item.split("=");
          const cleanMobName = mobName.trim();
          const normalizedName = cleanMobName.toLowerCase();
          const id = revmap.get(normalizedName) ?? -1;
          if (id !== -1) {
            extraMobs.push({ id, chance: parseFloat(weightStr.trim()) || 0, isWeighted: true, name: normalizedName });
          } else {
            extraMobs.push({
              id: -1,
              chance: parseFloat(weightStr.trim()) || 0,
              isUnknown: true,
              name: normalizedName || "unknown",
            });
          }
          continue;
        }

        if (item.includes(":")) {
          const parsed = parseMobEntry(item);
          extraMobs.push(parsed);
        }
      }
    }

    const biomeMobs = [];
    for (const mobName of biomeConfig.mobs) {
      const id = revmap.get(mobName) ?? -1;
      if (id === -1) continue;

      biomeMobs.push({
        id,
        chance: 0,
        isUnknown: true,
        name: mobName,
      });
    }

    return { mobs: [...biomeMobs, ...extraMobs], isBiome: true, biomeName: biomeConfig.displayName, biomeWeight };
  }

  const mobs = semicolonParts.map(parseMobEntry);
  return { mobs, isBiome: false, biomeName: null };
};

export const parseMap = (mapId) => {
  const raw = getMapRaw(mapId);
  if (!raw) throw new Error(`Map not found: ${mapId}`);

  const data = JSON.parse(raw);

  const mobSpawners = [];
  const checkPoints = [];
  const specialSprites = [];
  const warps = [];
  const respawnAreas = [];
  const spawnDrops = [];
  const shortcuts = [];
  const unknownObjects = [];

  for (const layer of data.layers) {
    // Process object layers
    if (layer.objects) {
      for (const obj of layer.objects) {
        obj.x *= 0.75;
        obj.y *= 0.75;
        const w = (obj.width ?? 1) * 0.75;
        const h = (obj.height ?? 1) * 0.75;

        if (obj.gid) {
          specialSprites.push({ x: obj.x, y: obj.y, width: w, height: h, id: obj.gid });
          continue;
        }

        if (obj.type === "checkpoint") {
          const level = getProperty("level", obj.properties);
          const { points, width, height, isPoint } = buildObjectPath(obj, w, h);
          checkPoints.push({
            id: obj.id, x: obj.x, y: obj.y, width, height,
            level: isNaN(level) ? 0 : level, points, rawObj: obj, isPoint,
          });
          continue;
        }

        if (obj.type === "respawn_area") {
          const { points, width, height, isPoint } = buildObjectPath(obj, w, h);
          respawnAreas.push({
            id: obj.id, x: obj.x, y: obj.y, width, height, points, rawObj: obj, isPoint,
          });
          continue;
        }

        if (obj.type === "warp" || obj.type === "warp_destination") {
          const mapTarget = getPropertyStr("map", obj.properties);
          const warpPoint = getPropertyStr("warp_point", obj.properties);
          warps.push({
            id: obj.id, x: obj.x, y: obj.y, name: obj.name || "",
            warpType: obj.type, map: mapTarget, warpPoint, width: w, height: h, rawObj: obj,
          });
          continue;
        }

        if (obj.type === "spawn_mobs") {
          const difficulty = getProperty("difficulty", obj.properties);
          const density = getProperty("density", obj.properties);
          const extraSpawnDelay = getProperty("extra_spawn_delay", obj.properties);
          const forceRarity = getProperty("force_rarity", obj.properties);
          const team = getProperty("team", obj.properties);
          const mobstr = getPropertyStr("mobs", obj.properties);

          const { mobs, isBiome, biomeName, biomeWeight } = extractBiomeMobs(mobstr);
          const rarityInfo = effectiveRarityFromSpawner(difficulty, forceRarity);
          const { points, width, height, isPoint } = buildObjectPath(obj, w, h);

          mobSpawners.push({
            id: obj.id, x: obj.x, y: obj.y, width, height,
            mobs, points, difficulty, density, extraSpawnDelay, forceRarity, team,
            color: rarityInfo.effectiveColor,
            baseRarity: rarityInfo.baseRarity,
            forcedRarityName: rarityInfo.forcedRarity,
            effectiveRarity: rarityInfo.effectiveRarity,
            biomeWeight,
            big: width > 25252 && height > 25252, rawObj: obj, isBiome, biomeName, isPoint,
          });
          continue;
        }

        if (obj.type === "spawn_drops") {
          const { points, width, height, isPoint } = buildObjectPath(obj, w, h);
          spawnDrops.push({
            id: obj.id, x: obj.x, y: obj.y, width, height,
            type: obj.type, name: obj.name, points, rawObj: obj, isPoint,
          });
          continue;
        }

        // Shortcut type
        if (obj.type === "shortcut" && !obj.gid) {
          const { points, width, height, isPoint } = buildObjectPath(obj, w, h);
          shortcuts.push({
            id: obj.id, x: obj.x, y: obj.y, width, height, type: obj.type, name: obj.name,
            points, rawObj: obj, isPoint,
          });
          continue;
        }

        // Unknown object type - collect for display
        if (!obj.gid) {
          const { points, width, height, isPoint } = buildObjectPath(obj, w, h);
          unknownObjects.push({
            id: obj.id, x: obj.x, y: obj.y, width, height, type: obj.type, name: obj.name,
            points, rawObj: obj, isPoint,
          });
        }
      }
    }

    // Decompress tile layers
    if (layer.encoding === "base64" && layer.compression === "gzip" && typeof layer.data === "string") {
      const s = atob(layer.data);
      const bin = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
      layer.data = new Uint32Array(ungzip(bin).buffer);
    }
  }

  const tw = data.tilewidth * 0.75;
  const th = data.tileheight * 0.75;

  return {
    data,
    mobSpawners,
    checkPoints,
    specialSprites,
    warps,
    respawnAreas,
    spawnDrops,
    shortcuts,
    unknownObjects,
    gw: data.width,
    gh: data.height,
    width: data.width * tw,
    height: data.height * th,
    wf: 1 / tw,
    hf: 1 / th,
    tilewidth: tw,
    tileheight: th,
    firstGid: data.tilesets?.[0]?.firstgid ?? 1,
  };
};
