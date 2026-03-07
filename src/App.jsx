import { useState, useEffect, useRef, useCallback } from "react";
import MapCanvas from "./components/MapCanvas.jsx";
import MapSelect from "./components/MapSelect.jsx";
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
  const [currentMap, setCurrentMap] = useState(() => {
    return localStorage.getItem("visited_map") || "garden";
  });

  const [sprites, setSprites] = useState(null);
  const [mobSpritesState, setMobSpritesState] = useState(null);

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
        const tileSvgs = await loadTiles(setStatus);

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
        const meta = await loadMapList(setStatus);
        if (cancelled) return;

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

        setCurrentMap(startMap);
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

  const handleMapChange = useCallback(async (mapId) => {
    if (mapId === currentMap) return;
    const data = await loadAndSelectMap(mapId);
    if (!data) return;
    setCurrentMap(mapId);
    setMapData(data);
  }, [currentMap, loadAndSelectMap]);

  return (
    <>
      {mapData && sprites && (
        <MapCanvas
          mapData={mapData}
          sprites={sprites}
          mobSprites={mobSpritesState}
        />
      )}
      {!loading && (
        <MapSelect
          maps={mapList}
          currentMap={currentMap}
          onMapChange={handleMapChange}
        />
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
    </>
  );
}
