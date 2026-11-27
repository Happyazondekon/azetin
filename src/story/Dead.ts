// Les morts d'Azé-tin : chaque villageois (v0…v15) a un nom (ceux de la stèle) et une mort.
// Le rétroviseur les montre tels qu'ils sont ; les garder dans le reflet un instant révèle qui ils étaient.
export const DEAD_GOAL = 12;
export const DEAD: Record<string, { name: string; text: string }> = {
  v0: { name: 'TOSSOU', text: 'The fisherman. He carried the kpayo cans from the lagoon to the station.' },
  v1: { name: 'SÈNAMI', text: 'She sold beignets at the festival. She went back for her daughter’s sandals.' },
  v2: { name: 'KPÈ', text: 'The drummer. He was still playing when the sky turned white.' },
  v3: { name: 'ADJOVI', text: 'A seamstress. Half the wax in the village was cut by her hands.' },
  v4: { name: 'HOUÉNOU', text: 'Old Houénou. He had warned them all: “never store fuel near the iroko.”' },
  v5: { name: 'AÏSSI', text: 'She was carrying water to put out the first flames.' },
  v6: { name: 'DAGBO', text: 'He sold the stolen fuel for Houngbo. He knew it was leaking.' },
  v7: { name: 'ABLA', text: 'The midwife. She delivered Ayaba, seven years before the fire.' },
  v8: { name: 'GBÈNOU', text: 'Houngbo’s cousin. He took the money and kept quiet.' },
  v9: { name: 'AFIAVI', text: 'She was dancing in the circle, right next to the pumps.' },
  v10: { name: 'ZINSOU', text: 'The schoolteacher. His pupils’ names are still on the blackboard.' },
  v11: { name: 'HOUÉFA', text: 'She tried to pull her husband out of the smoke.' },
  v12: { name: 'NOUDÉHOU', text: 'A young zem driver. He gave the healer a ride home that night.' },
  v13: { name: 'MAWULÉ', text: 'She laughed loudest at the feast. Nobody heard her scream.' },
  v14: { name: 'SOSSA', text: 'The ferryman. His pirogue still waits at the lagoon.' },
  v15: { name: 'DJIDJOHO', text: 'Sossa’s wife. They are standing where their house used to be.' },
};
