import { ungzip } from "pako";
import { colorFromDiff } from "./color.js";
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

const extractBiomeMobs = (mobstr) => {
  if (!mobstr) return { mobs: [], isBiome: false, biomeName: null };

  const cleanStr = mobstr?.toLowerCase().trim();

  // Check for biome format: "biome" or "biome,mob1=weight1,mob2=weight2,..."
  const parts = cleanStr.split(",").map(p => p.trim());
  const potentialBiome = parts[0];

  for (const [biomeKey, biomeConfig] of Object.entries(biomeSpawns)) {
    if (potentialBiome === biomeKey) {
      // Parse weight overrides (e.g., "ladybug=2,hornet=3")
      const weightedMobs = new Map();
      let totalWeight = 0;

      for (let i = 1; i < parts.length; i++) {
        const override = parts[i];
        if (override.includes("=")) {
          const [mobName, weightStr] = override.split("=");
          const cleanMobName = mobName.trim();
          const weight = parseFloat(weightStr.trim()) || 0;

          const id = revmap.get(cleanMobName) ?? -1;
          if (id !== -1) {
            weightedMobs.set(cleanMobName, { id, chance: weight, isWeighted: true });
            totalWeight += weight;
          }
        }
      }

      // Build final mobs array
      const biomeMobs = [];

      // Add biome mobs (with ? for unknown ones, or weighted ones)
      for (const mobName of biomeConfig.mobs) {
        const id = revmap.get(mobName) ?? -1;
        if (id !== -1) {
          if (weightedMobs.has(mobName)) {
            // This mob has a weight override
            const weighted = weightedMobs.get(mobName);
            biomeMobs.push({
              id,
              chance: weighted.chance,
              isWeighted: true
            });
          } else {
            // This biome mob has unknown chance
            biomeMobs.push({
              id,
              chance: 0, // Store 0, but will display as "?"
              isUnknown: true
            });
          }
        }
      }

      // Add any weighted mobs not in the biome (shouldn't happen, but just in case)
      for (const [mobName, mobData] of weightedMobs) {
        if (!biomeConfig.mobs.includes(mobName)) {
          biomeMobs.push(mobData);
        }
      }

      return { mobs: biomeMobs, isBiome: true, biomeName: biomeConfig.displayName, totalWeight };
    }
  }

  // Fall back to parsing mobs string (mob:chance;mob:chance format)
  const mobs = mobstr
    ?.replaceAll("\n", "")
    .split(";")
    .filter((x) => x.trim())
    .map((x) => {
      const parts = x.replace(";", "").split(":");
      const id = revmap.get(parts[0]) ?? -1;
      if (id === -1) return null;
      return { id, chance: parseFloat(parts[1]) || 0 };
    })
    .filter((mob) => mob !== null) ?? [];

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
          const points = new Path2D();
          points.rect(0, 0, w, h);
          checkPoints.push({
            id: obj.id, x: obj.x, y: obj.y, width: w, height: h,
            level: isNaN(level) ? 0 : level, points, rawObj: obj,
          });
          continue;
        }

        if (obj.type === "respawn_area") {
          const points = new Path2D();
          points.rect(0, 0, w, h);
          respawnAreas.push({
            id: obj.id, x: obj.x, y: obj.y, width: w, height: h, points, rawObj: obj,
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

          const { mobs, isBiome, biomeName } = extractBiomeMobs(mobstr);
          const points = new Path2D();
          const color = colorFromDiff(difficulty);

          if (!obj.polygon) {
            points.rect(0, 0, w, h);
            mobSpawners.push({
              id: obj.id, x: obj.x, y: obj.y, width: w, height: h,
              mobs, points, difficulty, density, extraSpawnDelay, forceRarity, team,
              color, big: w > 25252 && h > 25252, rawObj: obj, isBiome, biomeName,
            });
            continue;
          }

          let first = true;
          let pw = 0, ph = 0;
          for (const p of obj.polygon) {
            p.x *= 0.75;
            p.y *= 0.75;
            if (pw < p.x) pw = p.x;
            if (ph < p.y) ph = p.y;
            if (first) { first = false; points.moveTo(p.x, p.y); continue; }
            points.lineTo(p.x, p.y);
          }
          points.closePath();

          mobSpawners.push({
            id: obj.id, x: obj.x, y: obj.y, width: w || pw, height: h || ph,
            mobs, points, difficulty, density, extraSpawnDelay, forceRarity, team,
            color, big: (w || pw) > 25252 && (h || ph) > 25252, rawObj: obj, isBiome, biomeName,
          });
          continue;
        }

        // Unknown object type - collect for display
        if (!obj.gid) {
          const points = new Path2D();
          if (!obj.polygon) {
            points.rect(0, 0, w, h);
          } else {
            let first = true;
            for (const p of obj.polygon) {
              p.x *= 0.75;
              p.y *= 0.75;
              if (first) { first = false; points.moveTo(p.x, p.y); continue; }
              points.lineTo(p.x, p.y);
            }
            points.closePath();
          }
          unknownObjects.push({
            id: obj.id, x: obj.x, y: obj.y, width: w, height: h, type: obj.type, name: obj.name,
            points, rawObj: obj,
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
