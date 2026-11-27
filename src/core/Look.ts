// Le rendu « cinéma » d'Azé-tin : occlusion ambiante, halo des braises, étalonnage lune/braise, grain, vignette.
// Trois niveaux de qualité (téléphone > Réglages), et le jeu baisse tout seul d'un cran si l'ordinateur peine.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Effect, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, BlendFunction, SMAAEffect, BrightnessContrastEffect, HueSaturationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export type Quality = 'high' | 'medium' | 'low';
const KEY = 'azetin.quality';

export function savedQuality(): Quality {
  try { return (localStorage.getItem(KEY) as Quality) || 'high'; } catch { return 'high'; }
}

// Étalonnage « braise et lune » : les ombres tirent vers le bleu de la nuit, les lumières vers l'orange des flammes
class MoonEmberEffect extends Effect {
  constructor() {
    super('MoonEmber', /* glsl */ `
      uniform float strength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float sh = 1.0 - smoothstep(0.0, 0.32, l);
        float hi = smoothstep(0.38, 0.95, l);
        c = mix(c, c * vec3(0.86, 0.97, 1.22), sh * strength);
        c = mix(c, c * vec3(1.1, 0.98, 0.84), hi * strength);
        outputColor = vec4(c, inputColor.a);
      }`, { uniforms: new Map([['strength', new THREE.Uniform(0.85)]]) });
  }
}

export class Look {
  readonly composer: EffectComposer;
  quality: Quality;
  private ao: N8AOPostPass;
  private bloom: BloomEffect;
  private noise: NoiseEffect;
  private finish: EffectPass;
  private hdr: EffectPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: Quality) {
    this.quality = quality;
    renderer.toneMapping = THREE.NoToneMapping; // le ton se fait à la fin, dans la chaîne d'effets
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));

    // ombres de contact : coins, pieds des murs, sous les gens
    this.ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    this.ao.configuration.aoRadius = 1.4;
    this.ao.configuration.distanceFalloff = 0.8;
    this.ao.configuration.intensity = 2.6;
    this.ao.configuration.color = new THREE.Color(0x05060a);
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.composer.addPass(this.ao);

    // les flammes, les lampes et les yeux brillent vraiment
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.85, luminanceSmoothing: 0.3, intensity: 0.95, radius: 0.7 });
    this.hdr = new EffectPass(camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    this.composer.addPass(this.hdr);

    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.14;
    const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.6 });
    const grade = new BrightnessContrastEffect({ contrast: 0.1, brightness: 0.035 });
    const sat = new HueSaturationEffect({ saturation: -0.06 });
    this.finish = new EffectPass(camera, new MoonEmberEffect(), grade, sat, vignette, this.noise, new SMAAEffect());
    this.composer.addPass(this.finish);
    this.setQuality(quality);
  }

  setQuality(q: Quality, save = true): void {
    this.quality = q;
    if (save) try { localStorage.setItem(KEY, q); } catch { /* rien */ }
    this.ao.enabled = q === 'high';
    this.ao.configuration.halfRes = q !== 'high';
    this.bloom.intensity = q === 'low' ? 0.7 : 0.95;
    this.bloom.resolution.height = q === 'high' ? 480 : 300;
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
