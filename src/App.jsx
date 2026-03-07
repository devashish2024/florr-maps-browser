import { useState, useEffect, useRef, useCallback } from "react";
import MapCanvas from "./components/MapCanvas.jsx";
import FileBrowser from "./components/FileBrowser.jsx";
import TileViewer from "./components/TileViewer.jsx";
import ReadmeViewer from "./components/ReadmeViewer.jsx";
import { loadTiles } from "./lib/tileset.js";
import { loadMapList } from "./lib/maplist.js";
import { ensureMapLoaded } from "./lib/maploader.js";
import { parseMap } from "./lib/tiled.js";
import { svgToCanvas } from "./lib/svgrender.js";
import { fetchText } from "./lib/proxy.js";
import { mobmap } from "./lib/mobs.js";
import "./App.css";

const SPECIAL_IDS = new Set([93, 115]);

const MOB_SVG_BASE = "https://florr.io/mobs";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");
  const [mapData, setMapData] = useState(null);
  const [mapList, setMapList] = useState([]);
  const [currentFile, setCurrentFile] = useState(() => {
    try {
      const raw = localStorage.getItem("visited_file");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.type === "map" && parsed.id) return parsed;
        if (parsed?.type === "readme") return parsed;
      }
    } catch { /* ignore */ }
    // Legacy fallback
    const visited = localStorage.getItem("visited_map");
    if (visited) return { type: "map", id: visited };
    return { type: "readme" };
  });

  const [sprites, setSprites] = useState(null);
  const [mobSpritesState, setMobSpritesState] = useState(null);
  const [tileFiles, setTileFiles] = useState([]);
  const [rawTileset, setRawTileset] = useState("");
  const [rawMapList, setRawMapList] = useState("");
  const [panelWidth, setPanelWidth] = useState(() => {
    return parseInt(localStorage.getItem("panel_width")) || 240;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadAndSelectMap = useCallback(async (mapId, onStatus) => {
    const ok = await ensureMapLoaded(mapId, onStatus);
    if (!ok) return null;
    const data = parseMap(mapId);
    return data;
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // 1. Load tiles
        const { tiles: tileSvgs, tileFileEntries, rawTileset: rawTs } = await loadTiles(setStatus);
        if (!cancelled) {
          setTileFiles(tileFileEntries);
          setRawTileset(rawTs);
        }

        // 2. Build tile sprites
        setStatus("Building tile sprites...");
        const tileSprites = new Map();
        for (const [id, svg] of tileSvgs) {
          const s = SPECIAL_IDS.has(id) ? 2048 : 512;
          const canvas = svgToCanvas(svg, s, s);
          if (canvas) tileSprites.set(id, canvas);
        }
        if (!cancelled) setSprites(tileSprites);

        // 3. Load map list
        const { meta, rawContent: rawMl } = await loadMapList(setStatus);
        if (cancelled) return;
        if (!cancelled) setRawMapList(rawMl);

        // 4. Preload all maps in parallel
        setStatus("Loading all maps...");
        const results = await Promise.allSettled(
          meta.map(async (m) => {
            const ok = await ensureMapLoaded(m.id);
            return { ...m, ok, disabled: !ok, fetched: true };
          })
        );
        if (cancelled) return;
        const checkedMeta = results.map((r, i) => r.status === "fulfilled" ? r.value : { ...meta[i], ok: false, disabled: true, fetched: true });
        setMapList(checkedMeta);

        // 5. Determine start map
        let visitedFile = null;
        try {
          const raw = localStorage.getItem("visited_file");
          if (raw) visitedFile = JSON.parse(raw);
        } catch { /* ignore */ }
        // Legacy fallback
        if (!visitedFile) {
          const legacy = localStorage.getItem("visited_map");
          if (legacy) visitedFile = { type: "map", id: legacy };
        }

        let startMap;
        if (visitedFile?.type === "map" && visitedFile.id) {
          const known = checkedMeta.find((m) => m.id === visitedFile.id);
          startMap = known?.ok ? visitedFile.id : checkedMeta.find((m) => m.ok)?.id;
        } else {
          const gardenMeta = checkedMeta.find((m) => m.id === "garden");
          startMap = gardenMeta?.ok ? "garden" : checkedMeta.find((m) => m.ok)?.id;
        }

        if (!startMap) {
          setStatus("No maps available.");
          return;
        }

        // 6. Load start map
        const data = await loadAndSelectMap(startMap, setStatus);
        if (cancelled || !data) return;

        // Only switch to map view if last visited was a map
        if (visitedFile?.type === "map") {
          setCurrentFile({ type: "map", id: startMap });
        }
        setMapData(data);

        // 7. Load mob sprites in background
        setStatus("Loading mob sprites...");
        const mSprites = new Map();
        for (const [id] of mobmap) {
          try {
            const svg = await fetchText(`${MOB_SVG_BASE}/${id}.svg`);
            const canvas = svgToCanvas(svg, 256, 256);
            if (canvas) mSprites.set(id, canvas);
          } catch {
            // skip unavailable mob sprites
          }
        }
        if (!cancelled) setMobSpritesState(mSprites);

        setStatus("Done");
        setLoading(false);
      } catch (err) {
        console.error(err);
        setStatus("Error: " + err.message);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [loadAndSelectMap]);

  const saveVisited = (file) => {
    if (file.type === "map" || file.type === "readme") {
      localStorage.setItem("visited_file", JSON.stringify(file));
    }
  };

  const handleFileSelect = useCallback(async (file) => {
    if (file.type === "map") {
      if (currentFile?.type === "map" && file.id === currentFile.id) return;
      const data = await loadAndSelectMap(file.id);
      if (!data) return;
      setMapData(data);
      setCurrentFile(file);
      saveVisited(file);
    } else {
      setCurrentFile(file);
      saveVisited(file);
    }
  }, [currentFile, loadAndSelectMap]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMouseMove = (ev) => {
      setPanelWidth(Math.max(120, Math.min(600, ev.clientX)));
    };
    const onMouseUp = (ev) => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const finalWidth = Math.max(120, Math.min(600, ev.clientX));
      localStorage.setItem("panel_width", finalWidth.toString());
      removeEventListener("mousemove", onMouseMove);
      removeEventListener("mouseup", onMouseUp);
    };
    addEventListener("mousemove", onMouseMove);
    addEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <FileBrowser
        mapList={mapList}
        tileFiles={tileFiles}
        currentFile={loading && currentFile?.type !== "help" ? { type: "readme" } : currentFile}
        onFileSelect={handleFileSelect}
        width={panelWidth}
        isMobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        loading={loading}
      />
      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          width: 4,
          cursor: "col-resize",
          background: "#2d2d2d",
          flexShrink: 0,
          zIndex: 5,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#007acc")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#2d2d2d")}
      />
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Mobile hamburger */}
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(true)}
          style={{
            display: "none",
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 15,
            background: "#2a2a2a",
            color: "#ccc",
            border: "1px solid #444",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 18,
            cursor: "pointer",
            fontFamily: "Game, Ubuntu, sans-serif",
            lineHeight: 1,
          }}
        >
          ☰
        </button>

        {(loading && currentFile?.type !== "help" || !loading && currentFile?.type === "readme") && <ReadmeViewer src="/README.md" />}
        {(currentFile?.type === "help") && <ReadmeViewer src="/HELP.md" />}
        {!loading && currentFile?.type === "map" && mapData && sprites && (
          <MapCanvas
            mapData={mapData}
            sprites={sprites}
            mobSprites={mobSpritesState}
          />
        )}
        {!loading && currentFile?.type === "tile" && sprites && (
          <TileViewer tileId={currentFile.id} sprites={sprites} />
        )}
        {!loading && currentFile?.type === "tileset" && (
          <div style={{ color: "#888", padding: 40, fontSize: 18, fontFamily: "Game, Ubuntu, sans-serif", height: "100%", overflow: "auto" }}>
            <h2 style={{ color: "#ccc", marginBottom: 16 }}>tileset.tsj</h2>
            <p>Tileset definition file containing {tileFiles.length} tile references.</p>
            <p style={{ marginTop: 8, fontSize: 14, marginBottom: 20 }}>Open individual tiles from the tiles/ folder.</p>
            <pre style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 6,
              padding: 16,
              fontSize: 12,
              fontFamily: "GameMono, monospace",
              color: "#9cdcfe",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "calc(100vh - 220px)",
              overflow: "auto",
            }}>{rawTileset}</pre>
          </div>
        )}
        {!loading && currentFile?.type === "maplist" && (
          <div style={{ color: "#888", padding: 40, fontSize: 18, fontFamily: "Game, Ubuntu, sans-serif", height: "100%", overflow: "auto" }}>
            <h2 style={{ color: "#ccc", marginBottom: 16 }}>maps.txt</h2>
            <p>{mapList.filter((m) => !m.disabled).length} maps available.</p>
            <p style={{ marginTop: 8, fontSize: 14, marginBottom: 20 }}>Open individual maps from the maps/ folder.</p>
            <pre style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 6,
              padding: 16,
              fontSize: 12,
              fontFamily: "GameMono, monospace",
              color: "#9cdcfe",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "calc(100vh - 220px)",
              overflow: "auto",
            }}>{rawMapList}</pre>
          </div>
        )}
        {loading && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 24,
              transform: "translateX(-50%)",
              color: "#888",
              fontSize: 14,
              fontFamily: "Game, Ubuntu, sans-serif",
              textAlign: "center",
              zIndex: 100,
              background: "rgba(30,30,30,0.85)",
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid #333",
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
