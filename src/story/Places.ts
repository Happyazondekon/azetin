import { story, hasFlag } from './State';

// Lieux du village (carte du téléphone, noms qui s'affichent en approchant, repères d'objectif)
export interface Place {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number; // rayon de découverte (m)
}

export const PLACES: Place[] = [
  { id: 'car', name: 'Your 4×4', x: 1.2, z: 68, r: 10 },
  { id: 'sign', name: 'Village sign — Azé-tin', x: 3.6, z: 62, r: 8 },
  { id: 'stele', name: 'Stone of the dead', x: -3.2, z: 32, r: 9 },
  { id: 'plaza', name: 'Village square', x: 0, z: 9.4, r: 10 },
  { id: 'atelier', name: 'Kossi’s workshop', x: -16, z: 5, r: 9 },
  { id: 'buvette', name: 'Mama Dossi’s stall', x: 9, z: 5, r: 9 },
  { id: 'zem', name: 'Abandoned moto-taxi', x: -30, z: 15, r: 8 },
  { id: 'chief', name: 'Chief Houngbo’s house', x: -27, z: -20, r: 9 },
  { id: 'stump', name: 'Stump of the sacred iroko', x: 0, z: -20, r: 9 },
  { id: 'healer', name: 'Healer’s house', x: -6, z: -32, r: 9 },
  { id: 'station', name: 'Old fuel station', x: 38, z: -4, r: 13 },
  { id: 'lagoon', name: 'Lagoon shore', x: 0, z: -45, r: 10 },
];

export const place = (id: string): Place => PLACES.find((p) => p.id === id)!;

// Chemins de terre battue (dessinés au sol et sur la carte quand leurs deux bouts sont découverts)
export const PATHS: [string, string, [number, number][]][] = [
  ['car', 'stele', [[0.5, 64], [0, 46], [-0.5, 34]]],
  ['stele', 'plaza', [[-0.5, 34], [-1.8, 22], [-0.8, 13]]],
  ['plaza', 'atelier', [[-3.5, 10], [-9, 9], [-15, 8]]],
  ['plaza', 'buvette', [[3.5, 10], [6.5, 8.5], [9, 8]]],
  ['atelier', 'zem', [[-18.5, 9], [-24, 12], [-29, 14.5]]],
  ['plaza', 'stump', [[0, 6], [3.5, -3], [2.5, -15]]],
  ['stump', 'healer', [[-1.5, -23.5], [-4, -27], [-5.5, -28.5]]],
  ['stump', 'chief', [[-3, -19], [-14, -17], [-25, -16.5]]],
  ['plaza', 'station', [[4, 9.5], [16, 4], [26, -1], [31, -3]]],
  ['healer', 'lagoon', [[-5, -36.5], [-3, -41], [0, -44]]],
];

// ---------------------------------------------------------------- objectifs de l'Acte 1, étape par étape
export interface Step {
  id: string;
  text: string;
  hint: string;     // où aller / quoi faire
  target: () => { x: number; z: number } | null;
  done: () => boolean;
}

const STATION = [{ id: 'photo', x: 39.5, z: -2.8 }, { id: 'tape', x: 40.4, z: -6.6 }, { id: 'register', x: 33.4, z: -9.6 }];
function stationFragment(): { x: number; z: number } {
  return STATION.find((f) => !hasFlag('frag_' + f.id)) ?? { x: 38, z: -4 };
}

let ayabaPos: () => { x: number; z: number } = () => ({ x: -1.6, z: 30.5 });
export function setAyabaPos(f: () => { x: number; z: number }): void {
  ayabaPos = f;
}

const at = (id: string) => () => ({ x: place(id).x, z: place(id).z });

export const STEPS: Step[] = [
  { id: 'trunk', text: 'Search the trunk of your 4×4', hint: 'Walk to the back of the car and press E.', target: () => ({ x: 1.2, z: 71 }), done: () => hasFlag('trunk') },
  { id: 'road', text: 'Walk up the road towards the lights', hint: 'Follow the red dirt road north, past the burnt sign.', target: at('stele'), done: () => story.discovered.includes('stele') || hasFlag('ayaba') },
  { id: 'ayaba', text: 'Talk to the little girl by the stone', hint: 'She is waiting next to the stone of the dead.', target: () => ayabaPos(), done: () => hasFlag('ayaba') },
  { id: 'kossi', text: 'Follow her to the vulcanizer. Talk to Kossi', hint: 'His workshop is west of the village square (the blue sign).', target: at('atelier'), done: () => hasFlag('kossi') },
  { id: 'tube', text: 'Find an inner tube on the abandoned moto-taxi', hint: 'West of Kossi’s workshop, along the path.', target: () => ({ x: -30, z: 15 }), done: () => hasFlag('tube') },
  { id: 'patch', text: 'Get the patch kit at Mama Dossi’s stall', hint: 'East of the village square (the red sign). She will offer you food.', target: () => ({ x: 9, z: 7.6 }), done: () => hasFlag('patch') },
  { id: 'mirror', text: 'Look at Mama Dossi in your mirror', hint: 'Turn your back to her, then hold the right mouse button.', target: () => ({ x: 9, z: 9.5 }), done: () => hasFlag('sawDossi') },
  { id: 'back', text: 'Bring the inner tube and the patch kit to Kossi', hint: 'Kossi’s workshop, west of the square.', target: at('atelier'), done: () => hasFlag('act1') },
  // ---- Acte II — La station
  { id: 'stump', text: 'Follow the hornbill to the stump of the sacred iroko', hint: 'Ayaba went north of the square. Listen: low, two notes.', target: () => ({ x: 1.6, z: -17.2 }), done: () => hasFlag('agossou') },
  { id: 'calabash', text: 'Take Dah Agossou’s calabash in his house', hint: 'North, by the lagoon. The white house behind the palisade.', target: () => ({ x: -7.4, z: -30.9 }), done: () => hasFlag('calabash') },
  { id: 'ashes', text: 'Search the old fuel station for the truth', hint: 'Three fragments lie in the ruins, east. Q throws kaolin if they come.', target: () => stationFragment(), done: () => STATION.every((f) => hasFlag('frag_' + f.id)) },
  { id: 'power', text: 'Take the generator battery at the station', hint: 'The generator stands at the west corner of the ruins.', target: () => ({ x: 34.5, z: -0.6 }), done: () => hasFlag('power') },
  { id: 'midnight', text: 'Midnight is coming…', hint: 'Someone in this village wants to meet you.', target: () => null, done: () => hasFlag('act2') },
  // ---- Acte III (prototype : la réparation, puis le choix)
  { id: 'repair', text: 'Bring the battery to Kossi', hint: 'Back to the workshop, west of the square.', target: at('atelier'), done: () => hasFlag('repaired') },
  { id: 'leave', text: 'Drive away before dawn — or stay and learn the truth', hint: 'Your 4×4 is at the end of the road, south.', target: at('car'), done: () => false },
];

export function currentStep(): { step: Step; index: number } {
  const i = STEPS.findIndex((s) => !s.done());
  const index = i < 0 ? STEPS.length - 1 : i;
  return { step: STEPS[index], index };
}
