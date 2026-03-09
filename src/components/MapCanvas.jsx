import { useEffect, useRef, useCallback, useState } from "react";
import { Camera } from "../lib/camera.js";
import { TileRenderer } from "../lib/renderer.js";
import { VIEW_W, VIEW_H } from "../lib/consts.js";
import { darkened } from "../lib/utils.js";
import { RarityColor, rarityFromDiff } from "../lib/color.js";
import { mobmap } from "../lib/mobs.js";

export default function MapCanvas({ mapData, sprites, mobSprites, mapKey }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stateRef = useRef(null);
  const firstMapRef = useRef(true);
  const mapKeyRef = useRef(mapKey);
  const [zoomLevel, setZoomLevel] = useState(0.25);
  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);
  const [tileName, setTileName] = useState("");
  const [minZoom, setMinZoom] = useState(0.0001);
  const [maxZoom] = useState(10);
  const updateFrequencyRef = useRef(0);

  // Initialize once
  const initState = useCallback(() => {
    if (stateRef.current) return stateRef.current;
    stateRef.current = {
      camera: new Camera(),
      renderer: null,
      cursorX: 0,
      cursorY: 0,
      cursorRx: 0,
      cursorRy: 0,
      grab: false,
      lastPdist: 0,
      lastTime: 0,
      animId: 0,
      tooltips: new Map(),
      scale: 1,
      viewW: 1,
      viewH: 1,
      canvW: 1,
      canvH: 1,
      cameraScale: 1,
      cameraX: 0,
      cameraY: 0,
      cameraCx: 0,
      cameraCy: 0,
      cameraWidth: 1,
      cameraHeight: 1,
      totalScale: 1,
      wrapAlpha: 1.0,
    };
    return stateRef.current;
  }, []);

  useEffect(() => {
    mapKeyRef.current = mapKey;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !mapData || !sprites) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const st = initState();

    // Build renderer if needed
    if (!st.renderer) {
      const rect = container.getBoundingClientRect();
      const w = rect.width * devicePixelRatio;
      const h = rect.height * devicePixelRatio;
      st.renderer = new TileRenderer(w, h, sprites);
    }

    // Overlay canvas (offscreen 2d for game objects)
    const overlay = new OffscreenCanvas(1, 1);
    const octx = overlay.getContext("2d");

    // UI canvas (offscreen 2d for tooltips)
    const uiCanvas = new OffscreenCanvas(1, 1);
    const uctx = uiCanvas.getContext("2d");

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width * devicePixelRatio;
      const h = rect.height * devicePixelRatio;
      canvas.width = w;
      canvas.height = h;
      overlay.width = w;
      overlay.height = h;
      uiCanvas.width = w;
      uiCanvas.height = h;

      const scale = Math.max(w / VIEW_W, h / VIEW_H);
      st.scale = scale;
      st.viewW = w / scale;
      st.viewH = h / scale;
      st.canvW = w;
      st.canvH = h;

      st.renderer?.resize(w, h);
    };

    resize();

    const maxFov = 10;

    const minFov = () => {
      const fitW = st.viewW / (1.2 * mapData.width);
      const fitH = st.viewH / (1.2 * mapData.height);
      return Math.max(0.0001, fitW, fitH) * 0.75;
    };

    // Calculate and store min zoom
    const calculatedMinZoom = minFov();
    setMinZoom(calculatedMinZoom);
    stateRef.current.minZoom = calculatedMinZoom;
    stateRef.current.maxZoom = maxFov;

    const clampFov = () => {
      const mn = minFov();
      st.camera.fov = Math.min(maxFov, Math.max(mn, st.camera.fov));
      st.camera.fovR = Math.min(maxFov, Math.max(mn, st.camera.fovR));
    };

    const updateGameScale = (fov) => {
      st.cameraScale = 1.2 * fov;
      st.cameraWidth = st.viewW / st.cameraScale;
      st.cameraHeight = st.viewH / st.cameraScale;
      st.cameraCx = st.cameraWidth * 0.5;
      st.cameraCy = st.cameraHeight * 0.5;
      st.totalScale = 1 / (st.scale * st.cameraScale);
    };

    const clampCenter = (x, y) => {
      const hw = st.cameraWidth * 0.5;
      const hh = st.cameraHeight * 0.5;
      const cx = hw >= mapData.width * 0.5 ? mapData.width * 0.5
        : Math.max(hw, Math.min(mapData.width - hw, x));
      const cy = hh >= mapData.height * 0.5 ? mapData.height * 0.5
        : Math.max(hh, Math.min(mapData.height - hh, y));
      return [cx, cy];
    };

    const clampViewerCenter = () => {
      const [x, y] = clampCenter(st.camera.x, st.camera.y);
      st.camera.x = x;
      st.camera.y = y;
    };

    // Auto-zoom to starting checkpoint
    const glideToCheckpoint = () => {
      const goTo = (x, y) => {
        st.camera.fov = 0.25;
        st.camera.fovR = 0.25;
        st.camera.x = x;
        st.camera.y = y;
        st.camera.rx = x;
        st.camera.ry = y;
        clampFov();
        updateGameScale(st.camera.fovR);
        clampViewerCenter();
      };

      // 1. checkpoint level 0 — middle if exactly 3, else first
      const level0 = mapData.checkPoints.filter((c) => c.level === 0);
      if (level0.length > 0) {
        const t = level0.length === 3 ? level0[1] : level0[0];
        goTo(t.x + t.width * 0.5, t.y + t.height * 0.5);
        return;
      }

      // 2. respawn_area — first one
      if (mapData.respawnAreas?.length > 0) {
        const ra = mapData.respawnAreas[0];
        goTo(ra.x + ra.width * 0.5, ra.y + ra.height * 0.5);
        return;
      }

      // 3. warp_destination — first one
      const warpDests = mapData.warps.filter((w) => w.warpType === "warp_destination");
      if (warpDests.length > 0) {
        const wd = warpDests[0];
        goTo(wd.x + wd.width * 0.5, wd.y + wd.height * 0.5);
        return;
      }

      // 4. warp — middle if exactly 3, use it if exactly 1
      const warpObjs = mapData.warps.filter((w) => w.warpType === "warp");
      if (warpObjs.length === 3) {
        const t = warpObjs[1];
        goTo(t.x + t.width * 0.5, t.y + t.height * 0.5);
        return;
      }
      if (warpObjs.length === 1) {
        const t = warpObjs[0];
        goTo(t.x + t.width * 0.5, t.y + t.height * 0.5);
        return;
      }

      // 5. map center
      goTo(mapData.width * 0.5, mapData.height * 0.5);
    };

    if (firstMapRef.current) {
      firstMapRef.current = false;
      let restored = false;
      try {
        const saved = localStorage.getItem('camera:' + mapKey);
        if (saved) {
          const { x, y, fov } = JSON.parse(saved);
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(fov) && fov > 0) {
            st.camera.x = x;
            st.camera.y = y;
            st.camera.fov = fov;
            st.camera.rx = x;
            st.camera.ry = y;
            st.camera.fovR = fov;
            clampFov();
            updateGameScale(st.camera.fovR);
            clampViewerCenter();
            restored = true;
          }
        }
      } catch { /* ignore */ }
      if (!restored) glideToCheckpoint();
    } else {
      // Map switch: go to checkpoint/spawn, snap zoom to 0.25, then animate to 0.125
      glideToCheckpoint();
      st.camera.fovR = 0.52;
      st.camera.fov = 0.25;
      clampFov();
      updateGameScale(st.camera.fovR);
      clampViewerCenter();
    }
    st.tooltips.clear();
    st.wrapAlpha = 1.0;

    // --- Event handlers ---
    const onResize = () => {
      resize();
      clampFov();
      updateGameScale(st.camera.fovR);
      clampViewerCenter();
    };

    const canvasOffset = () => canvas.getBoundingClientRect();

    const onMouseMove = (e) => {
      const r = canvasOffset();
      const x = (e.clientX - r.left) * devicePixelRatio;
      const y = (e.clientY - r.top) * devicePixelRatio;
      if (st.grab) {
        st.camera.x += (st.cursorX - x) / st.camera.fovR;
        st.camera.y += (st.cursorY - y) / st.camera.fovR;
        clampViewerCenter();
      }
      st.cursorX = x;
      st.cursorY = y;
    };

    const onMouseDown = (e) => {
      if (e.button === 0) st.grab = true;
      if (e.button === 1) {
        e.preventDefault();
        st.camera.fov = 0.25;
      }
    };
    const onMouseUp = (e) => {
      if (e.button === 0) st.grab = false;
    };

    const onTouchStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      const r = canvasOffset();
      st.cursorX = (t.clientX - r.left) * devicePixelRatio;
      st.cursorY = (t.clientY - r.top) * devicePixelRatio;
      st.grab = true;
    };
    const onTouchEnd = () => {
      st.grab = false;
      st.lastPdist = 0;
    };
    const onTouchMove = (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const r = canvasOffset();
      const x = (t.clientX - r.left) * devicePixelRatio;
      const y = (t.clientY - r.top) * devicePixelRatio;

      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        const dx = a.clientX * devicePixelRatio - b.clientX * devicePixelRatio;
        const dy = a.clientY * devicePixelRatio - b.clientY * devicePixelRatio;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const diff = dist - st.lastPdist;
        const power = 1.0 + (!st.lastPdist ? 0.0 : diff * 0.005);
        st.lastPdist = dist;
        st.camera.fov *= power;
        clampFov();
        return;
      }

      if (st.grab) {
        st.camera.x += (st.cursorX - x) / st.camera.fovR;
        st.camera.y += (st.cursorY - y) / st.camera.fovR;
        clampViewerCenter();
      }
      st.lastPdist = 0;
      st.cursorX = x;
      st.cursorY = y;
    };

    const onWheel = (e) => {
      // Get world position under mouse before zoom
      const screenX = st.cursorX / st.scale;
      const screenY = st.cursorY / st.scale;
      const worldX = st.camera.x + (screenX - st.viewW * 0.5) / st.cameraScale;
      const worldY = st.camera.y + (screenY - st.viewH * 0.5) / st.cameraScale;

      // Apply zoom (very gradual: 10% per scroll)
      st.camera.fov *= e.deltaY > 0 ? 0.9 : 1.1;
      clampFov();
      updateGameScale(st.camera.fov);

      // Adjust camera so world position is still under mouse
      st.camera.x = worldX - (screenX - st.viewW * 0.5) / st.cameraScale;
      st.camera.y = worldY - (screenY - st.viewH * 0.5) / st.cameraScale;
      clampViewerCenter();

      if (e.ctrlKey) e.preventDefault();
    };

    const onContextMenu = (e) => e.preventDefault();

    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    addEventListener("mousemove", onMouseMove);
    addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("touchstart", onTouchStart);
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchmove", onTouchMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    // --- Render loop ---
    let lastSaveTime = -Infinity;
    const renderLoop = (time) => {
      const dt = Math.max(0, time - st.lastTime);
      st.lastTime = time;

      st.camera.update(dt);

      // Periodically save camera state to localStorage
      if (time - lastSaveTime > 2000 && mapKeyRef.current) {
        lastSaveTime = time;
        try {
          localStorage.setItem('camera:' + mapKeyRef.current, JSON.stringify({
            x: st.camera.x,
            y: st.camera.y,
            fov: st.camera.fov,
          }));
        } catch { /* ignore */ }
      }

      // Smooth cursor
      const f = Math.min(1, dt * 0.02);
      const mx = st.cursorX / st.scale;
      const my = st.cursorY / st.scale;
      st.cursorRx += (mx - st.cursorRx) * f;
      st.cursorRy += (my - st.cursorRy) * f;

      // Update zoom and cursor state for UI (throttled to ~60fps/every 16ms or 100ms)
      updateFrequencyRef.current++;
      if (updateFrequencyRef.current >= 5) {
        updateFrequencyRef.current = 0;
        setZoomLevel(st.camera.fovR);

        // Calculate world coordinates
        const worldX = st.camera.x + (mx - st.viewW * 0.5) / st.cameraScale;
        const worldY = st.camera.y + (my - st.viewH * 0.5) / st.cameraScale;
        setCursorX(worldX);
        setCursorY(worldY);

        // Get tile name at current position
        if (mapData?.data?.tilesets?.length > 0 && mapData?.data?.layers?.length > 0) {
          const gridX = Math.floor(worldX / mapData.tilewidth);
          const gridY = Math.floor(worldY / mapData.tileheight);

          if (gridX >= 0 && gridY >= 0 && gridX < mapData.gw && gridY < mapData.gh) {
            // Find tile ID from first tile layer
            let tileId = 0;
            for (const layer of mapData.data.layers) {
              if (layer.type === "tilelayer" && layer.data && layer.visible !== false) {
                const idx = gridY * mapData.gw + gridX;
                if (idx < layer.data.length) {
                  tileId = layer.data[idx] & 0x0FFFFFFF; // Remove rotation flags
                  if (tileId > 0) break;
                }
              }
            }

            if (tileId > 0) {
              // Look up tile name in tileset
              const tileset = mapData.data.tilesets[0];
              const localId = tileId - (tileset?.firstgid ?? 1);
              const tile = tileset?.tiles?.find((t) => t.id === localId);
              setTileName(tile?.name || "");
            } else {
              setTileName("");
            }
          } else {
            setTileName("");
          }
        } else {
          setTileName("");
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      uctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);

      clampFov();
      updateGameScale(st.camera.fovR);
      clampViewerCenter();

      const [camX, camY] = clampCenter(st.camera.rx, st.camera.ry);
      st.cameraX = camX - st.cameraCx;
      st.cameraY = camY - st.cameraCy;

      // Background tiles (WebGL2)
      st.renderer.render(
        st.totalScale,
        st.cameraX, st.cameraY,
        st.cameraWidth, st.cameraHeight,
        mapData.gw, mapData.gh,
        mapData.wf, mapData.hf,
        mapData.tilewidth, mapData.tileheight,
        mapData.data.layers,
        mapData.firstGid,
      );
      ctx.drawImage(st.renderer.canvas, 0, 0);

      // Game overlay (spawners, checkpoints, special sprites)
      octx.save();
      octx.scale(st.scale, st.scale);
      octx.scale(st.cameraScale, st.cameraScale);
      octx.translate(-st.cameraX, -st.cameraY);

      // Special sprites
      for (const s of mapData.specialSprites) {
        const sprite = sprites.get(s.id - mapData.firstGid);
        if (!sprite) continue;
        octx.save();
        octx.translate(s.x, s.y);
        octx.drawImage(sprite, 0, -s.height, s.width, s.height);
        octx.restore();
      }

      const lw = 25;
      const newTooltips = new Map();

      // Helper function to get all properties from a raw object
      const getObjectProperties = (rawObj) => {
        const props = [];
        if (rawObj.properties && Array.isArray(rawObj.properties)) {
          for (const prop of rawObj.properties) {
            props.push([prop.name + ": " + prop.value, "#ccc"]);
          }
        }
        return props;
      };

      // Helper function to look up tile name by gid
      const getTileNameByGid = (tileId) => {
        for (const tileset of mapData.data.tilesets || []) {
          if (tileset.tiles) {
            const localId = tileId - (tileset.firstgid ?? 1);
            const tile = tileset.tiles.find((t) => t.id === localId);
            if (tile) return tile.name;
          }
        }
        return null;
      };

      // Check for tiles under cursor (for tooltip)
      const gridX = Math.floor(st.cursorX / mapData.tilewidth);
      const gridY = Math.floor(st.cursorY / mapData.tileheight);
      if (gridX >= 0 && gridY >= 0 && gridX < mapData.gw && gridY < mapData.gh) {
        const idx = gridY * mapData.gw + gridX;
        // Check all tile layers in reverse order (top layer first)
        for (let layerIdx = mapData.data.layers.length - 1; layerIdx >= 0; layerIdx--) {
          const layer = mapData.data.layers[layerIdx];
          if (layer.type === "tilelayer" && layer.data && layer.visible !== false) {
            if (idx < layer.data.length) {
              const rawTileId = layer.data[idx];
              const tileId = rawTileId & 0x0FFFFFFF; // Remove rotation flags
              if (tileId > 0) {
                // Found a tile, create tooltip
                const contents = [];
                contents.push(["layer: " + (layer.name || "unnamed"), "#aaffaa"]);
                contents.push(["grid: (" + gridX + "," + gridY + ")", "#aaaaff"]);
                contents.push(["world: (" + Math.round(st.cursorX * 10) / 10 + "," + Math.round(st.cursorY * 10) / 10 + ")", "#aaaaff"]);
                contents.push(["tile_id: " + tileId, "#999"]);
                contents.push(["raw: 0x" + rawTileId.toString(16).toUpperCase().padStart(8, "0"), "#666"]);

                // Check if this tile has properties in the tileset
                let tileObj = null;
                for (const tileset of mapData.data.tilesets || []) {
                  const firstgid = tileset.firstgid ?? 1;
                  if (tileId >= firstgid && tileId < firstgid + (tileset.tilecount ?? 0)) {
                    const localId = tileId - firstgid;
                    tileObj = tileset.tiles?.find((t) => t.id === localId);
                    break;
                  }
                }

                if (tileObj?.properties && Array.isArray(tileObj.properties)) {
                  for (const prop of tileObj.properties) {
                    contents.push(["  " + prop.name + ": " + prop.value, "#999"]);
                  }
                }

                newTooltips.set("tile_" + layerIdx, { contents });
                break; // Only show topmost tile
              }
            }
          }
        }
      }

      // Mob spawners
      for (const spawner of mapData.mobSpawners) {
        octx.save();
        octx.translate(spawner.x, spawner.y);
        octx.fillStyle = spawner.color;
        octx.strokeStyle = darkened(spawner.color.substring(1), 0.2);
        octx.lineWidth = lw;
        octx.beginPath();

        const collision = octx.isPointInPath(spawner.points, st.cursorX, st.cursorY);
        octx.globalAlpha = collision ? (spawner.big ? 0.0 : 0.1) : 0.0;
        octx.fill(spawner.points);
        octx.globalAlpha = 1.0;
        octx.stroke(spawner.points);
        octx.restore();

        if (collision) {
          const contents = [];
          contents.push(["[spawn_mobs]", "#ffaaff"]);
          contents.push(["rarity: " + rarityFromDiff(spawner.difficulty).toLowerCase(), spawner.color]);
          if (!isNaN(spawner.difficulty)) contents.push(["difficulty: " + spawner.difficulty, "#fff"]);
          if (!isNaN(spawner.density)) contents.push(["density: " + spawner.density, "#fff"]);
          if (!isNaN(spawner.extraSpawnDelay)) contents.push(["extra_spawn_delay: " + spawner.extraSpawnDelay, "#facbcb"]);
          if (!isNaN(spawner.forceRarity)) contents.push(["force_rarity: " + spawner.forceRarity, "#facbcb"]);
          if (!isNaN(spawner.team)) contents.push(["team: " + spawner.team, "#facbcb"]);
          contents.push(["pos: (" + Math.round(spawner.x * 10) / 10 + "," + Math.round(spawner.y * 10) / 10 + ")", "#aaaaff"]);
          contents.push(["size: (" + Math.round(spawner.width * 10) / 10 + "x" + Math.round(spawner.height * 10) / 10 + ")", "#aaaaff"]);
          contents.push(["id: " + spawner.id, "#999"]);

          // Add custom properties, excluding ones already shown
          const customProps = getObjectProperties(spawner.rawObj).filter(
            ([text]) => !text.includes("difficulty:") && !text.includes("density:") && !text.includes("extra_spawn_delay:") &&
              !text.includes("force_rarity:") && !text.includes("team:")
          );
          for (const prop of customProps) {
            contents.push(prop);
          }

          const totalWeight = spawner.mobs.reduce((a, m) => a + m.chance, 0);
          const mobsWithFreq = totalWeight > 0
            ? spawner.mobs.map((m) => ({ ...m, chance: Math.round((m.chance / totalWeight) * 100) + "%" }))
            : spawner.mobs;
          newTooltips.set(spawner.id, { contents, mobs: mobsWithFreq, zoneColor: spawner.color });
        }
      }

      // Checkpoints
      for (const cp of mapData.checkPoints) {
        octx.save();
        octx.translate(cp.x, cp.y);
        octx.fillStyle = "#ff00ff";
        octx.strokeStyle = "#ff00ff";
        octx.lineWidth = lw;
        octx.beginPath();

        const collision = octx.isPointInPath(cp.points, st.cursorX, st.cursorY);
        octx.globalAlpha = collision ? 0.1 : 0.0;
        octx.fill(cp.points);
        octx.globalAlpha = 1.0;
        octx.stroke(cp.points);
        octx.restore();

        if (collision) {
          const contents = [["[checkpoint]", "#ccffcf"]];
          if (!isNaN(cp.level)) contents.push(["level: " + cp.level, "#fff"]);
          contents.push(["pos: (" + Math.round(cp.x * 10) / 10 + "," + Math.round(cp.y * 10) / 10 + ")", "#aaaaff"]);
          contents.push(["size: (" + Math.round(cp.width * 10) / 10 + "x" + Math.round(cp.height * 10) / 10 + ")", "#aaaaff"]);
          contents.push(["id: " + cp.id, "#999"]);

          // Add custom properties, excluding ones already shown
          const customProps = getObjectProperties(cp.rawObj).filter(
            ([text]) => !text.includes("level:")
          );
          for (const prop of customProps) {
            contents.push(prop);
          }

          newTooltips.set(cp.id, { contents });
        }
      }

      // Warps
      const warpRadius = 80;
      for (const warp of mapData.warps) {
        octx.save();
        octx.translate(warp.x, warp.y);

        const warpPath = new Path2D();
        warpPath.arc(0, 0, warpRadius, 0, Math.PI * 2);

        const collision = octx.isPointInPath(warpPath, st.cursorX, st.cursorY);

        octx.globalAlpha = 1;
        if (warp.warpType === "warp") {
          octx.strokeStyle = collision ? "#00ccff" : "#ffffff";
        } else {
          octx.strokeStyle = "#000000";
        }
        octx.lineWidth = 40;
        octx.stroke(warpPath);
        octx.globalAlpha = 1.0;

        octx.restore();

        if (collision) {
          const contents = [["[" + warp.warpType + "]", "#00ccff"]];
          if (warp.name) contents.push(["name: " + warp.name, "#fff"]);
          if (warp.map) contents.push(["map: " + warp.map, "#aaffaa"]);
          if (warp.warpPoint) contents.push(["warp_point: " + warp.warpPoint, "#ffffaa"]);
          contents.push(["pos: (" + Math.round(warp.x * 10) / 10 + "," + Math.round(warp.y * 10) / 10 + ")", "#aaaaff"]);
          contents.push(["size: (" + Math.round(warp.width * 10) / 10 + "x" + Math.round(warp.height * 10) / 10 + ")", "#aaaaff"]);
          contents.push(["id: " + warp.id, "#999"]);

          // Add custom properties, excluding ones already shown
          const customProps = getObjectProperties(warp.rawObj).filter(
            ([text]) => !text.includes("name:") && !text.includes("map:") && !text.includes("warp_point:")
          );
          for (const prop of customProps) {
            contents.push(prop);
          }

          newTooltips.set(warp.id, { contents });
        }
      }

      // Unknown object types
      if (mapData.unknownObjects) {
        for (const obj of mapData.unknownObjects) {
          octx.save();
          octx.translate(obj.x, obj.y);
          octx.fillStyle = "#666666";
          octx.strokeStyle = "#999999";
          octx.lineWidth = lw;
          octx.beginPath();

          const collision = octx.isPointInPath(obj.points, st.cursorX, st.cursorY);
          octx.globalAlpha = collision ? 0.1 : 0.0;
          octx.fill(obj.points);
          octx.globalAlpha = 1.0;
          octx.stroke(obj.points);
          octx.restore();

          if (collision) {
            const contents = [["[" + (obj.type || "unknown") + "]", "#ccccff"]];
            if (obj.name) contents.push(["name: " + obj.name, "#fff"]);
            contents.push(["pos: (" + Math.round(obj.x * 10) / 10 + "," + Math.round(obj.y * 10) / 10 + ")", "#aaaaff"]);
            contents.push(["size: (" + Math.round(obj.width * 10) / 10 + "x" + Math.round(obj.height * 10) / 10 + ")", "#aaaaff"]);
            contents.push(["id: " + obj.id, "#999"]);

            // Add all properties to tooltip
            const allProps = getObjectProperties(obj.rawObj);
            for (const prop of allProps) {
              contents.push(prop);
            }

            // If no properties, show a message
            if (allProps.length === 0) {
              contents.push(["(no properties)", "#666"]);
            }

            newTooltips.set("unknown_" + obj.id, { contents });
          }
        }
      }

      octx.restore();
      ctx.drawImage(overlay, 0, 0);

      // UI: tooltips
      uctx.save();
      uctx.scale(st.scale, st.scale);

      const pad = 8;
      const cols = 3;
      const rw = 68;
      const rh = 68;
      const lineH = 22;
      const fontSize = 18;
      const chanceH = 20; // space below icon for chance label
      const cellW = rw + pad;
      const cellH = rh + chanceH + pad;
      const tipWMobs = cols * cellW + pad * 2; // 3*(68+8)+16 = 244 (width for tooltips with mobs)
      const tipWNoMobs = 320; // wider width for tile/zone tooltips without mobs

      const bgpath = new Path2D();
      bgpath.roundRect(0, 0, rw, rh, 6);

      // Helper function to wrap text across multiple lines
      const wrapText = (text, maxWidth) => {
        uctx.font = `${fontSize}px GameMono, monospace`;
        const lines = [];
        let currentLine = "";
        const words = text.split(" ");

        for (let word of words) {
          // Check if word itself is too long and needs to be broken on delimiters
          while (word && uctx.measureText(word).width > maxWidth) {
            let broken = false;

            // Try breaking on semicolons (for mobs lists)
            if (word.includes(";")) {
              const parts = word.split(";");
              let segment = "";
              for (let i = 0; i < parts.length; i++) {
                const nextSegment = segment ? segment + ";" + parts[i] : parts[i];
                if (uctx.measureText(nextSegment).width <= maxWidth) {
                  segment = nextSegment;
                } else {
                  // Segment won't fit, finalize current and start new
                  if (segment) {
                    if (currentLine) lines.push(currentLine);
                    currentLine = segment + ";";
                    segment = parts[i];
                  } else {
                    // Single part is too long, force it
                    if (currentLine) lines.push(currentLine);
                    currentLine = parts[i] + (i < parts.length - 1 ? ";" : "");
                  }
                  broken = true;
                }
              }
              if (segment) {
                word = segment;
              } else {
                word = "";
              }
              break;
            } else {
              // No semicolon, just force word to new line
              if (currentLine) lines.push(currentLine);
              currentLine = word;
              word = "";
              break;
            }
          }

          if (!word) continue;

          // Try to add word to current line
          const testLine = currentLine ? currentLine + " " + word : word;
          if (uctx.measureText(testLine).width <= maxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines.length > 0 ? lines : [text];
      };

      // Compute dynamic height and width for each tooltip
      const getTipDimensions = (tooltip) => {
        const maxTextW = tooltip.mobs ? tipWMobs - pad * 2 : tipWNoMobs - pad * 2;
        let totalLines = 0;
        for (const [text] of tooltip.contents) {
          const wrapped = wrapText(text, maxTextW);
          totalLines += wrapped.length;
        }
        const nMobs = tooltip.mobs?.length ?? 0;
        const nRows = nMobs > 0 ? Math.ceil(nMobs / cols) : 0;
        const h = pad + totalLines * lineH + (nRows > 0 ? pad + nRows * cellH : 0) + pad;
        const w = nMobs > 0 ? tipWMobs : tipWNoMobs;
        return { w, h };
      };

      const maxTipH = newTooltips.size > 0
        ? Math.max(...[...newTooltips.values()].map(t => getTipDimensions(t).h))
        : 0;

      const totalTipW = newTooltips.size * (Math.max(tipWMobs, tipWNoMobs) + pad) - pad;
      const tooltipX = st.cursorRx - totalTipW * 0.5;
      const rx = Math.max(pad, Math.min(tooltipX, st.viewW - totalTipW - pad));
      const ry = Math.max(pad, Math.min(st.cursorRy, st.viewH - maxTipH - pad));

      uctx.save();
      uctx.translate(rx, ry);

      for (const [, tooltip] of newTooltips) {
        const { w: tipW, h: tipH } = getTipDimensions(tooltip);
        const maxTextW = tipW - pad * 2;

        uctx.save();

        // Background
        uctx.fillStyle = "#000";
        uctx.globalAlpha = 0.72;
        uctx.beginPath();
        uctx.roundRect(0, 0, tipW, tipH, 10);
        uctx.fill();
        uctx.globalAlpha = 1.0;

        uctx.fillStyle = "#fff";
        uctx.strokeStyle = "#000";
        uctx.lineWidth = 2;
        uctx.font = `${fontSize}px GameMono, monospace`;
        uctx.textAlign = "left";
        uctx.textBaseline = "top";
        uctx.translate(pad, pad);

        // Content lines — wrap to next line instead of truncating
        for (const [text, fill] of tooltip.contents) {
          uctx.font = `${fontSize}px GameMono, monospace`;
          const wrappedLines = wrapText(text, maxTextW);
          uctx.fillStyle = fill;
          for (const line of wrappedLines) {
            uctx.strokeText(line, 0, 0);
            uctx.fillText(line, 0, 0);
            uctx.translate(0, lineH);
          }
        }

        // Mob icons
        if (tooltip.mobs) {
          const bgColor = tooltip.zoneColor || RarityColor.Common;
          uctx.translate(0, pad);
          let i = 0;
          for (const mob of tooltip.mobs) {
            const sprite = mobSprites?.get(mob.id);
            if (!sprite) {
              // Fallback: mob name text in icon area
              const name = mobmap.get(mob.id);
              if (name) {
                uctx.save();
                uctx.fillStyle = "#aaa";
                uctx.font = "12px GameMono, monospace";
                uctx.textAlign = "left";
                uctx.fillText(name, 0, rh * 0.5 - 6);
                uctx.restore();
              }
            } else {
              uctx.save();
              uctx.fillStyle = bgColor;
              uctx.strokeStyle = darkened(bgColor.substring(1), 0.2);
              uctx.lineWidth = rw * 0.1;
              uctx.fill(bgpath);
              uctx.clip(bgpath);
              uctx.drawImage(sprite, 0, 0, rw, rh);
              uctx.stroke(bgpath);
              uctx.restore();
            }
            // Chance label below icon
            if (mob.chance !== undefined) {
              uctx.save();
              uctx.fillStyle = "#ffee44";
              uctx.strokeStyle = "#000";
              uctx.lineWidth = 2.5;
              uctx.font = "bold 14px GameMono, monospace";
              uctx.textAlign = "center";
              uctx.textBaseline = "top";
              uctx.strokeText(mob.chance.toString(), rw * 0.5, rh + 3);
              uctx.fillText(mob.chance.toString(), rw * 0.5, rh + 3);
              uctx.restore();
            }
            uctx.translate(cellW, 0);
            i++;
            if (i % cols === 0) uctx.translate(-cellW * cols, cellH);
          }
        }

        uctx.restore();
        uctx.translate(tipW + pad, 0);
      }

      uctx.restore();
      uctx.restore();
      ctx.drawImage(uiCanvas, 0, 0);

      // Loading fade
      if (st.wrapAlpha > 0) {
        ctx.globalAlpha = st.wrapAlpha;
        ctx.fillStyle = "#191919";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        st.wrapAlpha -= 0.001 * dt;
        ctx.globalAlpha = 1.0;
      }

      st.animId = requestAnimationFrame(renderLoop);
    };

    st.lastTime = performance.now();
    st.animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(st.animId);
      observer.disconnect();
      removeEventListener("mousemove", onMouseMove);
      removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [mapData, sprites, mobSprites, initState, mapKey]);

  const handleZoomIn = () => {
    const state = stateRef.current;
    if (!state || zoomLevel >= maxZoom) return;
    state.camera.fov *= 1.15;
    state.camera.fovR = state.camera.fov;
  };

  const handleZoomOut = () => {
    const state = stateRef.current;
    if (!state || zoomLevel <= minZoom) return;
    state.camera.fov *= 0.85;
    state.camera.fovR = state.camera.fov;
  };

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          touchAction: "none",
          background: "transparent",
        }}
      />

      {/* Unified Status Bar - Bottom (Coordinates, Tile, Zoom Controls) */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 28,
          background: "#1a1a1a",
          border: "1px solid #333",
          borderTop: "1px solid #333",
          borderBottom: "none",
          borderRight: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 8,
          paddingRight: 0,
          zIndex: 10,
          fontFamily: '"GameMono", monospace',
          fontSize: 11,
          color: "#888",
          userSelect: "none",
        }}
      >
        {/* Left side - Coordinates and Tile Info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            pointerEvents: "none",
            overflow: "hidden",
            flex: 1,
          }}
        >
          <span>X: {Math.round(cursorX)}</span>
          <span>Y: {Math.round(cursorY)}</span>
          {tileName && <span style={{ color: "#aaa", whiteSpace: "nowrap" }}>Tile: {tileName}</span>}
        </div>

        {/* Right side - Zoom Controls */}
        <div
          style={{
            display: "flex",
            gap: 0,
            pointerEvents: "auto",
            height: "100%",
          }}
        >
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= maxZoom}
            title="Zoom in"
            style={{
              background: "#0a0a0a",
              border: "none",
              borderRight: "1px solid #333",
              borderRadius: "0",
              outline: "none",
              color: zoomLevel >= maxZoom ? "#555" : "#ccc",
              cursor: zoomLevel >= maxZoom ? "default" : "pointer",
              padding: "0 6px",
              fontSize: 12,
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
              opacity: zoomLevel >= maxZoom ? 0.5 : 1,
              fontFamily: '"Game", Ubuntu, sans-serif',
              height: "100%",
            }}
            onMouseEnter={(e) => {
              if (zoomLevel < maxZoom) {
                e.currentTarget.style.background = "#2a2d2e";
                e.currentTarget.style.color = "#e8e8e8";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#0a0a0a";
              e.currentTarget.style.color = zoomLevel >= maxZoom ? "#555" : "#ccc";
            }}
          >
            +
          </button>

          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= minZoom}
            title="Zoom out"
            style={{
              background: "#0a0a0a",
              border: "none",
              borderRadius: "0",
              outline: "none",
              color: zoomLevel <= minZoom ? "#555" : "#ccc",
              cursor: zoomLevel <= minZoom ? "default" : "pointer",
              padding: "0 6px",
              fontSize: 12,
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
              opacity: zoomLevel <= minZoom ? 0.5 : 1,
              fontFamily: '"Game", Ubuntu, sans-serif',
              height: "100%",
            }}
            onMouseEnter={(e) => {
              if (zoomLevel > minZoom) {
                e.currentTarget.style.background = "#2a2d2e";
                e.currentTarget.style.color = "#e8e8e8";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#0a0a0a";
              e.currentTarget.style.color = zoomLevel <= minZoom ? "#555" : "#ccc";
            }}
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
