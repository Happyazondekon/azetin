// Clavier + souris. On lit e.code (position physique de la touche) :
// ZQSD en AZERTY et WASD en QWERTY donnent les mêmes codes (KeyW, KeyA, KeyS, KeyD).
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  rightDown = false;
  leftClicked = false;

  constructor(private lockTarget: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.lockTarget) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 2) this.rightDown = true;
      if (e.button === 0) this.leftClicked = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightDown = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => {
      this.keys.clear();
      this.rightDown = false;
    });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.leftClicked = false;
  }
}
