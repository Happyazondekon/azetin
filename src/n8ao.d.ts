// N8AO (occlusion ambiante) n'a pas de types : on décrit ce que le jeu utilise
declare module 'n8ao' {
  import type { Pass } from 'postprocessing';
  import type { Camera, Color, Scene } from 'three';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: { aoRadius: number; distanceFalloff: number; intensity: number; color: Color; gammaCorrection: boolean; halfRes: boolean; [k: string]: unknown };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
