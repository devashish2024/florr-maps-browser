import { useEffect, useRef, useCallback, useState } from "react";
import { Camera } from "../lib/camera.js";
import { TileRenderer } from "../lib/renderer.js";
import { VIEW_W, VIEW_H } from "../lib/consts.js";
import { darkened } from "../lib/utils.js";
import { RarityColor, rarityFromDiff } from "../lib/color.js";
import { mobmap } from "../lib/mobs.js";

export default function MapCanvas({ mapData, sprites, mobSprites }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stateRef = useRef(null);
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
      const cps = mapData.checkPoints;
      if (cps.length === 0) {
        st.camera.x = mapData.width * 0.5;
        st.camera.y = mapData.height * 0.5;
        st.camera.rx = st.camera.x;
        st.camera.ry = st.camera.y;
        clampFov();
        updateGameScale(st.camera.fovR);
        clampViewerCenter();
        return;
      }

      const minLevel = Math.min(...cps.map((c) => c.level));
      if (minLevel !== 0) {
        st.camera.x = mapData.width * 0.5;
        st.camera.y = mapData.height * 0.5;
        st.camera.rx = st.camera.x;
        st.camera.ry = st.camera.y;
        clampFov();
        updateGameScale(st.camera.fovR);
        clampViewerCenter();
        return;
      }

      const level0 = cps.filter((c) => c.level === 0);
      const target = level0.length === 3 ? level0[1] : level0[0];
      if (!target) return;

      st.camera.fov = 0.25;
      st.camera.fovR = 0.25;
      st.camera.x = target.x + target.width * 0.5;
      st.camera.y = target.y + target.height * 0.5;
      st.camera.rx = st.camera.x;
      st.camera.ry = st.camera.y;

      clampFov();
      updateGameScale(st.camera.fovR);
      clampViewerCenter();
    };

    glideToCheckpoint();
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
    const renderLoop = (time) => {
      const dt = Math.max(0, time - st.lastTime);
      st.lastTime = time;

      st.camera.update(dt);

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
          contents.push(["rarity: " + rarityFromDiff(spawner.difficulty).toLowerCase(), spawner.color]);
          if (!isNaN(spawner.difficulty)) contents.push(["difficulty:" + spawner.difficulty, "#fff"]);
          if (!isNaN(spawner.density)) contents.push(["density:" + spawner.density, "#fff"]);
          if (!isNaN(spawner.extraSpawnDelay)) contents.push(["extra_spawn_delay:" + spawner.extraSpawnDelay, "#facbcb"]);
          if (!isNaN(spawner.forceRarity)) contents.push(["force_rarity:" + spawner.forceRarity, "#facbcb"]);
          if (!isNaN(spawner.team)) contents.push(["team:" + spawner.team, "#facbcb"]);
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
          const contents = [["checkpoint", "#ccffcf"]];
          if (!isNaN(cp.level)) contents.push(["level:" + cp.level, "#fff"]);
          newTooltips.set(cp.id, { contents });
        }
      }

      // Warps
      const warpRadius = 200;
      for (const warp of mapData.warps) {
        octx.save();
        octx.translate(warp.x, warp.y);

        const warpPath = new Path2D();
        warpPath.arc(0, 0, warpRadius, 0, Math.PI * 2);

        const collision = octx.isPointInPath(warpPath, st.cursorX, st.cursorY);

        // Draw warp marker
        if (warp.warpType === "warp") {
          octx.strokeStyle = "#000000"; // Black for warp
        } else {
          octx.strokeStyle = "#ffffff"; // White for warp_destination
        }
        octx.lineWidth = 40;
        octx.globalAlpha = collision ? 0.8 : 0.4;
        octx.stroke(warpPath);
        octx.globalAlpha = 1.0;

        octx.restore();

        if (collision) {
          const contents = [[warp.warpType, "#00ccff"]];
          if (warp.name) contents.push(["name: " + warp.name, "#fff"]);
          if (warp.map) contents.push(["map: " + warp.map, "#aaffaa"]);
          if (warp.warpPoint) contents.push(["warp_point: " + warp.warpPoint, "#ffffaa"]);
          newTooltips.set(warp.id, { contents });
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
      const tipW = cols * cellW + pad * 2; // 3*(68+8)+16 = 244

      const bgpath = new Path2D();
      bgpath.roundRect(0, 0, rw, rh, 6);

      // Compute dynamic height for each tooltip
      const getTipHeight = (tooltip) => {
        const nLines = tooltip.contents.length;
        const nMobs = tooltip.mobs?.length ?? 0;
        const nRows = nMobs > 0 ? Math.ceil(nMobs / cols) : 0;
        return pad + nLines * lineH + (nRows > 0 ? pad + nRows * cellH : 0) + pad;
      };

      const maxTipH = newTooltips.size > 0
        ? Math.max(...[...newTooltips.values()].map(getTipHeight))
        : 0;

      const totalTipW = newTooltips.size * (tipW + pad) - pad;
      const tooltipX = st.cursorRx - totalTipW * 0.5;
      const rx = Math.max(pad, Math.min(tooltipX, st.viewW - totalTipW - pad));
      const ry = Math.max(pad, Math.min(st.cursorRy, st.viewH - maxTipH - pad));

      uctx.save();
      uctx.translate(rx, ry);

      for (const [, tooltip] of newTooltips) {
        const tipH = getTipHeight(tooltip);
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

        // Content lines — truncate with ellipsis if too wide
        for (const [text, fill] of tooltip.contents) {
          uctx.font = `${fontSize}px GameMono, monospace`;
          let display = text;
          while (display.length > 4 && uctx.measureText(display).width > maxTextW) {
            display = display.slice(0, -4) + "\u2026";
          }
          uctx.fillStyle = fill;
          uctx.strokeText(display, 0, 0);
          uctx.fillText(display, 0, 0);
          uctx.translate(0, lineH);
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
  }, [mapData, sprites, mobSprites, initState]);

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
