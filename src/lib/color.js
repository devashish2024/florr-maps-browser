export const RarityColor = {
  Common: "#7eef6d",
  Unusual: "#ffe65d",
  Rare: "#4d52e3",
  Epic: "#861fde",
  Legendary: "#de1f1f",
  Mythic: "#1fdbde",
  Ultra: "#ff2b75",
  Super: "#2bffa3",
  Eternal: "#ffffff",
  Unique: "#555555",
};

export const RARITY_ID_TO_NAME = {
  0: "Common",
  1: "Unusual",
  2: "Rare",
  3: "Epic",
  4: "Legendary",
  5: "Mythic",
  6: "Ultra",
  7: "Super",
  8: "Eternal",
  9: "Unique",
};

const TIERS = [
  { max: 5, name: "Unusual" },
  { max: 17, name: "Rare" },
  { max: 25, name: "Epic" },
  { max: 40, name: "Legendary" },
  { max: 60, name: "Mythic" },
  { max: Infinity, name: "Ultra" },
];

export const rarityFromDiff = (diff) => {
  if (!Number.isFinite(diff)) return "Unusual";

  if (diff < 0) return "Common";

  for (const tier of TIERS) {
    if (diff <= tier.max) return tier.name;
  }

  return "Unusual";
};

export const rarityFromId = (id) => {
  if (!Number.isInteger(id)) return null;
  return RARITY_ID_TO_NAME[id] || null;
};

export const colorFromRarity = (rarity) => {
  return RarityColor[rarity] || RarityColor.Unusual;
};

export const colorFromDiff = (diff) => {
  return colorFromRarity(rarityFromDiff(diff));
};

export const effectiveRarityFromSpawner = (difficulty, forceRarity) => {
  const baseRarity = rarityFromDiff(difficulty);
  const forcedRarity = rarityFromId(forceRarity);
  const effectiveRarity = forcedRarity || baseRarity;

  return {
    baseRarity,
    forcedRarity,
    effectiveRarity,
    effectiveColor: colorFromRarity(effectiveRarity),
  };
};
