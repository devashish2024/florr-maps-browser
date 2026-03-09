import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import JSZip from "jszip";
import { withFlorProxy } from "../lib/proxy";

const FILE_URLS = {
  readme: null,
  help: null,
  tileset: "https://florr.io/static/tiles/tileset.tsj",
  maplist: "https://florr.io/static/i18n/en_US/maps.txt",
  map: (id) => `https://florr.io/static/maps/${id}.tmj`,
  archived_map: (id) => `/archived_maps/${id}.tmj`,
  tile: (name) => `https://florr.io/static/tiles/${name}`,
};

function getFileUrl(file) {
  if (!file) return null;
  if (file.type === "map") return FILE_URLS.map(file.id);
  if (file.type === "archived_map") return FILE_URLS.archived_map(file.id);
  if (file.type === "tile") return FILE_URLS.tile(file.tileName);
  return FILE_URLS[file.type] || null;
}

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    addEventListener("mousedown", handle);
    return () => removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "#252526",
        border: "1px solid #454545",
        borderRadius: 4,
        padding: "4px 0",
        zIndex: 1000,
        minWidth: 160,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        fontFamily: "'Game', 'Ubuntu', sans-serif",
        fontSize: 13,
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          onClick={() => { item.action(); onClose(); }}
          style={{
            padding: "5px 16px",
            cursor: "pointer",
            color: item.disabled ? "#555" : "#ccc",
            pointerEvents: item.disabled ? "none" : "auto",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

function FolderItem({ name, expanded, onToggle, onContextMenu }) {
  return (
    <div
      onClick={onToggle}
      onContextMenu={onContextMenu}
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

function FileItem({ name, label, icon = "📄", indent = 0, active, disabled, onClick, onContextMenu }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onContextMenu={disabled ? undefined : onContextMenu}
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

export default function FileBrowser({ mapList, archivedMapList, tileFiles, currentFile, onFileSelect, width, isMobileOpen, onMobileClose, loading }) {
  const [mapsExpanded, setMapsExpanded] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [tilesExpanded, setTilesExpanded] = useState(false);
  const [mapsArchivedExpanded, setMapsArchivedExpanded] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);

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

  const downloadFolder = useCallback(async (folderName, files) => {
    const zip = new JSZip();
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const url = withFlorProxy(f.url);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${f.name}`);
        const data = await resp.arrayBuffer();
        return { name: f.name, data };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") zip.file(r.value.name, r.value.data);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${folderName}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const openFolderContextMenu = useCallback((e, folderName, files) => {
    e.preventDefault();
    const items = [{
      label: "Download folder",
      action: () => downloadFolder(folderName, files),
    }];
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  }, [downloadFolder]);

  const openContextMenu = useCallback((e, file) => {
    e.preventDefault();
    const url = getFileUrl(file);
    const items = [];
    items.push({
      label: "Copy URL",
      disabled: !url,
      action: () => url && navigator.clipboard.writeText(url),
    });
    items.push({
      label: "Open URL",
      disabled: !url,
      action: () => url && window.open(url, "_blank", "noopener"),
    });
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

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
            onContextMenu={(e) => openContextMenu(e, { type: "readme" })}
          />
          <FileItem
            icon="❓"
            name="HELP.md"
            active={currentFile?.type === "help"}
            onClick={() => handleSelect({ type: "help" })}
            onContextMenu={(e) => openContextMenu(e, { type: "help" })}
          />
          {!loading && (
            <>
              <FileItem
                icon="📋"
                name="tileset.tsj"
                active={currentFile?.type === "tileset"}
                onClick={() => handleSelect({ type: "tileset" })}
                onContextMenu={(e) => openContextMenu(e, { type: "tileset" })}
              />
              <FileItem
                icon="📋"
                name="maps.txt"
                active={currentFile?.type === "maplist"}
                onClick={() => handleSelect({ type: "maplist" })}
                onContextMenu={(e) => openContextMenu(e, { type: "maplist" })}
              />
            </>
          )}

          {/* maps/ folder */}
          {!loading && (
            <>
              <FolderItem
                name="maps"
                expanded={mapsExpanded}
                onToggle={() => setMapsExpanded(!mapsExpanded)}
                onContextMenu={(e) => openFolderContextMenu(e, "maps", sortedMaps.filter(m => !m.disabled).map(m => ({ name: `${m.id}.tmj`, url: `https://florr.io/static/maps/${m.id}.tmj` })))}
              />
              {/* maps/archived/ folder - nested under maps */}
              {mapsExpanded && archivedMapList.length > 0 && (
                <>
                  <FolderItem
                    name="archived"
                    expanded={mapsArchivedExpanded}
                    onToggle={() => setMapsArchivedExpanded(!mapsArchivedExpanded)}
                    onContextMenu={(e) => openFolderContextMenu(e, "archived", archivedMapList.filter(m => !m.disabled).map(m => ({ name: `${m.id}.tmj`, url: `${window.location.origin}/archived_maps/${m.id}.tmj` })))}
                    style={{ marginLeft: 18 }}
                  />
                  {mapsArchivedExpanded &&
                    archivedMapList.map((m) => (
                      <FileItem
                        key={m.id}
                        icon={m.disabled ? "⚠️" : "🗺️"}
                        name={`${m.id}.tmj`}
                        label={m.disabled ? `${m.name} (error)` : m.name}
                        indent={2}
                        active={currentFile?.type === "archived_map" && currentFile?.id === m.id}
                        disabled={m.disabled}
                        onClick={() => handleSelect({ type: "archived_map", id: m.id })}
                        onContextMenu={(e) => openContextMenu(e, { type: "archived_map", id: m.id })}
                      />
                    ))}
                </>
              )}
              {/* Render the rest of the maps after archived/ */}
              {mapsExpanded && sortedMaps.map((m) => (
                <FileItem
                  key={m.id}
                  icon={m.disabled ? "⚠️" : "🗺️"}
                  name={`${m.id}.tmj`}
                  label={m.disabled ? `${m.name} (error)` : m.name}
                  indent={1}
                  active={currentFile?.type === "map" && currentFile?.id === m.id}
                  disabled={m.disabled}
                  onClick={() => handleSelect({ type: "map", id: m.id })}
                  onContextMenu={(e) => openContextMenu(e, { type: "map", id: m.id })}
                />
              ))}
            </>
          )}

          {/* tiles/ folder */}
          {!loading && (
            <>
              <FolderItem
                name="tiles"
                expanded={tilesExpanded}
                onToggle={() => setTilesExpanded(!tilesExpanded)}
                onContextMenu={(e) => openFolderContextMenu(e, "tiles", tileFiles.map(t => ({ name: t.name, url: `https://florr.io/static/tiles/${t.name}` })))}
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
                    onContextMenu={(e) => openContextMenu(e, { type: "tile", tileName: t.name })}
                  />
                ))}
            </>
          )}

          {loading && (
            <div style={{ padding: "16px 12px", display: "flex", alignItems: "center", gap: 8, color: "#888", fontSize: 13 }}>
              <span className="skeleton-spinner" />
              <span>Loading…</span>
            </div>
          )}
        </div>
        <a
          href="https://mobs.ashish.top"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid #333",
            color: "#FDDE54",
            fontSize: 13,
            textDecoration: "none",
            fontFamily: "'Game', 'Ubuntu', sans-serif",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2d2e")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <img src="https://mobs.ashish.top/logo.png" alt="" style={{ width: 16, height: 16 }} />
          <span>FlorrMobNotify</span>
        </a>
        <a
          href="https://mobs.ashish.top/discord"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid #333",
            color: "#5865F2",
            fontSize: 13,
            textDecoration: "none",
            fontFamily: "'Game', 'Ubuntu', sans-serif",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2d2e")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <img src="/discord_icon.svg" alt="" style={{ width: 16, height: 16 }} />
          <span>Discord</span>
        </a>
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}