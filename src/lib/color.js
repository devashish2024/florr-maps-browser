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

export const rarityFromDiff = (diff) => {
  if (!Number.isFinite(diff)) return "Unusual";

  if (diff < 0) return "Common";
  if (diff <= 5) return "Unusual";
  if (diff <= 17) return "Rare";
  if (diff <= 25) return "Epic";
  if (diff < 45) return "Legendary"; // 45 excluded
  if (diff < 65) return "Mythic";    // 65 excluded
  return "Ultra";
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
