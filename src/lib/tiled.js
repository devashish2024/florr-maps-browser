import { ungzip } from "pako";
import { colorFromDiff } from "./color.js";
import { revmap } from "./mobs.js";
import { getMapRaw } from "./maploader.js";

const getProperty = (name, props) => {
  const p = props?.find((x) => x.name === name);
  return Number(p?.value ?? NaN);
};

const getPropertyStr = (name, props) => {
  const p = props?.find((x) => x.name === name);
  return p?.value?.toString();
};

export const parseMap = (mapId) => {
  const raw = getMapRaw(mapId);
  if (!raw) throw new Error(`Map not found: ${mapId}`);

  const data = JSON.parse(raw);

  const mobSpawners = [];
  const checkPoints = [];
  const specialSprites = [];
  const warps = [];

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
            level: isNaN(level) ? 0 : level, points,
          });
          continue;
        }

        if (obj.type === "warp" || obj.type === "warp_destination") {
          const mapTarget = getPropertyStr("map", obj.properties);
          const warpPoint = getPropertyStr("warp_point", obj.properties);
          warps.push({
            id: obj.id, x: obj.x, y: obj.y, name: obj.name || "",
            warpType: obj.type, map: mapTarget, warpPoint,
          });
          continue;
        }

        if (obj.type !== "spawn_mobs") continue;

        const difficulty = getProperty("difficulty", obj.properties);
        const density = getProperty("density", obj.properties);
        const extraSpawnDelay = getProperty("extra_spawn_delay", obj.properties);
        const forceRarity = getProperty("force_rarity", obj.properties);
        const team = getProperty("team", obj.properties);
        const mobstr = getPropertyStr("mobs", obj.properties);

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

        const points = new Path2D();
        const color = colorFromDiff(difficulty);

        if (!obj.polygon) {
          points.rect(0, 0, w, h);
          mobSpawners.push({
            id: obj.id, x: obj.x, y: obj.y, width: w, height: h,
            mobs, points, difficulty, density, extraSpawnDelay, forceRarity, team,
            color, big: w > 25252 && h > 25252,
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
          color, big: (w || pw) > 25252 && (h || ph) > 25252,
        });
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
