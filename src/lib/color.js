const RarityColor = {
  Common: "#7eef6d",
  Unusual: "#ffe65d",
  Rare: "#4d52e3",
  Epic: "#861fde",
  Legendary: "#de1f1f",
  Mythic: "#1fdbde",
  Ultra: "#ff2b75",

  // Unused (kept for future-proofing if needed)
  Super: "#2bffa3",
  Unique: "#555555",
  Eternal: "#ffffff",
};

export { RarityColor };


// 🔹 Single source of truth for rarity logic
const TIERS = [
  { max: 0, name: "Common" },     // d < 0
  { max: 5, name: "Unusual" },    // 0 ≤ d ≤ 5
  { max: 15, name: "Rare" },      // 5 < d ≤ 15
  { max: 30, name: "Epic" },      // 15 < d ≤ 30
  { max: 45, name: "Legendary" }, // 30 < d ≤ 45
  { max: 60, name: "Mythic" },    // 45 < d ≤ 60
  { max: Infinity, name: "Ultra" } // d > 60
];


// 🔹 Core function
const getRarity = (d) => {
  if (isNaN(d)) return "Common";

  for (const tier of TIERS) {
    if (d < tier.max) return tier.name;
  }

  return "Common"; // fallback (should never hit)
};


// 🔹 Public APIs

export const rarityFromDiff = (diff) => {
  return getRarity(diff);
};

export const colorFromDiff = (diff) => {
  const rarity = getRarity(diff);
  return RarityColor[rarity] || RarityColor.Common;
};