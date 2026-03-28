import { useState, useEffect, useRef, useCallback } from "react";
import MapCanvas from "./components/MapCanvas.jsx";
import FileBrowser from "./components/FileBrowser.jsx";
import TileViewer from "./components/TileViewer.jsx";
import ReadmeViewer from "./components/ReadmeViewer.jsx";
import MapListViewer from "./components/MapListViewer.jsx";
import TilesetViewer from "./components/TilesetViewer.jsx";
import SettingsViewer from "./components/SettingsViewer.jsx";
import { loadTiles } from "./lib/tileset.js";
import { loadMapList, loadArchivedMapList } from "./lib/maplist.js";
import { ensureMapLoaded, ensureArchivedMapLoaded, refreshMap } from "./lib/maploader.js";
import { parseMap } from "./lib/tiled.js";
import { svgToCanvas, svgToCanvasImage } from "./lib/svgrender.js";
import { fetchText } from "./lib/proxy.js";
import { mobmap } from "./lib/mobs.js";
import "./App.css";

const SPECIAL_IDS = new Set([93, 115]);

const MOB_SVG_BASE = "https://florr.io/mobs";
const NAMED_MOB_SVG_SOURCES = new Map([
  ["dummy", "/dummy.svg"],
]);
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
        if (parsed?.type === "help") return parsed;
        if (parsed?.type === "settings") return parsed;
        if (parsed?.type === "tileset") return parsed;
        if (parsed?.type === "tile" && parsed.id != null) return parsed;
        if (parsed?.type === "maplist") return parsed;
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
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    return localStorage.getItem("desktop_sidebar_collapsed") === "true";
  });
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 769px)").matches;
  });
  const [archivedMapList, setArchivedMapList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundLoadMode, setBackgroundLoadMode] = useState(false);
  const [loadStartedAt] = useState(() => Date.now());
  const [refreshStartedAt, setRefreshStartedAt] = useState(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [cameraTarget, setCameraTarget] = useState(null);

  useEffect(() => {
    if (!loading && !refreshing) return;
    const intervalId = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [loading, refreshing]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 769px)");
    const handleChange = (event) => setIsDesktop(event.matches);
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

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
        // 1. Load tiles
        const { tiles: tileSvgs, tileFileEntries, rawTileset: rawTs } = await loadTiles(setStatus);
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

        // 2. Load map list
        setStatus("Loading map list...");
        const { meta, rawContent: rawMl, lastFetched: mlLf } = await loadMapList(setStatus);
        if (cancelled) return;
        if (!cancelled) {
          setRawMapList(rawMl);
          setMapListLastFetched(mlLf);
        }

        // 3. Preload all maps in parallel
        let mapsDone = 0;
        const mapsTotal = meta.length;
        setStatus(`Loading all maps... 0/${mapsTotal}`);
        const mapResults = await Promise.allSettled(
          meta.map(async (m) => {
            const ok = await ensureMapLoaded(m.id, (msg) => {
              if (!cancelled) setStatus(`Loading map ${m.id}: ${msg}`);
            });
            mapsDone++;
            if (!cancelled) setStatus(`Loading all maps... ${mapsDone}/${mapsTotal}`);
            return { ...m, ok, disabled: !ok, fetched: true };
          })
        );
        if (cancelled) return;
        const checkedMeta = mapResults
          .map((r, i) => r.status === "fulfilled" ? r.value : { ...meta[i], ok: false, disabled: true, fetched: true })
          .filter((m) => !m.candidate || m.ok); // Hide failed auto-discovered candidates
        setMapList(checkedMeta);

        // 4. Determine start map
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
        let mobsDone = 0;
        const mobsTotal = mobmap.size;
        setStatus(`Loading mob sprites... 0/${mobsTotal}`);
        const mSprites = new Map();
        for (const [id] of mobmap) {
          try {
            const svg = await fetchText(`${MOB_SVG_BASE}/${id}.svg`, false, {
              ttlMs: ONE_YEAR_MS,
              cacheKey: `mob:${id}`,
            });
            const canvas = svgToCanvas(svg, 256, 256);
            if (canvas) mSprites.set(id, canvas);
          } catch {
            // skip unavailable mob sprites
          }
          mobsDone++;
          if (!cancelled) setStatus(`Loading mob sprites... ${mobsDone}/${mobsTotal}`);
        }

        for (const [name, url] of NAMED_MOB_SVG_SOURCES) {
          try {
            const svg = await fetchText(url, false, {
              ttlMs: ONE_YEAR_MS,
              cacheKey: `mob-name:${name}`,
            });
            const canvas = await svgToCanvasImage(svg, 256, 256) || svgToCanvas(svg, 256, 256);
            if (canvas) mSprites.set(name, canvas);
          } catch {
            // skip unavailable named mob sprites
          }
        }
        if (!cancelled) setMobSpritesState(mSprites);

        // 9. Load archived map list
        setStatus("Loading archived maps...");
        const archivedMeta = await loadArchivedMapList(setStatus);
        let archivedDone = 0;
        const archivedTotal = archivedMeta.length;
        setStatus(`Loading archived maps... 0/${archivedTotal}`);
        const archivedResults = await Promise.allSettled(
          archivedMeta.map(async (m) => {
            const ok = await ensureArchivedMapLoaded(m.id);
            archivedDone++;
            if (!cancelled) setStatus(`Loading archived maps... ${archivedDone}/${archivedTotal}`);
            return { ...m, ok, disabled: !ok, fetched: true };
          })
        );
        if (cancelled) return;
        const checkedArchived = archivedResults
          .map((r, i) => r.status === "fulfilled" ? r.value : { ...archivedMeta[i], ok: false, disabled: true, fetched: true });
        setArchivedMapList(checkedArchived);

        // If last visited was an archived map, load its data now
        if (visitedFile?.type === "archived_map" && visitedFile.id) {
          const archivedEntry = checkedArchived.find((m) => m.id === visitedFile.id && m.ok);
          if (archivedEntry) {
            const archivedData = await loadAndSelectMap(visitedFile.id, setStatus, true);
            if (!cancelled && archivedData) setMapData(archivedData);
          }
        }

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
    try {
      localStorage.setItem("visited_file", JSON.stringify(file));
    } catch { /* ignore */ }
  };

  const handleFileSelect = useCallback(async (file) => {
    // Handle both object format (from warp navigation) and regular file format
    if (file.mapId) {
      // Called from warp navigation: { mapId, cameraTarget }
      const mapId = file.mapId;
      const data = await loadAndSelectMap(mapId);
      if (!data) return;
      setMapData(data);
      setCurrentFile({ type: "map", id: mapId });
      setCameraTarget(file.cameraTarget || null);
      saveVisited({ type: "map", id: mapId });
    } else if (file.type === "map" || file.type === "archived_map") {
      if (currentFile?.type === file.type && currentFile?.id === file.id) return;
      const archived = file.type === "archived_map";
      const data = await loadAndSelectMap(file.id, undefined, archived);
      if (!data) return;
      setMapData(data);
      setCurrentFile(file);
      setCameraTarget(null);
      saveVisited(file);
    } else {
      setCameraTarget(null);
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

  const toggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("desktop_sidebar_collapsed", next.toString());
      return next;
    });
  }, []);

  const mode = loading ? "loading" : "refreshing";
  const activeStartedAt = refreshing && refreshStartedAt ? refreshStartedAt : loadStartedAt;
  const elapsedMs = Math.max(0, timerNow - activeStartedAt);
  const progressRatio = parseProgressFraction(status);
  const etaText =
    progressRatio != null && progressRatio > 0.01 && progressRatio < 1
      ? `Approx ${formatDuration((elapsedMs * (1 - progressRatio)) / progressRatio)} remaining`
      : `Elapsed ${formatDuration(elapsedMs)}`;

  const showDesktopSidebar = isDesktop && !desktopSidebarCollapsed;

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      {isDesktop ? (
        <div
          className={`desktop-sidebar-shell ${showDesktopSidebar ? "desktop-sidebar-shell-open" : "desktop-sidebar-shell-collapsed"}`}
          style={{ width: showDesktopSidebar ? panelWidth + 4 : 0 }}
        >
          <div className="desktop-sidebar-content">
            <FileBrowser
              mapList={mapList}
              archivedMapList={archivedMapList}
              tileFiles={tileFiles}
              currentFile={loading && currentFile?.type !== "help" ? { type: "readme" } : currentFile}
              onFileSelect={handleFileSelect}
              width="100%"
              isMobileOpen={false}
              onMobileClose={() => setSidebarOpen(false)}
              loading={loading}
            />
          </div>
          <div
            className="resize-handle"
            onMouseDown={showDesktopSidebar ? handleResizeStart : undefined}
            style={{
              width: 4,
              cursor: showDesktopSidebar ? "col-resize" : "default",
              background: "#2d2d2d",
              flexShrink: 0,
              zIndex: 5,
            }}
            onMouseEnter={(e) => {
              if (showDesktopSidebar) e.currentTarget.style.background = "#007acc";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#2d2d2d")}
          />
        </div>
      ) : (
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
      )}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {isDesktop && (
          <button
            className="desktop-sidebar-toggle"
            type="button"
            onClick={toggleDesktopSidebar}
            aria-label={showDesktopSidebar ? "Collapse sidebar" : "Expand sidebar"}
            title={showDesktopSidebar ? "Collapse" : "Expand"}
          >
            <span aria-hidden="true">{showDesktopSidebar ? "❮" : "❯"}</span>
          </button>
        )}
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

        {(loading && currentFile?.type !== "help" && currentFile?.type !== "settings" || !loading && currentFile?.type === "readme") && <ReadmeViewer src="/README.md" />}
        {(currentFile?.type === "help") && <ReadmeViewer src="/HELP.md" />}
        {!loading && (currentFile?.type === "map" || currentFile?.type === "archived_map") && mapData && sprites && (
          <MapCanvas
            mapData={mapData}
            sprites={sprites}
            mobSprites={mobSpritesState}
            mapKey={currentFile?.type === "archived_map" ? `archived/${currentFile?.id}` : currentFile?.id}
            onMapChange={handleFileSelect}
            cameraTarget={cameraTarget}
            onCameraTargetApplied={() => setCameraTarget(null)}
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
        {currentFile?.type === "settings" && (
          <SettingsViewer />
        )}
        {!loading && currentFile?.type === "maplist" && (
          <MapListViewer
            mapList={mapList}
            archivedMapList={archivedMapList}
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
