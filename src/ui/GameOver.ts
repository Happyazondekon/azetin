// Écran de mort : fond de cendre, citation liée à la cause (GDD, section 7), cri du calao.
export type DeathCause = 'owl' | 'crowd' | 'default' | 'stare' | 'fire' | 'station' | 'stump' | 'chief' | 'chant' | 'exhausted';

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

export class GameOver {
  private root: HTMLDivElement;
  open = false;

  private onTitle: () => void = () => location.reload();
  private ending = false;
  private card = false;
  private onCard: () => void = () => {};

  constructor(parent: HTMLElement, onWake: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'gameover';
    this.root.innerHTML = `<div class="go-inner"><p class="go-quote"></p><p class="go-fr"></p>
      <button class="go-wake">Wake up</button></div>`;
    parent.appendChild(this.root);
    this.root.querySelector('.go-wake')!.addEventListener('click', () => (this.card ? this.onCard() : this.ending ? this.onTitle() : onWake()));
  }

  // Écran de fin : titre de la fin et quelques lignes, puis retour au menu
  showEnding(title: string, lines: string[]): void {
    this.ending = true;
    this.root.querySelector('.go-quote')!.textContent = title;
    this.root.querySelector('.go-fr')!.innerHTML = lines.map((l) => `<span class="go-line">${l}</span>`).join('');
    this.root.querySelector('.go-wake')!.textContent = 'Return to title';
    this.root.classList.add('on', 'ending');
    this.open = true;
  }

  // Carte de fin avant le générique : « Continue » (ou Espace) pour lancer les crédits, sinon elle part seule
  endingCard(title: string, lines: string[], seconds: number): Promise<void> {
    this.showEnding(title, lines);
    const btn = this.root.querySelector<HTMLButtonElement>('.go-wake')!;
    btn.textContent = 'Continue';
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

  show(cause: DeathCause): void {
    this.ending = false;
    this.root.classList.remove('ending');
    this.root.querySelector('.go-wake')!.textContent = 'Wake up';
    const [en, fr] = QUOTES[cause] ?? QUOTES.default;
    this.root.querySelector('.go-quote')!.textContent = `“${en}”`;
    this.root.querySelector('.go-fr')!.textContent = fr;
    this.root.classList.add('on');
    this.open = true;
  }

  hide(): void {
    this.root.classList.remove('on');
    this.open = false;
  }
}
