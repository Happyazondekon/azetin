// État de l'histoire : les compteurs qui décident des 4 fins (voir GDD, section 5).
export interface StoryState {
  minutes: number;      // heure du jeu en minutes depuis minuit (19h00 = 1140)
  marque: number;       // 0 à 3 — à 3, Happy devient Azévi
  secret: number;       // fragments trouvés, 0 à 5
  plantes: number;      // 0 à 3
  pieces: number;       // 0 à 3
  kossiTrust: boolean;
  battery: number;      // batterie du smartphone, 0 à 100
  objective: string;
  inventory: string[];
  flags: string[];
  pos: [number, number, number] | null; // x, z, yaw
}

const KEY = 'azetin.save.v1';

function fresh(): StoryState {
  return {
    minutes: 19 * 60,
    marque: 0,
    secret: 0,
    plantes: 0,
    pieces: 0,
    kossiTrust: true,
    battery: 64,
    objective: 'Check the 4×4. Search the trunk.',
    inventory: [],
    flags: [],
    pos: null,
  };
}

export const story: StoryState = fresh();

export function resetStory(): void {
  Object.assign(story, fresh());
}

export function hasFlag(f: string): boolean {
  return story.flags.includes(f);
}

export function setFlag(f: string): void {
  if (!hasFlag(f)) story.flags.push(f);
}

export function clockText(): string {
  const m = Math.floor(story.minutes) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// localStorage peut être indisponible (navigation privée, iframe) : on ne plante jamais.
export function saveGame(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(story));
  } catch { /* pas de sauvegarde possible */ }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    Object.assign(story, fresh(), JSON.parse(raw) as Partial<StoryState>);
    return true;
  } catch {
    return false;
  }
}
