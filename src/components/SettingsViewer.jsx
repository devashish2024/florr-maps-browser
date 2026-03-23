import { useSettings, setSetting, resetSettings } from "../lib/settings.js";
import { useState, useEffect, useRef, useCallback } from "react";

const isMobile = () =>
    typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

const KEY_LABELS = {
    Shift: "Shift",
    Control: "Ctrl",
    Alt: "Alt",
    Meta: "Meta / ⌘",
    " ": "Space",
};

function Toggle({ label, description, checked, onChange }) {
    return (
        <label
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 0",
                cursor: "pointer",
                gap: 12,
            }}
        >
            <div style={{ flex: 1 }}>
                <div style={{ color: "#e0e0e0", fontSize: 13 }}>{label}</div>
                {description && (
                    <div style={{ color: "#777", fontSize: 11, marginTop: 2 }}>{description}</div>
                )}
            </div>
            <div
                style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    background: checked ? "#007acc" : "#555",
                    position: "relative",
                    transition: "background 0.2s",
                    flexShrink: 0,
                }}
                onClick={(e) => {
                    e.preventDefault();
                    onChange(!checked);
                }}
            >
                <div
                    style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: 2,
                        left: checked ? 18 : 2,
                        transition: "left 0.2s",
                    }}
                />
            </div>
        </label>
    );
}

function KeyPicker({ currentKey, onChange }) {
    const [listening, setListening] = useState(false);
    const ref = useRef(null);

    const handleKeyDown = useCallback(
        (e) => {
            e.preventDefault();
            setListening(false);
            onChange(e.key);
        },
        [onChange],
    );

    useEffect(() => {
        if (!listening) return;
        addEventListener("keydown", handleKeyDown);
        return () => removeEventListener("keydown", handleKeyDown);
    }, [listening, handleKeyDown]);

    // Close listener on outside click
    useEffect(() => {
        if (!listening) return;
        const handle = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setListening(false);
        };
        addEventListener("mousedown", handle);
        return () => removeEventListener("mousedown", handle);
    }, [listening]);

    const displayKey = currentKey ? KEY_LABELS[currentKey] || currentKey : "None";

    return (
        <div ref={ref} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
                onClick={() => setListening(!listening)}
                style={{
                    background: listening ? "#007acc" : "#333",
                    color: "#e0e0e0",
                    border: "1px solid #555",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "'GameMono', monospace",
                    minWidth: 60,
                    textAlign: "center",
                }}
            >
                {listening ? "Press a key…" : displayKey}
            </button>
            {currentKey && (
                <button
                    onClick={() => onChange(null)}
                    title="Unset key"
                    style={{
                        background: "none",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: "2px 4px",
                    }}
                >
                    ✕
                </button>
            )}
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <div
                style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "#888",
                    marginBottom: 8,
                    borderBottom: "1px solid #333",
                    paddingBottom: 4,
                }}
            >
                {title}
            </div>
            {children}
        </div>
    );
}

export default function SettingsViewer() {
    const settings = useSettings();
    const mobile = isMobile();

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                overflow: "auto",
                background: "#1e1e1e",
                color: "#ccc",
                fontFamily: "'Game', 'Ubuntu', sans-serif",
            }}
        >
            <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 24,
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, color: "#e8e8e8" }}>Settings</h2>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>SETTINGS.cfg</div>
                    </div>
                    <button
                        onClick={resetSettings}
                        style={{
                            background: "#333",
                            color: "#ccc",
                            border: "1px solid #555",
                            borderRadius: 4,
                            padding: "5px 12px",
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "'Game', 'Ubuntu', sans-serif",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#444")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#333")}
                    >
                        Reset to defaults
                    </button>
                </div>

                <Section title="Rendering">
                    <Toggle
                        label="Warp Portals"
                        description="Show [warp] and [warp_destination] circles on the map"
                        checked={settings.showWarps}
                        onChange={(v) => setSetting("showWarps", v)}
                    />
                    <Toggle
                        label="Zone Borders"
                        description="Show [spawn_mobs] zone outlines and [spawn_drops] markers"
                        checked={settings.showZoneBorders}
                        onChange={(v) => setSetting("showZoneBorders", v)}
                    />
                    <Toggle
                        label="Checkpoints"
                        description="Show [checkpoint] regions on the map"
                        checked={settings.showCheckpoints}
                        onChange={(v) => setSetting("showCheckpoints", v)}
                    />
                    <Toggle
                        label="Shortcuts"
                        description="Show [shortcut] paths on the map"
                        checked={settings.showShortcuts}
                        onChange={(v) => setSetting("showShortcuts", v)}
                    />
                    <Toggle
                        label="Tooltips"
                        description="Show object info popups on hover"
                        checked={settings.showTooltips}
                        onChange={(v) => setSetting("showTooltips", v)}
                    />
                </Section>

                <Section title="Tooltip">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            gap: 12,
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            <div style={{ color: "#e0e0e0", fontSize: 13 }}>Hide Tooltip Key</div>
                            <div style={{ color: "#777", fontSize: 11, marginTop: 2 }}>
                                Hold this key to temporarily hide tooltips
                                {mobile && (
                                    <span style={{ color: "#f0a020" }}> (not available on touch devices)</span>
                                )}
                            </div>
                        </div>
                        {!mobile && (
                            <KeyPicker
                                currentKey={settings.hideTooltipKey}
                                onChange={(k) => setSetting("hideTooltipKey", k)}
                            />
                        )}
                        {mobile && (
                            <span style={{ color: "#666", fontSize: 12, fontStyle: "italic" }}>N/A</span>
                        )}
                    </div>
                </Section>

                <Section title="Performance / Compatibility">
                    <Toggle
                        label="Half Canvas Resolution"
                        description="Render at 50% resolution (shows blurry/stretched) — significant FPS boost on weak GPUs"
                        checked={settings.halfCanvasResolution}
                        onChange={(v) => setSetting("halfCanvasResolution", v)}
                    />
                    <Toggle
                        label="Skip Overlay Rendering"
                        description="Don't render zone borders, spawn_drops, checkpoints, warps, shortcuts — huge FPS gain if many objects"
                        checked={settings.disableOverlayRendering}
                        onChange={(v) => setSetting("disableOverlayRendering", v)}
                    />
                    <Toggle
                        label="Disable Tooltips"
                        description="Don't render tooltips at all (faster than the Tooltips toggle above)"
                        checked={settings.disableTooltips}
                        onChange={(v) => setSetting("disableTooltips", v)}
                    />
                    <Toggle
                        label="Disable Mob Icons in Tooltips"
                        description="Skip rendering mob sprites — reduces memory & draw calls"
                        checked={settings.disableMobIcons}
                        onChange={(v) => setSetting("disableMobIcons", v)}
                    />
                    <Toggle
                        label="Disable Smooth Camera"
                        description="Instant camera movement instead of lerping"
                        checked={settings.disableSmoothCamera}
                        onChange={(v) => setSetting("disableSmoothCamera", v)}
                    />
                </Section>

                <div style={{ color: "#555", fontSize: 11, textAlign: "center", marginTop: 24 }}>
                    Settings are saved automatically in your browser.
                </div>
            </div>
        </div>
    );
}
