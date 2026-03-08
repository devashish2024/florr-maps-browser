const RarityColor = {
  Common: "#7eef6d",
  Unusual: "#ffe65d",
  Rare: "#4d52e3",
  Epic: "#861fde",
  Legendary: "#de1f1f",
  Mythic: "#1fdbde",
  Ultra: "#ff2b75",
  Super: "#2bffa3",
  Unique: "#555555",
};

export { RarityColor };

export const colorFromDiff = (diff) => {
  if (isNaN(diff)) return RarityColor.Common;
  if (diff <= 0) return RarityColor.Common;
  if (diff > 0 && diff <= 10) return RarityColor.Unusual;
  if (diff > 10 && diff <= 20) return RarityColor.Rare;
  if (diff > 20 && diff <= 30) return RarityColor.Epic;
  if (diff > 30 && diff <= 45) return RarityColor.Legendary;
  if (diff > 45 && diff <= 55) return RarityColor.Mythic;
  if (diff > 55) return RarityColor.Ultra;
  return RarityColor.Unique;
};

export const rarityFromDiff = (diff) => {
  if (isNaN(diff)) return "Common";
  if (diff <= 0) return "Common";
  if (diff > 0 && diff <= 10) return "Unusual";
  if (diff > 10 && diff <= 20) return "Rare";
  if (diff > 20 && diff <= 30) return "Epic";
  if (diff > 30 && diff <= 45) return "Legendary";
  if (diff > 45 && diff <= 55) return "Mythic";
  if (diff > 55) return "Ultra";
  return "Unique";
};
