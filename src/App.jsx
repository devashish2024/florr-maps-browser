import { useState, useEffect, useRef, useCallback } from "react";
import MapCanvas from "./components/MapCanvas.jsx";
import FileBrowser from "./components/FileBrowser.jsx";
import TileViewer from "./components/TileViewer.jsx";
import ReadmeViewer from "./components/ReadmeViewer.jsx";
import MapListViewer from "./components/MapListViewer.jsx";
import TilesetViewer from "./components/TilesetViewer.jsx";
import { loadTiles } from "./lib/tileset.js";
import { loadMapList, loadArchivedMapList } from "./lib/maplist.js";
import { ensureMapLoaded, ensureArchivedMapLoaded, refreshMap } from "./lib/maploader.js";
import { parseMap } from "./lib/tiled.js";
import { svgToCanvas } from "./lib/svgrender.js";
import { fetchText } from "./lib/proxy.js";
import { mobmap } from "./lib/mobs.js";
import "./App.css";

const SPECIAL_IDS = new Set([93, 115]);

const MOB_SVG_BASE = "https://florr.io/mobs";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

const parseProgressFraction = (text) => {
  const match = text?.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(1, done / total));
};

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
        if (parsed?.type === "archived_map" && parsed.id) return parsed;
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
  const [mapListLastFetched, setMapListLastFetched] = useState(null);
  const [panelWidth, setPanelWidth] = useState(() => {
    return parseInt(localStorage.getItem("panel_width")) || 240;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [archivedMapList, setArchivedMapList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundLoadMode, setBackgroundLoadMode] = useState(false);
  const [loadStartedAt] = useState(() => Date.now());
  const [refreshStartedAt, setRefreshStartedAt] = useState(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const etaRemainingMsRef = useRef(null);

  useEffect(() => {
    if (!loading && !refreshing) return;
    const intervalId = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [loading, refreshing]);

  useEffect(() => {
    if (!loading && !refreshing) {
      etaRemainingMsRef.current = null;
    }
  }, [loading, refreshing]);

  const loadAndSelectMap = useCallback(async (mapId, onStatus, archived = false) => {
    const ok = archived
      ? await ensureArchivedMapLoaded(mapId, onStatus)
      : await ensureMapLoaded(mapId, onStatus);
    if (!ok) return null;
    const cacheKey = archived ? `archived/${mapId}` : mapId;
    const data = parseMap(cacheKey);
    return data;
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const progress = {
          tilesDone: 0,
          tilesTotal: 0,
          mapsDone: 0,
          mapsTotal: 0,
          mobsDone: 0,
          mobsTotal: mobmap.size,
          archivedDone: 0,
          archivedTotal: 0,
        };

        const updateLoadingStatus = () => {
          const done = progress.tilesDone + progress.mapsDone + progress.mobsDone + progress.archivedDone;
          const total = progress.tilesTotal + progress.mapsTotal + progress.mobsTotal + progress.archivedTotal;
          if (!cancelled) setStatus(`Loading assets... ${done}/${Math.max(total, 1)}`);
        };

        updateLoadingStatus();

        const tilesPromise = loadTiles((tileStatus) => {
          const ratioMatch = tileStatus.match(/Loading tiles\.\.\.\s*(\d+)\s*\/\s*(\d+)/);
          if (!ratioMatch) return;
          progress.tilesDone = Number(ratioMatch[1]) || 0;
          progress.tilesTotal = Number(ratioMatch[2]) || 0;
          updateLoadingStatus();
        });

        const mapsPromise = (async () => {
          const { meta, rawContent: rawMl, lastFetched: mlLf } = await loadMapList();
          if (cancelled) return [];
          setRawMapList(rawMl);
          setMapListLastFetched(mlLf);

          progress.mapsDone = 0;
          progress.mapsTotal = meta.length;
          updateLoadingStatus();

          const results = await Promise.allSettled(
            meta.map(async (m) => {
              const ok = await ensureMapLoaded(m.id);
              progress.mapsDone++;
              updateLoadingStatus();
              return { ...m, ok, disabled: !ok, fetched: true };
            })
          );
          if (cancelled) return [];

          const checkedMeta = results
            .map((r, i) => r.status === "fulfilled" ? r.value : { ...meta[i], ok: false, disabled: true, fetched: true })
            .filter((m) => !m.candidate || m.ok);
          setMapList(checkedMeta);
          return checkedMeta;
        })();

        const mobsPromise = (async () => {
          const mobEntries = [...mobmap.entries()];
          const results = await Promise.allSettled(
            mobEntries.map(async ([id]) => {
              const svg = await fetchText(`${MOB_SVG_BASE}/${id}.svg`, false, {
                ttlMs: ONE_YEAR_MS,
                cacheKey: `mob:${id}`,
              });
              const canvas = svgToCanvas(svg, 256, 256);
              return { id, canvas };
            })
          );

          const mSprites = new Map();
          for (const result of results) {
            progress.mobsDone++;
            updateLoadingStatus();
            if (result.status !== "fulfilled") continue;
            if (result.value.canvas) mSprites.set(result.value.id, result.value.canvas);
          }
          return mSprites;
        })();

        const archivedPromise = (async () => {
          const archivedMeta = await loadArchivedMapList();
          progress.archivedDone = 0;
          progress.archivedTotal = archivedMeta.length;
          updateLoadingStatus();

          const archivedResults = await Promise.allSettled(
            archivedMeta.map(async (m) => {
              const ok = await ensureArchivedMapLoaded(m.id);
              progress.archivedDone++;
              updateLoadingStatus();
              return { ...m, ok, disabled: !ok, fetched: true };
            })
          );

          return archivedResults
            .map((r, i) => r.status === "fulfilled" ? r.value : { ...archivedMeta[i], ok: false, disabled: true, fetched: true });
        })();

        const { tiles: tileSvgs, tileFileEntries, rawTileset: rawTs } = await tilesPromise;
        if (!cancelled) {
          setTileFiles(tileFileEntries);
          setRawTileset(rawTs);
        }

        const tileSprites = new Map();
        for (const [id, svg] of tileSvgs) {
          const s = SPECIAL_IDS.has(id) ? 2048 : 512;
          const canvas = svgToCanvas(svg, s, s);
          if (canvas) tileSprites.set(id, canvas);
        }
        if (!cancelled) setSprites(tileSprites);

        const checkedMeta = await mapsPromise;
        if (cancelled) return;

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

        const [mSprites, checkedArchived] = await Promise.all([mobsPromise, archivedPromise]);
        if (cancelled) return;
        setMobSpritesState(mSprites);
        setArchivedMapList(checkedArchived);

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
    if (file.type === "map" || file.type === "archived_map" || file.type === "readme") {
      localStorage.setItem("visited_file", JSON.stringify(file));
    }
  };

  const handleFileSelect = useCallback(async (file) => {
    if (file.type === "map" || file.type === "archived_map") {
      if (currentFile?.type === file.type && currentFile?.id === file.id) return;
      const archived = file.type === "archived_map";
      const data = await loadAndSelectMap(file.id, undefined, archived);
      if (!data) return;
      setMapData(data);
      setCurrentFile(file);
      saveVisited(file);
    } else {
      setCurrentFile(file);
      saveVisited(file);
    }
  }, [currentFile, loadAndSelectMap]);

  const handleRefreshAllMaps = useCallback(async () => {
    setRefreshing(true);
    setRefreshStartedAt(Date.now());
    setStatus("Refreshing maps...");
    let done = 0;
    const total = mapList.length;
    const results = await Promise.allSettled(
      mapList.map(async (m) => {
        const ok = await refreshMap(m.id);
        done++;
        setStatus(`Refreshing maps... ${done}/${total}`);
        return { ...m, ok, disabled: !ok, fetched: true };
      })
    );
    const updated = results
      .map((r, i) => r.status === "fulfilled" ? r.value : { ...mapList[i], ok: false, disabled: true, fetched: true })
      .filter((m) => !m.candidate || m.ok); // Hide failed auto-discovered candidates
    setMapList(updated);
    setRefreshing(false);
    setRefreshStartedAt(null);
  }, [mapList]);

  const handleRefreshAllTiles = useCallback(async () => {
    setRefreshing(true);
    setRefreshStartedAt(Date.now());
    setStatus("Refreshing tiles...");
    const { tiles: tileSvgs, tileFileEntries, rawTileset: rawTs } = await loadTiles((s) => setStatus(s), true);
    setTileFiles(tileFileEntries);
    setRawTileset(rawTs);
    const tileSprites = new Map();
    for (const [id, svg] of tileSvgs) {
      const s = SPECIAL_IDS.has(id) ? 2048 : 512;
      const canvas = svgToCanvas(svg, s, s);
      if (canvas) tileSprites.set(id, canvas);
    }
    setSprites(tileSprites);
    setRefreshing(false);
    setRefreshStartedAt(null);
  }, []);

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

  const mode = loading ? "loading" : "refreshing";
  const activeStartedAt = refreshing && refreshStartedAt ? refreshStartedAt : loadStartedAt;
  const elapsedMs = Math.max(0, timerNow - activeStartedAt);
  const progressRatio = parseProgressFraction(status);

  let etaText = `Elapsed ${formatDuration(elapsedMs)}`;
  if (progressRatio != null && progressRatio > 0.01 && progressRatio < 1) {
    const rawRemaining = (elapsedMs * (1 - progressRatio)) / progressRatio;
    const prevRemaining = etaRemainingMsRef.current;
    const nextRemaining = prevRemaining == null
      ? rawRemaining
      : Math.min(prevRemaining, rawRemaining);
    etaRemainingMsRef.current = Math.max(0, nextRemaining);
    etaText = `Approx ${formatDuration(etaRemainingMsRef.current)} remaining`;
  } else {
    etaRemainingMsRef.current = null;
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <FileBrowser
        mapList={mapList}
        archivedMapList={archivedMapList}
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
        {!loading && (currentFile?.type === "map" || currentFile?.type === "archived_map") && mapData && sprites && (
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
          <TilesetViewer
            tileFiles={tileFiles}
            rawTileset={rawTileset}
            onRefreshAllTiles={handleRefreshAllTiles}
          />
        )}
        {!loading && currentFile?.type === "maplist" && (
          <MapListViewer
            mapList={mapList}
            mapListLastFetched={mapListLastFetched}
            onFileSelect={handleFileSelect}
            onRefreshAllMaps={handleRefreshAllMaps}
          />
        )}
        {(refreshing || (loading && !backgroundLoadMode)) && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-panel">
              <div className="loading-spinner" aria-hidden="true" />
              <div className="loading-title">
                {loading ? "Loading map assets..." : "Refreshing content..."}
              </div>
              <div className="loading-status">{status}</div>
              <div className="loading-eta">{etaText}</div>
              {loading && (
                <>
                  <div className="loading-hint">
                    First load may take a moment. Cached data will be much faster next time.
                  </div>
                  <button
                    className="loading-link-btn"
                    type="button"
                    onClick={() => setBackgroundLoadMode(true)}
                  >
                    Load in background
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {loading && backgroundLoadMode && (
          <button
            type="button"
            className="background-loading-chip"
            onClick={() => setBackgroundLoadMode(false)}
            aria-label="Show loading progress"
          >
            Loading in background... {etaText} (view progress)
          </button>
        )}
      </div>
    </div>
  );
}
