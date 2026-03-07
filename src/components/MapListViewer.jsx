import { useState, useEffect } from "react";
import { getMapLastFetched, refreshMap } from "../lib/maploader.js";

function timeAgo(isoString) {
  if (!isoString) return "unknown";
  const date = new Date(isoString);
  if (isNaN(date)) return "unknown";
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export default function MapListViewer({ mapList, onFileSelect, onRefreshAllMaps }) {
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Re-render every 30s to update relative times
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefreshAllMaps();
    setRefreshing(false);
  };

  const available = mapList.filter((m) => !m.disabled);
  const unavailable = mapList.filter((m) => m.disabled);

  return (
    <div style={{ height: "100%", overflow: "auto", color: "#ccc", fontFamily: "'Game', 'Ubuntu', sans-serif" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 48px" }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>maps.txt</h2>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 20 }}>
          {available.length} maps available{unavailable.length > 0 ? `, ${unavailable.length} unavailable` : ""}.
        </p>

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
          {refreshing ? "Refreshing maps…" : "Refresh all maps"}
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {available.map((m) => {
            const lf = getMapLastFetched(m.id);
            return (
              <div
                key={m.id}
                onClick={() => onFileSelect({ type: "map", id: m.id })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "#222",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2d2e")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#222")}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🗺️</span>
                  <span style={{ color: "#e8e8e8" }}>{m.name}</span>
                  <span style={{ color: "#555", fontSize: 12 }}>{m.id}.tmj</span>
                </span>
                <span style={{ color: "#666", fontSize: 12, flexShrink: 0, marginLeft: 12 }}>
                  {lf ? `fetched ${timeAgo(lf)}` : ""}
                </span>
              </div>
            );
          })}
          {unavailable.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "#1a1a1a",
                borderRadius: 6,
                fontSize: 14,
                opacity: 0.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span>
                <span>{m.name}</span>
                <span style={{ color: "#555", fontSize: 12 }}>{m.id}.tmj</span>
              </span>
              <span style={{ color: "#555", fontSize: 12 }}>unavailable</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
