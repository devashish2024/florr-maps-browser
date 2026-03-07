import { useState } from "react";
import { getTilesetLastFetched } from "../lib/tileset.js";

export default function TilesetViewer({ tileFiles, rawTileset, onRefreshAllTiles }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefreshAllTiles();
    setRefreshing(false);
  };

  const lf = getTilesetLastFetched();

  return (
    <div style={{ color: "#888", padding: 40, fontSize: 18, fontFamily: "Game, Ubuntu, sans-serif", height: "100%", overflow: "auto" }}>
      <h2 style={{ color: "#ccc", marginBottom: 16 }}>tileset.tsj</h2>
      <p>Tileset definition file containing {tileFiles.length} tile references.</p>
      {lf && (
        <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Last fetched: {new Date(lf).toLocaleString()}
        </p>
      )}
      <p style={{ marginTop: 8, fontSize: 14, marginBottom: 20 }}>Open individual tiles from the tiles/ folder.</p>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        style={{
          background: refreshing ? "#333" : "#094771",
          color: refreshing ? "#666" : "#fff",
          border: "1px solid #555",
          borderRadius: 6,
          padding: "8px 16px",
          fontSize: 13,
          fontFamily: "'Game', 'Ubuntu', sans-serif",
          cursor: refreshing ? "default" : "pointer",
          marginBottom: 24,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {refreshing && <span className="skeleton-spinner" />}
        {refreshing ? "Refreshing tiles…" : "Refresh all tiles"}
      </button>

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
        maxHeight: "calc(100vh - 320px)",
        overflow: "auto",
      }}>{rawTileset}</pre>
    </div>
  );
}
