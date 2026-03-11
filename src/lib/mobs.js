export const mobmap = new Map([
  [1, "rock"], [2, "cactus"], [3, "ladybug"], [4, "bee"],
  [5, "ant_baby"], [6, "ant_worker"], [7, "ant_soldier"], [8, "ant_queen"],
  [9, "ant_hole"], [10, "beetle"], [11, "hornet"], [12, "centipede"],
  [14, "centipede_evil"], [16, "centipede_desert"], [18, "square"],
  [19, "ladybug_dark"], [20, "ladybug_shiny"], [21, "spider"],
  [22, "scorpion"], [23, "fire_ant_soldier"], [24, "fire_ant_burrow"],
  [25, "sandstorm"], [26, "bubble"], [27, "bumble_bee"], [28, "shell"],
  [29, "starfish"], [30, "crab"], [31, "jellyfish"], [32, "digger"],
  [33, "sponge"], [34, "leech"], [36, "dandelion"], [37, "fire_ant_baby"],
  [38, "fire_ant_worker"], [39, "fire_ant_queen"], [40, "ant_egg"],
  [41, "fire_ant_egg"], [42, "fly"], [43, "leafbug"], [44, "mantis"],
  [45, "termite_baby"], [46, "termite_worker"], [47, "termite_soldier"],
  [48, "termite_overmind"], [49, "termite_mound"], [50, "termite_egg"],
  [51, "bush"], [52, "roach"], [53, "moth"], [54, "firefly"],
  [55, "beetle_hel"], [56, "wasp"], [58, "spider_hel"],
  [59, "centipede_hel"], [61, "wasp_hel"], [63, "gambler"],
  [65, "firefly_magic"], [67, "beetle_nazar"], [68, "worm"],
  [70, "mecha_flower"], [71, "wasp_mecha"], [72, "spider_mecha"],
  [73, "leafbug_shiny"], [74, "crab_mecha"], [75, "assembler"],
  [76, "barrel"], [77, "beetle_mummy"], [78, "beetle_pharaoh"],
  [79, "tomb"], [80, "silverfish"], [81, "garbage"],
  [82, "ant_soldier_diver"], [83, "ghost"]
]);

export const revmap = new Map();
for (const [id, sid] of mobmap) {
  revmap.set(sid, id);
}

// Biome-specific spawn zone configurations
export const biomeSpawns = {
  garden: {
    displayName: "garden",
    mobs: ["rock", "ladybug", "ant_hole", "spider", "dandelion", "bee", "hornet", "bumble_bee", "centipede"]
  },
  desert: {
    displayName: "desert",
    mobs: ["cactus", "beetle", "beetle_nazar", "scorpion", "ladybug_shiny", "fire_ant_burrow", "sandstorm", "centipede_desert"]
  },
  ocean: {
    displayName: "ocean",
    mobs: ["bubble", "sponge", "shell", "jellyfish", "starfish", "crab", "leech"]
  },
  jungle: {
    displayName: "jungle",
    mobs: ["bush", "wasp", "leafbug", "leafbug_shiny", "mantis", "termite_mound", "ladybug_dark", "centipede_evil", "firefly", "firefly_magic"]
  },
  sewers: {
    displayName: "sewers",
    mobs: ["fly", "moth", "spider", "roach", "garbage", "silverfish"]
  }
};
