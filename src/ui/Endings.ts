// Les 4 fins, et celles que le joueur a déjà vues (gardées d'une partie à l'autre)
export const ENDINGS = [
  { id: 'survivor', num: 'I', title: 'The Survivor', hint: 'Some leave before dawn. They never look back.' },
  { id: 'azevi', num: 'II', title: 'The Azévi', hint: 'Eat what the dead offer you. Again and again.' },
  { id: 'ashes', num: 'III', title: 'The Ashes', hint: 'A chief always keeps his word. His own way.' },
  { id: 'healer', num: 'IV', title: 'The Last Healer', hint: 'The hornbill only cries for those who listen. Find the whole truth.' },
] as const;
export type EndingId = (typeof ENDINGS)[number]['id'];

const KEY = 'azetin.endings';

export function endingsSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function markEnding(id: EndingId): void {
  try {
    const s = new Set(endingsSeen());
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch { /* pas de stockage */ }
}
