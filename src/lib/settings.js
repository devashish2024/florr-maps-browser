import { useSyncExternalStore } from "react";

const STORAGE_KEY = "florr_settings";

const DEFAULT_SETTINGS = {
    // Rendering toggles
    showWarps: true,
    showTooltips: true,
    showZoneBorders: true,
    showCheckpoints: true,
    showShortcuts: true,

    // Tooltip hide key (null = disabled)
    hideTooltipKey: "Shift",

    // Performance / compatibility
    halfCanvasResolution: false, // Render at 50% resolution (stretched to fit)
    disableOverlayRendering: false, // Skip spawners, spawn_drops, checkpoints, warps, shortcuts
    disableTooltips: false, // Faster than showTooltips toggle (also disables hide-key)
    disableMobIcons: false, // Don't render mob sprites in tooltips
    disableSmoothCamera: false, // Instant camera movement
};

let _settings = { ...DEFAULT_SETTINGS };
const _listeners = new Set();

// Load from localStorage on init
try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        const saved = JSON.parse(raw);
        _settings = { ...DEFAULT_SETTINGS, ...saved };
    }
} catch { /* ignore */ }

function notify() {
    for (const fn of _listeners) fn();
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    } catch { /* ignore */ }
}

/** Direct read for render loops (no React overhead) */
export function getSettings() {
    return _settings;
}

/** Update one or more settings */
export function setSetting(key, value) {
    if (_settings[key] === value) return;
    _settings = { ..._settings, [key]: value };
    save();
    notify();
}

/** Reset all settings to defaults */
export function resetSettings() {
    _settings = { ...DEFAULT_SETTINGS };
    save();
    notify();
}

/** React hook – re-renders component when any setting changes */
export function useSettings() {
    return useSyncExternalStore(
        (cb) => { _listeners.add(cb); return () => _listeners.delete(cb); },
        () => _settings,
    );
}
