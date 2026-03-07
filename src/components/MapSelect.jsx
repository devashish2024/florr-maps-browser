export default function MapSelect({ maps, currentMap, onMapChange }) {
  return (
    <select
      value={currentMap}
      onChange={(e) => onMapChange(e.target.value)}
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 10,
        padding: "6px 10px",
        fontSize: 14,
        fontFamily: "Game, Ubuntu, sans-serif",
        fontWeight: "bold",
        background: "#2a2a2a",
        color: "#fff",
        border: "2px solid #444",
        borderRadius: 6,
        cursor: "pointer",
        outline: "none",
      }}
    >
      {maps.map((m) => (
        <option key={m.id} value={m.id} disabled={m.disabled}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
