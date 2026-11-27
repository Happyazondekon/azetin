// Écran de mort : fond de cendre, une sagesse d'Afrique de l'Ouest (ou la citation liée à la cause), cri du calao.
// Écran de fin : l'illustration de la fin en grand, son titre et quelques lignes.
import { tr, lang } from '../story/i18n';

export type DeathCause = 'owl' | 'crowd' | 'default' | 'stare' | 'fire' | 'station' | 'stump' | 'chief' | 'chant' | 'exhausted';

// [anglais, français] — les sagesses d'Azé-tin, liées à la cause de la mort
const QUOTES: Record<DeathCause, [string, string]> = {
  owl: ['The owl never cries for nothing.', 'Le hibou ne crie jamais pour rien.'],
  stare: ['Look too long at the dead, and they look back.', 'Regarde trop longtemps les morts, et ils te regardent.'],
  default: ['Under every quiet house, something is waiting.', 'Sous chaque case calme, quelque chose attend.'],
  crowd: ['A man with a stick fights one shadow. A wise man walks away from ten.', 'Un homme avec un bâton combat une ombre. Un sage s’éloigne de dix.'],
  fire: ['The fire that took the village is never hungry enough.', 'Le feu qui a pris le village n’a jamais assez faim.'],
  station: ['Ask the ashes nothing. They only answer with smoke.', 'Ne demande rien aux cendres, elles ne répondent que par la fumée.'],
  stump: ['Even a fallen tree remembers its height.', 'Même un arbre abattu se souvient de sa hauteur.'],
  chief: ['A chief who sells his roots has no shade to offer.', 'Un chef qui vend ses racines n’a plus d’ombre à offrir.'],
  chant: ['The ancestors listen slowly. Speak slowly.', 'Les ancêtres écoutent lentement. Parle lentement.'],
  exhausted: ['A traveller who never rests arrives nowhere.', 'Le voyageur qui ne se repose jamais n’arrive nulle part.'],
};

// Sagesses et proverbes d'Afrique de l'Ouest : [anglais, français, origine EN, origine FR]
const WISDOM: [string, string, string, string][] = [
  ['When an old man dies, a library burns to the ground.', 'En Afrique, quand un vieillard meurt, c’est une bibliothèque qui brûle.',
    'Amadou Hampâté Bâ · Mali', 'Amadou Hampâté Bâ · Mali'],
  ['Those who are dead are never gone.', 'Ceux qui sont morts ne sont jamais partis.', 'Birago Diop, “Breaths” · Senegal', 'Birago Diop, « Souffles » · Sénégal'],
  ['No one tests the depth of a river with both feet.', 'On ne teste pas la profondeur d’une rivière avec les deux pieds.',
    'Inspired by an Akan proverb · Ghana', 'D’après un proverbe akan · Ghana'],
  ['Fire and gunpowder do not sleep together.', 'Le feu et la poudre ne dorment pas ensemble.', 'Inspired by an Akan proverb · Ghana', 'D’après un proverbe akan · Ghana'],
  ['Wood already touched by fire is not hard to set alight.', 'Le bois que le feu a déjà touché s’enflamme sans peine.',
    'Inspired by an Akan proverb · Ghana', 'D’après un proverbe akan · Ghana'],
  ['It is not wrong to go back for what you have forgotten.', 'Il n’est pas mal de revenir chercher ce que l’on a oublié.',
    'Sankofa, Akan wisdom · Ghana', 'Sankofa, sagesse akan · Ghana'],
  ['The rain beats the leopard’s skin, but it does not wash out the spots.', 'La pluie mouille la peau du léopard, mais n’efface pas ses taches.',
    'Inspired by an Ashanti proverb · Ghana', 'D’après un proverbe ashanti · Ghana'],
  ['However long the night, the dawn will break.', 'Aussi longue que soit la nuit, le jour finit par se lever.',
    'Inspired by a Hausa proverb · Nigeria & Niger', 'D’après un proverbe haoussa · Nigeria et Niger'],
  ['Until the lion learns to write, every tale will glorify the hunter.', 'Tant que le lion n’aura pas appris à écrire, les histoires glorifieront le chasseur.',
    'Inspired by an Ewe proverb · Togo & Ghana', 'D’après un proverbe éwé · Togo et Ghana'],
  ['A log may soak in the river for years — it will never become a crocodile.', 'Le tronc d’arbre a beau séjourner dans l’eau, il ne deviendra jamais crocodile.',
    'Inspired by a Bambara proverb · Mali', 'D’après un proverbe bambara · Mali'],
  ['The stranger has big eyes, but he sees nothing.', 'L’étranger a de grands yeux, mais il ne voit rien.',
    'Inspired by a proverb from Burkina Faso', 'D’après un proverbe du Burkina Faso'],
  ['When the roots of a tree rot, death climbs into the branches.', 'Quand les racines d’un arbre pourrissent, la mort monte dans les branches.',
    'Inspired by an Igbo proverb · Nigeria', 'D’après un proverbe igbo · Nigeria'],
  ['The death that kills a man begins as an appetite.', 'La mort qui tue un homme commence par un appétit.',
    'Inspired by a Yoruba proverb · Nigeria', 'D’après un proverbe yoruba · Nigeria'],
  ['A village does not burn in one night; it smoulders for years.', 'Un village ne brûle pas en une nuit ; il couve pendant des années.',
    'Wisdom of Azé-tin · Benin', 'Sagesse d’Azé-tin · Bénin'],
];

export class GameOver {
  private root: HTMLDivElement;
  open = false;

  private onTitle: () => void = () => location.reload();
  private ending = false;
  private card = false;
  private onCard: () => void = () => {};
  private lastWisdom = -1;

  constructor(parent: HTMLElement, onWake: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'gameover';
    this.root.innerHTML = `<div class="go-pic"></div><div class="go-inner"><p class="go-quote"></p><p class="go-fr"></p><p class="go-origin"></p>
      <button class="go-wake">Wake up</button></div>`;
    parent.appendChild(this.root);
    this.root.querySelector('.go-wake')!.addEventListener('click', () => (this.card ? this.onCard() : this.ending ? this.onTitle() : onWake()));
  }

  private q<T extends HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!;
  }

  // Écran de fin : illustration, titre de la fin et quelques lignes
  showEnding(title: string, lines: string[], image?: string): void {
    this.ending = true;
    this.q('.go-quote').textContent = tr(title);
    this.q('.go-fr').innerHTML = lines.map((l) => `<span class="go-line">${tr(l)}</span>`).join('');
    this.q('.go-origin').textContent = '';
    this.q('.go-wake').textContent = tr('Return to title');
    const pic = this.q('.go-pic');
    pic.style.backgroundImage = image ? `url(${import.meta.env.BASE_URL}${image})` : '';
    this.root.classList.toggle('with-pic', !!image);
    this.root.classList.add('on', 'ending');
    this.open = true;
  }

  // Carte de fin avant le générique : « Continue » (ou Espace) pour lancer les crédits, sinon elle part seule
  endingCard(title: string, lines: string[], seconds: number, button = 'Continue', image?: string): Promise<void> {
    this.showEnding(title, lines, image);
    const btn = this.q<HTMLButtonElement>('.go-wake');
    btn.textContent = tr(button);
    this.card = true;
    return new Promise((res) => {
      this.onCard = () => finish();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        removeEventListener('keydown', key);
        this.card = false;
        this.hide();
        setTimeout(res, 900);
      };
      const key = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') finish(); };
      const timer = setTimeout(finish, seconds * 1000);
      setTimeout(() => addEventListener('keydown', key), 1200);
    });
  }

  // Mort : une fois sur trois la sagesse d'Azé-tin liée à la cause, sinon un proverbe d'Afrique de l'Ouest
  show(cause: DeathCause): void {
    this.ending = false;
    this.root.classList.remove('ending', 'with-pic');
    this.q('.go-pic').style.backgroundImage = '';
    this.q('.go-wake').textContent = tr('Wake up');
    const fr = lang() === 'fr';
    let quote: string, second: string, origin: string;
    if (Math.random() < 0.34) {
      const [en, f] = QUOTES[cause] ?? QUOTES.default;
      quote = fr ? f : en; second = fr ? en : f; origin = fr ? 'Sagesse d’Azé-tin · Bénin' : 'Wisdom of Azé-tin · Benin';
    } else {
      let i = Math.floor(Math.random() * WISDOM.length);
      if (i === this.lastWisdom) i = (i + 1) % WISDOM.length;
      this.lastWisdom = i;
      const [en, f, oe, of] = WISDOM[i];
      quote = fr ? f : en; second = fr ? en : f; origin = fr ? of : oe;
    }
    this.q('.go-quote').textContent = `“${quote}”`;
    this.q('.go-fr').textContent = second;
    this.q('.go-origin').textContent = `— ${origin}`;
    this.root.classList.add('on');
    this.open = true;
  }

  hide(): void {
    this.root.classList.remove('on');
    this.open = false;
  }
}
