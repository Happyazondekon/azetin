// Menu principal : entrées gravées comme les noms de la stèle, braise orange au survol.
// Le décor 3D derrière (4×4 en panne devant le panneau) est rendu par Game.
export interface MenuActions {
  onNew(): void;
  onContinue(): void;
}

const PANELS: Record<string, string> = {
  endings: `<h3>Endings</h3>
    <ul class="endings">
      <li class="locked">I · ??? </li><li class="locked">II · ???</li>
      <li class="locked">III · ???</li><li class="locked">IV · ???</li>
    </ul>
    <p class="hint">The hornbill only cries for those who listen.</p>`,
  settings: `<h3>Settings</h3><p>Open your phone (Tab) during the game to change settings.</p>`,
  credits: `<h3>Credits</h3><p>A game by <b>Happy Azondekon</b> · HeyHappy Studio</p>
    <p>Made for OpenGame Game Jam #1 · Voices, sound and music: ElevenLabs</p>
    <p class="hint">Azé-tin and its people are fictional.</p>`,
};

export class Menu {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private continueBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, actions: MenuActions, hasSave: boolean) {
    this.root = document.createElement('div');
    this.root.id = 'menu';
    this.root.innerHTML = `
      <div class="menu-title">
        <h1>AZETIN</h1>
        <h2>The Last Healer</h2>
      </div>
      <nav>
        <button data-a="new">New game</button>
        <button data-a="continue">Continue</button>
        <button data-a="endings">Endings</button>
        <button data-a="settings">Settings</button>
        <button data-a="credits">Credits</button>
      </nav>
      <div class="menu-panel"></div>
      <p class="menu-foot">HeyHappy Studio · Headphones recommended · Mouse and keyboard</p>`;
    parent.appendChild(this.root);
    this.panel = this.root.querySelector('.menu-panel')!;
    this.continueBtn = this.root.querySelector('[data-a="continue"]')!;
    this.setSave(hasSave);

    this.root.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => {
      b.addEventListener('click', () => {
        const a = b.dataset.a!;
        if (a === 'new') actions.onNew();
        else if (a === 'continue') actions.onContinue();
        else this.showPanel(a);
      });
    });
  }

  setSave(has: boolean): void {
    this.continueBtn.disabled = !has;
  }

  private showPanel(name: string): void {
    const html = PANELS[name] ?? '';
    const same = this.panel.dataset.name === name && this.panel.classList.contains('on');
    this.panel.innerHTML = html;
    this.panel.dataset.name = name;
    this.panel.classList.toggle('on', !same);
  }

  show(hasSave: boolean): void {
    this.setSave(hasSave);
    this.panel.classList.remove('on');
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
