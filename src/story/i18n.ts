// Langue des sous-titres et de l'interface (les voix restent en anglais)
import FR from './fr.json';

export type Lang = 'en' | 'fr';
const KEY = 'azetin.lang';
let cur: Lang = (() => { try { return (localStorage.getItem(KEY) as Lang) || 'en'; } catch { return 'en'; } })();
const listeners: (() => void)[] = [];

export const lang = (): Lang => cur;
export function setLang(l: Lang): void {
  cur = l;
  try { localStorage.setItem(KEY, l); } catch { /* rien */ }
  document.documentElement.lang = l;
  for (const f of listeners) f();
}
export function onLang(f: () => void): void { listeners.push(f); }

const dict = FR as Record<string, string>;

// Traduit une phrase affichée. Les nombres sont remplacés par « # » pour retrouver la phrase, puis remis à leur place.
export function tr(s: string): string {
  if (cur === 'en' || !s) return s;
  const hit = dict[s];
  if (hit !== undefined) return hit;
  const nums = s.match(/\d+/g);
  if (nums) {
    const t = dict[s.replace(/\d+/g, '#')];
    if (t !== undefined) { let i = 0; return t.replace(/#/g, () => nums[i++] ?? ''); }
  }
  // listes : « … Still missing: a, b. »
  const miss = /^(.*?)Still missing: (.*)\.$/.exec(s);
  if (miss) {
    const head = miss[1].trim();
    const parts = miss[2].split(', ').map(tr).join(', ');
    const h = head ? tr(head) + ' ' : '';
    return `${h}Il manque encore : ${parts}.`;
  }
  return s;
}
