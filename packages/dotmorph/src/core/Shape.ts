import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  NormalBlending,
  ShaderMaterial,
  type Camera,
  type IUniform,
} from 'three';
import { DOT_FRAGMENT, LINE_FRAGMENT, dotVertexShader, lineVertexShader } from './glsl';
import { createRandom } from './random';

export const SHAPE_NAMES = ['burst', 'globe', 'wave', 'fan'] as const;
export type ShapeName = (typeof SHAPE_NAMES)[number];

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Uniforms every material shares by reference (time, palette, pointer, cloud, ...). */
export type SharedUniforms = Record<string, IUniform>;

/** Where the transition cloud sits and how its slots are spread. */
export interface CloudSettings {
  /** Radius of the cloud in world units (x; y and z are scaled by `flatten`). */
  radius: number;
  /** y and z scale of the cloud relative to x (below 1 gives a flatter cloud). */
  flatten: number;
  /** Seed for the slot layout. */
  seed: number;
}

export interface ShapeContext {
  shared: SharedUniforms;
  cloud: CloudSettings;
  /** Asks the engine for a new frame when it isn't animating (e.g. after `setParams`). */
  requestRender?: () => void;
  /** The engine's camera, for shapes that mirror positions on the CPU (hover springs). */
  camera?: Camera;
}

/** What the engine needs from any shape, whatever its params type. */
export interface ShapeHandle {
  readonly name: ShapeName;
  readonly group: Group;
  readonly presence: number;
  attach(ctx: ShapeContext): void;
  setPresence(value: number): void;
  update(time: number, delta: number): void;
  rebuild(): void;
  dispose(): void;
  /** The pointer moved over the canvas (NDC, y up) while this shape listens. */
  pointerMove?(x: number, y: number, live: boolean): void;
  /** The pointer left the canvas while this shape listens. */
  pointerLeave?(): void;
  /** Per-frame hover work while hover runs and the shape is shown or still visible. */
  updateHover?(time: number, delta: number): void;
  /** Drop all hover state at once. */
  resetHover?(): void;
}

/**
 * A shape is a group of dots (and usually lines) whose positions are computed
 * on the GPU. Each shape owns a `uPresence` uniform: 0 means every dot has
 * gathered in the cloud, 1 means the shape is fully formed. The engine drives
 * presence during a morph; a shape only describes where things are.
 *
 * Subclasses implement `build()` (create geometry and materials into `group`)
 * and list their `structuralKeys` (params that need a rebuild when changed).
 * Other params are pushed to uniforms by `syncUniforms()`.
 */
export abstract class Shape<P extends object = object> {
  abstract readonly name: ShapeName;
  readonly group = new Group();
  readonly params: P;
  readonly defaults: Readonly<P>;
  protected ctx: ShapeContext | null = null;
  protected readonly local: Record<string, IUniform> = { uPresence: { value: 0 } };
  protected abstract readonly structuralKeys: readonly (keyof P)[];
  /**
   * True when the shape's GLSL adds its own hover offsets, which turns off the
   * templates' generic `dmRepel` push. Every built-in shape does.
   */
  protected readonly ownsHover: boolean = false;
  /** The pointer as this shape last saw it, in NDC (-1..1 across the canvas, y up). */
  protected readonly pointer = { x: 0, y: 0, inside: false };

  constructor(defaults: P, params: Partial<P> = {}) {
    this.defaults = defaults;
    this.params = cloneParams({ ...defaults, ...definedOnly(params) } as P);
  }

  get presence(): number {
    return this.local.uPresence.value as number;
  }

  /** Called once by the engine. */
  attach(ctx: ShapeContext) {
    this.ctx = ctx;
    this.build();
    this.syncUniforms();
  }

  setPresence(value: number) {
    this.local.uPresence.value = value;
    this.group.visible = value > 0.0001;
  }

  /**
   * Change parameters. Pass only the keys you want to change; values that feed
   * uniforms apply on the next frame, structural ones rebuild the geometry.
   */
  setParams(patch: Partial<P>) {
    let rebuild = false;
    for (const key of Object.keys(patch) as (keyof P)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      if (this.structuralKeys.includes(key) && JSON.stringify(this.params[key]) !== JSON.stringify(value)) rebuild = true;
      (this.params as Record<keyof P, unknown>)[key] = typeof value === 'object' && value !== null ? { ...value } : value;
    }
    if (rebuild) this.rebuild();
    else this.syncUniforms();
    this.ctx?.requestRender?.();
  }

  /** Throw away and rebuild the geometry (e.g. after the engine's cloud changed). */
  rebuild() {
    if (!this.ctx) return;
    this.clear();
    this.build();
    this.syncUniforms();
  }

  /** Optional per-frame CPU work. `time` is in seconds, paused time excluded. */
  update(_time: number, _delta: number) {}

  /**
   * The engine forwards pointer moves to the shape being shown (or morphed to)
   * only. `live` is false while hover is paused (motion off, loop stopped,
   * `hoverPaused`): the position is kept, but nothing may be accumulated from it.
   */
  pointerMove(x: number, y: number, _live: boolean) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
  }

  /** The pointer left the canvas: as far as this shape knows, it is now infinitely far away. */
  pointerLeave() {
    this.pointer.inside = false;
  }

  /**
   * Per-frame hover work (springs, energy). The engine calls it only while
   * `interactive` and motion are on and hover isn't paused, and the shape is the one being shown or is
   * still visible, so hover state freezes while a shape is away and resumes,
   * never reset, when it returns.
   */
  updateHover(_time: number, _delta: number) {}

  /** Forget the pointer and put everything back at rest at once (`interactive` turned off). */
  resetHover() {
    this.pointer.inside = false;
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }

  protected abstract build(): void;

  /** Push non-structural params into `this.local` uniforms. */
  protected syncUniforms() {}

  protected get shared(): SharedUniforms {
    if (!this.ctx) throw new Error('dotmorph: shape used before it was attached to an engine');
    return this.ctx.shared;
  }

  /** Remove and dispose everything in the group. */
  protected clear() {
    for (const child of [...this.group.children]) {
      const mesh = child as unknown as { geometry?: BufferGeometry; material?: ShaderMaterial };
      mesh.geometry?.dispose();
      mesh.material?.dispose();
      this.group.remove(child);
    }
  }

  protected dotMaterial(declarations: string, body: string) {
    return new ShaderMaterial({
      uniforms: { ...this.shared, ...this.local },
      vertexShader: dotVertexShader(declarations, body, this.ownsHover),
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: NormalBlending,
    });
  }

  protected lineMaterial(declarations: string, body: string) {
    return new ShaderMaterial({
      uniforms: { ...this.shared, ...this.local },
      vertexShader: lineVertexShader(declarations, body, this.ownsHover),
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: NormalBlending,
    });
  }

  /**
   * Adds `aCloud` (a slot in the cloud) and `aSeed` to a dot geometry. Slots
   * are spread through a soft ellipsoid, denser towards the middle.
   */
  protected addCloud(geometry: BufferGeometry, count: number, seedOffset: number) {
    const cloud = this.ctx?.cloud ?? { radius: 0.9, flatten: 0.8, seed: 1 };
    const rng = createRandom(cloud.seed * 7919 + seedOffset);
    const slots = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform direction, radius biased towards the centre.
      const u = rng.range(-1, 1);
      const phi = rng.range(0, Math.PI * 2);
      const s = Math.sqrt(1 - u * u);
      const r = cloud.radius * Math.pow(rng.next(), 0.55);
      slots[i * 3] = s * Math.cos(phi) * r;
      slots[i * 3 + 1] = u * r * cloud.flatten;
      slots[i * 3 + 2] = s * Math.sin(phi) * r * cloud.flatten;
      seeds[i] = rng.next();
    }
    geometry.setAttribute('aCloud', new Float32BufferAttribute(slots, 3));
    geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  }
}

/** Drops keys whose value is `undefined`, so they can't override defaults. */
export function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!value) return out;
  for (const key of Object.keys(value) as (keyof T)[]) if (value[key] !== undefined) out[key] = value[key];
  return out;
}

function cloneParams<P extends object>(params: P): P {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) out[key] = typeof value === 'object' && value !== null ? { ...value } : value;
  return out as P;
}
