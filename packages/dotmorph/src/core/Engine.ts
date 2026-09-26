import { Color, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { clamp } from './random';
import { paletteColors, resolvePalette, type Palette, type PaletteColors, type PaletteName } from './palettes';
import { SHAPE_NAMES, definedOnly, type CloudSettings, type ShapeHandle, type ShapeName, type SharedUniforms, type Vec3Like } from './Shape';
import { BurstShape, type BurstParams } from '../shapes/burst';
import { GlobeShape, type GlobeParams } from '../shapes/globe';
import { WaveShape, type WaveParams } from '../shapes/wave';
import { FanShape, type FanParams } from '../shapes/fan';

/** Engine-wide look and feel. Every value can be changed later with `setSettings`. */
export interface EngineSettings {
  /** Seconds for a full morph from one shape to another. */
  transitionDuration: number;
  /** 0..0.9. How spread out in time the dots leave and arrive (0 = all at once). */
  stagger: number;
  /** How far the flight path bends sideways, relative to its length. */
  swoop: number;
  /**
   * Dot diameter in CSS pixels on a 520 px tall canvas, before per-shape
   * scaling. Dots grow and shrink with the canvas height (0.55x to 1.6x).
   */
  dotSize: number;
  /** Dot size inside the cloud, relative to their size in a shape. */
  cloudDotScale: number;
  /** Dot opacity inside the cloud. */
  cloudOpacity: number;
  /** Radians per second the cloud turns while dots pass through it. */
  cloudSpin: number;
  /** Centre of the cloud in world units. */
  cloudCenter: Vec3Like;
  /** Presence (0..1) above which lines start drawing in. */
  lineStart: number;
  /** React to the pointer. */
  interactive: boolean;
  /** Pointer influence radius, where 1 is half the canvas height. */
  pointerRadius: number;
  /** Pointer push strength. */
  pointerStrength: number;
}

export const ENGINE_DEFAULTS: EngineSettings = {
  transitionDuration: 1.5,
  stagger: 0.35,
  swoop: 0.45,
  dotSize: 5.5,
  cloudDotScale: 0.7,
  cloudOpacity: 0.9,
  cloudSpin: 0.35,
  cloudCenter: { x: 0, y: 0.15, z: 0 },
  lineStart: 0.55,
  interactive: true,
  pointerRadius: 0.32,
  pointerStrength: 1,
};

export const CLOUD_DEFAULTS: CloudSettings = { radius: 1.25, flatten: 0.7, seed: 7 };

export interface ShapeParamsMap {
  burst: BurstParams;
  globe: GlobeParams;
  wave: WaveParams;
  fan: FanParams;
}

export interface EngineOptions extends Partial<EngineSettings> {
  /** Shape to show first. */
  shape?: ShapeName | number;
  /** A built-in palette name or your own palette. */
  palette?: PaletteName | Palette;
  /** Animate. When false, time stands still and morphs are instant. */
  motion?: boolean;
  /** Upper bound for the device pixel ratio (default 2). */
  maxPixelRatio?: number;
  /** Layout of the transition cloud. */
  cloud?: Partial<CloudSettings>;
  /** Initial parameters for each shape. */
  shapes?: { [K in ShapeName]?: Partial<ShapeParamsMap[K]> };
}

/** Morph windows: shapes leave during the first 60 % of a morph and arrive during the last 60 %. */
const LEAVE_END = 0.6;
const ARRIVE_START = 0.4;
const PALETTE_SECONDS = 0.7;

interface Transition {
  start: number;
  duration: number;
  target: ShapeName;
  from: Record<ShapeName, number>;
}

export function toShapeName(shape: ShapeName | number): ShapeName {
  if (typeof shape === 'number') {
    const name = SHAPE_NAMES[shape];
    if (!Number.isInteger(shape) || !name) throw new RangeError(`dotmorph: shape index must be 0 to ${SHAPE_NAMES.length - 1}, got ${shape}`);
    return name;
  }
  if (!SHAPE_NAMES.includes(shape)) throw new RangeError(`dotmorph: unknown shape "${String(shape)}"`);
  return shape;
}

/**
 * Renders dots that morph between shapes through a cloud, on a transparent
 * canvas. Framework-agnostic; see `dotmorph/react` for the component.
 */
export class DotMorphEngine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly scene = new Scene();
  readonly settings: EngineSettings;
  readonly cloud: CloudSettings;
  readonly shapes: { burst: BurstShape; globe: GlobeShape; wave: WaveShape; fan: FanShape };
  /** Called when a morph finishes, with the shape now showing. */
  onMorphEnd: ((shape: ShapeName) => void) | null = null;

  private readonly uniforms: SharedUniforms;
  private currentShape: ShapeName;
  private motionEnabled: boolean;
  private time = 0;
  private clock = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private disposed = false;
  private transition: Transition | null = null;
  private palette: Palette;
  private paletteFrom: PaletteColors | null = null;
  private paletteTo: PaletteColors;
  private paletteStart = 0;
  private readonly pointer = new Vector2(0, -10);
  private readonly pointerTarget = new Vector2(0, -10);
  private pointerLevel = 0;
  private pointerTargetLevel = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.canvas = canvas;
    const { shape = 'burst', palette = 'aurora', motion = true, maxPixelRatio = 2, cloud, shapes = {}, ...rest } = options;
    const settings = definedOnly(rest);
    this.settings = { ...ENGINE_DEFAULTS, ...settings, cloudCenter: { ...ENGINE_DEFAULTS.cloudCenter, ...definedOnly(settings.cloudCenter) } };
    this.cloud = { ...CLOUD_DEFAULTS, ...definedOnly(cloud) };
    this.motionEnabled = motion;
    this.currentShape = toShapeName(shape);

    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    this.camera = new PerspectiveCamera(40, 1, 0.1, 100);

    this.palette = resolvePalette(palette);
    this.paletteTo = paletteColors(this.palette);
    this.uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uDotSize: { value: this.settings.dotSize },
      uStagger: { value: this.settings.stagger },
      uSwoop: { value: this.settings.swoop },
      uCloudCenter: { value: new Vector3() },
      uCloudSpin: { value: this.settings.cloudSpin },
      uCloudDotScale: { value: this.settings.cloudDotScale },
      uCloudOpacity: { value: this.settings.cloudOpacity },
      uLineStart: { value: this.settings.lineStart },
      uPointer: { value: this.pointer },
      uPointerStrength: { value: 0 },
      uPointerRadius: { value: this.settings.pointerRadius },
      uColorTop: { value: this.paletteTo.top.clone() },
      uColorBottom: { value: this.paletteTo.bottom.clone() },
      uRampEnd: { value: this.paletteTo.rampEnd },
    };
    this.applySettings();

    this.shapes = {
      burst: new BurstShape(shapes.burst),
      globe: new GlobeShape(shapes.globe),
      wave: new WaveShape(shapes.wave),
      fan: new FanShape(shapes.fan),
    };
    for (const name of SHAPE_NAMES) {
      const s = this.shapeByName(name);
      s.attach({ shared: this.uniforms, cloud: this.cloud, requestRender: this.requestRender });
      s.setPresence(name === this.currentShape ? 1 : 0);
      this.scene.add(s.group);
    }

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.resize();
  }

  /** The shape currently shown (or being morphed to). */
  get shape(): ShapeName {
    return this.currentShape;
  }

  get isMorphing(): boolean {
    return this.transition !== null;
  }

  get motion(): boolean {
    return this.motionEnabled;
  }

  /** Turn animation on or off. Off freezes time and makes morphs instant. */
  set motion(value: boolean) {
    this.motionEnabled = value;
    if (!value && this.transition) this.finishTransition();
  }

  shapeByName(name: ShapeName): ShapeHandle {
    return this.shapes[name];
  }

  /**
   * Morph to another shape. Dots leave for the cloud, then arrive in the new
   * shape. Calling it mid-morph continues smoothly from where things are.
   */
  morphTo(shape: ShapeName | number, animate = this.motionEnabled) {
    const target = toShapeName(shape);
    if (target === this.currentShape && !this.transition) return;
    this.currentShape = target;
    if (!animate) {
      for (const name of SHAPE_NAMES) this.shapeByName(name).setPresence(name === target ? 1 : 0);
      this.transition = null;
      this.onMorphEnd?.(target);
      if (!this.running) this.renderOnce();
      return;
    }
    const from = {} as Record<ShapeName, number>;
    for (const name of SHAPE_NAMES) from[name] = this.shapeByName(name).presence;
    this.transition = { start: this.clock, duration: Math.max(0.05, this.settings.transitionDuration), target, from };
  }

  /** Switch palette; fades over 0.7 s when animated. */
  setPalette(palette: PaletteName | Palette, animate = this.motionEnabled && this.running) {
    this.palette = resolvePalette(palette);
    const next = paletteColors(this.palette);
    if (animate) {
      this.paletteFrom = {
        top: (this.uniforms.uColorTop.value as Color).clone(),
        bottom: (this.uniforms.uColorBottom.value as Color).clone(),
        rampEnd: this.uniforms.uRampEnd.value as number,
      };
      this.paletteStart = this.clock;
    } else {
      this.paletteFrom = null;
      (this.uniforms.uColorTop.value as Color).copy(next.top);
      (this.uniforms.uColorBottom.value as Color).copy(next.bottom);
      this.uniforms.uRampEnd.value = next.rampEnd;
    }
    this.paletteTo = next;
    if (!this.running) this.renderOnce();
  }

  getPalette(): Palette {
    return this.palette;
  }

  setSettings(patch: Partial<EngineSettings>) {
    const clean = definedOnly(patch);
    Object.assign(this.settings, clean, clean.cloudCenter ? { cloudCenter: { ...this.settings.cloudCenter, ...definedOnly(clean.cloudCenter) } } : {});
    this.applySettings();
    if (!this.running) this.renderOnce();
  }

  /** Rebuild every shape with a new cloud layout. */
  setCloud(patch: Partial<CloudSettings>) {
    Object.assign(this.cloud, definedOnly(patch));
    for (const name of SHAPE_NAMES) this.shapeByName(name).rebuild();
    if (!this.running) this.renderOnce();
  }

  /** Start the render loop. */
  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stop the render loop (the canvas keeps its last frame). */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning() {
    return this.running;
  }

  /** Advance one frame. The loop calls this; call it yourself to drive frames manually. */
  tick(now: number = performance.now()) {
    if (this.disposed) return;
    const delta = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.clock += delta;
    if (this.motionEnabled) this.time += delta;
    this.stepTransition();
    this.stepPalette();
    this.stepPointer(delta);
    this.uniforms.uTime.value = this.time;
    for (const name of SHAPE_NAMES) {
      const s = this.shapeByName(name);
      if (s.presence > 0) s.update(this.time, delta);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private readonly requestRender = () => {
    if (!this.running) this.renderOnce();
  };

  /** Draw a single frame without advancing time. */
  renderOnce() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** Match the canvas's CSS size. Call it when the canvas is resized. */
  resize() {
    const width = Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const height = Math.max(1, this.canvas.clientHeight || this.canvas.height);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.aspect = aspect;
    // Keep about 9 world units visible across, however narrow the canvas gets.
    const halfWidth = 4.7;
    const fit = halfWidth / (Math.tan((this.camera.fov * Math.PI) / 360) * aspect);
    this.camera.position.set(0, 0, Math.max(6.2, fit));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    const ratio = this.renderer.getPixelRatio();
    (this.uniforms.uResolution.value as Vector2).set(width * ratio, height * ratio);
    this.uniforms.uPixelRatio.value = ratio * clamp(height / 520, 0.55, 1.6);
    if (!this.running) this.renderOnce();
  }

  dispose() {
    this.stop();
    this.disposed = true;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    for (const name of SHAPE_NAMES) this.shapeByName(name).dispose();
    this.renderer.dispose();
  }

  private applySettings() {
    const s = this.settings;
    const u = this.uniforms;
    u.uDotSize.value = s.dotSize;
    u.uStagger.value = clamp(s.stagger, 0, 0.9);
    u.uSwoop.value = s.swoop;
    u.uCloudSpin.value = s.cloudSpin;
    u.uCloudDotScale.value = s.cloudDotScale;
    u.uCloudOpacity.value = s.cloudOpacity;
    u.uLineStart.value = clamp(s.lineStart, 0, 0.95);
    u.uPointerRadius.value = s.pointerRadius;
    (u.uCloudCenter.value as Vector3).set(s.cloudCenter.x, s.cloudCenter.y, s.cloudCenter.z);
  }

  private stepTransition() {
    const t = this.transition;
    if (!t) return;
    const p = (this.clock - t.start) / t.duration;
    for (const name of SHAPE_NAMES) {
      const from = t.from[name];
      const to = name === t.target ? 1 : 0;
      if (from === to) continue;
      const w = to === 1 ? clamp((p - ARRIVE_START) / (1 - ARRIVE_START), 0, 1) : clamp(p / LEAVE_END, 0, 1);
      this.shapeByName(name).setPresence(from + (to - from) * w);
    }
    if (p >= 1) this.finishTransition();
  }

  private finishTransition() {
    const t = this.transition;
    if (!t) return;
    for (const name of SHAPE_NAMES) this.shapeByName(name).setPresence(name === t.target ? 1 : 0);
    this.transition = null;
    this.onMorphEnd?.(t.target);
  }

  private stepPalette() {
    if (!this.paletteFrom) return;
    const k = clamp((this.clock - this.paletteStart) / PALETTE_SECONDS, 0, 1);
    const e = k * k * (3 - 2 * k);
    (this.uniforms.uColorTop.value as Color).copy(this.paletteFrom.top).lerp(this.paletteTo.top, e);
    (this.uniforms.uColorBottom.value as Color).copy(this.paletteFrom.bottom).lerp(this.paletteTo.bottom, e);
    this.uniforms.uRampEnd.value = this.paletteFrom.rampEnd + (this.paletteTo.rampEnd - this.paletteFrom.rampEnd) * e;
    if (k >= 1) this.paletteFrom = null;
  }

  private stepPointer(delta: number) {
    const follow = 1 - Math.exp(-delta * 9);
    this.pointer.lerp(this.pointerTarget, follow);
    this.pointerTargetLevel *= Math.exp(-delta * 1.2);
    this.pointerLevel += (this.pointerTargetLevel - this.pointerLevel) * (1 - Math.exp(-delta * 6));
    this.uniforms.uPointerStrength.value = this.settings.interactive ? this.pointerLevel * this.settings.pointerStrength : 0;
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.pointerTarget.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    if (this.pointerLevel < 0.01) this.pointer.copy(this.pointerTarget);
    this.pointerTargetLevel = 1;
  };

  private onPointerLeave = () => {
    this.pointerTargetLevel = 0;
  };
}
