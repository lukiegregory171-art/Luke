// Minimal ambient types for n8ao (ships no .d.ts). We only use N8AOPostPass with
// the pmndrs `postprocessing` EffectComposer.
declare module 'n8ao' {
  import { Pass } from 'postprocessing';
  import { Scene, Camera } from 'three';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      [key: string]: unknown;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
