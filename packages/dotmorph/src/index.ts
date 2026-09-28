/**
 * dotmorph: dots that morph between shapes through a swirling cloud.
 * Framework-agnostic core. See `dotmorph/react` for the React component.
 *
 * ```ts
 * import { DotMorphEngine } from 'dotmorph';
 *
 * const engine = new DotMorphEngine(canvas, { shape: 'burst', palette: 'aurora' });
 * engine.start();
 * engine.morphTo('globe');
 * ```
 */
export {
  DotMorphEngine,
  ENGINE_DEFAULTS,
  CLOUD_DEFAULTS,
  toShapeName,
  type EngineOptions,
  type EngineSettings,
  type ShapeParamsMap,
} from './core/Engine.js';
export { Shape, SHAPE_NAMES, type ShapeName, type ShapeHandle, type Vec3Like, type CloudSettings, type ShapeContext, type SharedUniforms } from './core/Shape.js';
export { PALETTES, PALETTE_NAMES, paletteBackground, resolvePalette, type Palette, type PaletteName } from './core/palettes.js';
export { BurstShape, BURST_DEFAULTS, type BurstParams } from './shapes/burst.js';
export { GlobeShape, GLOBE_DEFAULTS, type GlobeParams } from './shapes/globe.js';
export { WaveShape, WAVE_DEFAULTS, type WaveParams } from './shapes/wave.js';
export { FanShape, FAN_DEFAULTS, type FanParams } from './shapes/fan.js';
