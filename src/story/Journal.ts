import { hasFlag } from './State';

// =============================================================
//  « Ce que je sais » : l'histoire d'Azé-tin, reconstituée par le joueur.
//  Chaque étape reste floue tant qu'un des indices qui la racontent n'a pas été trouvé
//  (une réplique entendue = drapeau heard_<id>, un fragment photographié = frag_<id>).
// =============================================================
export interface JournalStep {
  id: string;
  title: string;
  text: string;
  photo?: string; // image de public/photos, quand un fragment l'illustre
  known: () => boolean;
}

const heard = (...ids: string[]) => ids.some((i) => hasFlag('heard_' + i));
const frag = (...ids: string[]) => ids.some((i) => hasFlag('frag_' + i));

export const JOURNAL: JournalStep[] = [
  {
    id: 'deal', title: 'The deal',
    text: 'Houngbo, drowning in debt, makes a deal with kpayo smugglers: a station and 300 barrels of petrol.',
    photo: 'register',
    known: () => heard('kossi_story') || frag('notebook', 'register'),
  },
  {
    id: 'loko', title: 'Loko is cut down',
    text: 'To build the station, he has Loko, the great sacred iroko, cut down, despite Dah Agossou’s warning.',
    photo: 'photo',
    known: () => heard('kossi_story', 'agossou_forbid') || frag('photo'),
  },
  {
    id: 'feast', title: 'The festival',
    text: 'That same night, Houngbo throws a great festival for the whole village.',
    known: () => heard('radio_news', 'kossi_story', 'flash_party'),
  },
  {
    id: 'fire', title: 'The fire',
    text: 'The barrels explode: 63 dead, among them Houngbo and Dah Agossou. Ayaba drowns in the lagoon. Kossi is the only survivor.',
    photo: 'end-ashes',
    known: () => heard('radio_news', 'kossi_story', 'ayaba_flash_end'),
  },
  {
    id: 'rites', title: 'No funeral',
    text: 'Without Loko, no funeral rite can be performed. The dead cannot join the ancestors.',
    known: () => heard('ayaba_stump', 'agossou_tape', 'agossou_forbid'),
  },
  {
    id: 'azevi', title: 'Azévi: the dead who stay',
    text: 'Their souls wander the village. Only the mirror shows their true faces.',
    photo: 'end-azevi',
    known: () => hasFlag('sawDossi') || heard('ayaba_know'),
  },
  {
    id: 'free', title: 'How to free them?',
    text: 'Give them the funeral they never had: the calabash, the 3 plants and the whole truth, at the asen under the station.',
    known: () => hasFlag('riteTold') || heard('kossi_rite_explain'),
  },
];

export function knownCount(): number {
  return JOURNAL.filter((s) => s.known()).length;
}

// L'historique des dialogues entendus (le plus récent en premier), pour relire ce qu'on a raté
export const DIALOG_LOG: { name: string; text: string }[] = [];
export function logDialog(name: string, text: string): void {
  if (!text.trim()) return;
  const last = DIALOG_LOG[0];
  if (last && last.name === name && last.text === text) return;
  DIALOG_LOG.unshift({ name, text });
  if (DIALOG_LOG.length > 80) DIALOG_LOG.pop();
}
