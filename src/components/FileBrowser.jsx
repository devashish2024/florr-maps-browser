import { useState, useMemo } from "react";

function FolderItem({ name, expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "3px 8px",
        cursor: "pointer",
        color: "#e8e8e8",
        fontSize: 13,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2d2e")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ marginRight: 4, fontSize: 10, width: 10, textAlign: "center" }}>
        {expanded ? "▼" : "▶"}
      </span>
      <span style={{ marginRight: 6 }}>{expanded ? "📂" : "📁"}</span>
      <span style={{ fontWeight: "bold" }}>{name}</span>
    </div>
  );
}

function FileItem({ name, label, icon = "📄", indent = 0, active, disabled, onClick }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "3px 8px",
        paddingLeft: 8 + indent * 18,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#555" : active ? "#fff" : "#ccc",
        background: active ? "#094771" : "transparent",
        fontSize: 13,
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) e.currentTarget.style.background = "#2a2d2e";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
      title={label || name}
    >
      <span style={{ marginRight: 6, flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label || name}</span>
    </div>
  );
}

export default function FileBrowser({ mapList, tileFiles, currentFile, onFileSelect, width, isMobileOpen, onMobileClose }) {
  const [mapsExpanded, setMapsExpanded] = useState(true);
  const [tilesExpanded, setTilesExpanded] = useState(false);

  // Sort maps: available first, errored/disabled at bottom
  const sortedMaps = useMemo(() => {
    const ok = mapList.filter((m) => !m.disabled);
    const err = mapList.filter((m) => m.disabled);
    return [...ok, ...err];
  }, [mapList]);

  const handleSelect = (file) => {
    onFileSelect(file);
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={onMobileClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 19,
          }}
        />
      )}
      <div
        className={`file-browser ${isMobileOpen ? "file-browser-open" : ""}`}
        style={{
          width,
          minWidth: 120,
          height: "100%",
          background: "#1e1e1e",
          borderRight: "1px solid #333",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          userSelect: "none",
          fontFamily: "'Game', 'Ubuntu', sans-serif",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            fontWeight: "bold",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "#888",
            borderBottom: "1px solid #333",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Explorer</span>
          <button
            className="sidebar-close-btn"
            onClick={onMobileClose}
            style={{
              display: "none",
              background: "none",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "4px 0",
          }}
        >
          {/* Root files */}
          <FileItem
            icon="📖"
            name="README.md"
            active={currentFile?.type === "readme"}
            onClick={() => handleSelect({ type: "readme" })}
          />
          <FileItem
            icon="📋"
            name="tileset.tsj"
            active={currentFile?.type === "tileset"}
            onClick={() => handleSelect({ type: "tileset" })}
          />
          <FileItem
            icon="📋"
            name="maps.txt"
            active={currentFile?.type === "maplist"}
            onClick={() => handleSelect({ type: "maplist" })}
          />

          {/* maps/ folder */}
          <FolderItem
            name="maps"
            expanded={mapsExpanded}
            onToggle={() => setMapsExpanded(!mapsExpanded)}
          />
          {mapsExpanded &&
            sortedMaps.map((m) => (
              <FileItem
                key={m.id}
                icon={m.disabled ? "⚠️" : "🗺️"}
                name={`${m.id}.tmj`}
                label={m.disabled ? `${m.name} (error)` : m.name}
                indent={1}
                active={currentFile?.type === "map" && currentFile?.id === m.id}
                disabled={m.disabled}
                onClick={() => handleSelect({ type: "map", id: m.id })}
              />
            ))}

          {/* tiles/ folder */}
          <FolderItem
            name="tiles"
            expanded={tilesExpanded}
            onToggle={() => setTilesExpanded(!tilesExpanded)}
          />
          {tilesExpanded &&
            tileFiles.map((t) => (
              <FileItem
                key={t.id}
                icon="🖼️"
                name={t.name}
                indent={1}
                active={currentFile?.type === "tile" && currentFile?.id === t.id}
                onClick={() => handleSelect({ type: "tile", id: t.id })}
              />
            ))}
        </div>
      </div>
    </>
  );
}