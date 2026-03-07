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
    localStorage.setItem("visited_map", mapId);
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

        // 4. Try to load each map to determine availability
        setStatus("Checking map availability...");
        const checkedMeta = [];
        for (const m of meta) {
          const ok = await ensureMapLoaded(m.id);
          checkedMeta.push({ ...m, ok, disabled: !ok, fetched: true });
        }
        if (cancelled) return;
        setMapList(checkedMeta);

        // 5. Determine start map
        const visited = localStorage.getItem("visited_map");
        const hadVisited = visited !== null;
        let startMap;

        if (hadVisited) {
          const known = checkedMeta.find((m) => m.id === visited);
          startMap = known?.ok ? visited : checkedMeta.find((m) => m.ok)?.id;
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

        // Only switch to map view if user previously visited a map
        if (hadVisited) {
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

  const handleFileSelect = useCallback(async (file) => {
    if (file.type === "map") {
      if (currentFile?.type === "map" && file.id === currentFile.id) return;
      const data = await loadAndSelectMap(file.id);
      if (!data) return;
      setMapData(data);
      setCurrentFile(file);
    } else {
      setCurrentFile(file);
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
      {!loading && (
        <>
          <FileBrowser
            mapList={mapList}
            tileFiles={tileFiles}
            currentFile={currentFile}
            onFileSelect={handleFileSelect}
            width={panelWidth}
            isMobileOpen={sidebarOpen}
            onMobileClose={() => setSidebarOpen(false)}
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
        </>
      )}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Mobile hamburger */}
        {!loading && (
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
        )}

        {currentFile?.type === "readme" && <ReadmeViewer />}
        {currentFile?.type === "map" && mapData && sprites && (
          <MapCanvas
            mapData={mapData}
            sprites={sprites}
            mobSprites={mobSpritesState}
          />
        )}
        {currentFile?.type === "tile" && sprites && (
          <TileViewer tileId={currentFile.id} sprites={sprites} />
        )}
        {currentFile?.type === "tileset" && (
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
        {currentFile?.type === "maplist" && (
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
              top: "50%",
              transform: "translate(-50%, -50%)",
              color: "#fff",
              fontSize: "36px",
              fontFamily: "Game, Ubuntu, sans-serif",
              fontWeight: "bold",
              textAlign: "center",
              zIndex: 100,
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
