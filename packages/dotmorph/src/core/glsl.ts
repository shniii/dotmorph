/**
 * GLSL shared by every shape. A shape only has to say where its dots and lines
 * are; these helpers handle the flight through the cloud, pointer repulsion,
 * the round sprite and the colour ramp. Shapes with hover of their own (every
 * built-in one) skip the generic repulsion and add their own offsets with the
 * `HOVER` helpers.
 *
 * Every dot carries three things: its target in the shape (computed by the
 * shape's own GLSL each frame), `aCloud` (its slot in the cloud) and `aSeed`
 * (a random number in 0..1). A shape's `uPresence` runs from 0 (all dots
 * gathered in the cloud) to 1 (all dots in place). Each dot starts its flight
 * at a slightly different moment (`uStagger`) and follows a curved path
 * (`uSwoop`), so the swarm reads as one soft motion instead of a snap.
 */

export const SHARED_UNIFORMS: string = /* glsl */ `
uniform float uTime;
uniform float uPresence;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uDotSize;
uniform float uStagger;
uniform float uSwoop;
uniform vec3 uCloudCenter;
uniform float uCloudSpin;
uniform float uCloudDotScale;
uniform float uCloudOpacity;
uniform float uLineStart;
uniform vec2 uPointer;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform float uHoverGain;
uniform float uHoverReach;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform float uRampEnd;
`;

export const HELPERS: string = /* glsl */ `
#define DM_TAU 6.28318530718

// Integer bit mixer ("lowbias32" by Chris Wellons, public domain).
uint dmMix(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

// Random 0..1 from a float or a 2D point, stable across GPUs.
float dmHash(float n) {
  return float(dmMix(floatBitsToUint(n))) / 4294967295.0;
}

float dmHash2(vec2 p) {
  return float(dmMix(floatBitsToUint(p.x) ^ dmMix(floatBitsToUint(p.y) + 0x9e37u))) / 4294967295.0;
}

// Value noise in -1..1.
float dmNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = dmHash2(cell);
  float b = dmHash2(cell + vec2(1.0, 0.0));
  float c = dmHash2(cell + vec2(0.0, 1.0));
  float d = dmHash2(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;
}

float dmSmoother(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

mat2 dmRotate(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}
`;

export const MORPH: string = /* glsl */ `
// This dot's own progress: uPresence, delayed by up to uStagger depending on its seed.
float dmProgress(float presence, float seed) {
  float delay = seed * uStagger;
  return clamp((presence - delay) / max(1.0 - uStagger, 0.001), 0.0, 1.0);
}

// Where the dot's cloud slot is right now: the cloud turns slowly and breathes.
vec3 dmCloud(vec3 slot, float seed) {
  vec3 p = slot;
  p.xz = dmRotate(uTime * uCloudSpin + seed * 0.6) * p.xz;
  p *= 1.0 + 0.07 * sin(uTime * 1.1 + seed * DM_TAU);
  return uCloudCenter + p;
}

// Curved flight between the cloud and the target (a quadratic Bezier bent sideways).
vec3 dmFlight(vec3 cloud, vec3 target, float k, float seed) {
  vec3 span = target - cloud;
  vec3 side = cross(span, vec3(0.0, 0.0, 1.0));
  float sideLength = length(side);
  side = sideLength > 0.0001 ? side / sideLength : vec3(1.0, 0.0, 0.0);
  vec3 bend = (cloud + target) * 0.5 + side * (dmHash(seed * 57.1) - 0.5) * uSwoop * length(span);
  float e = dmSmoother(k);
  return mix(mix(cloud, bend, e), mix(bend, target, e), e);
}

// View-space push away from the pointer, strongest near it and for formed dots.
// The generic hover for shapes without their own; the built-in shapes don't use it.
vec2 dmRepel(vec4 viewPosition, float amount) {
  if (uPointerStrength <= 0.0) return vec2(0.0);
  vec4 clip = projectionMatrix * viewPosition;
  vec2 ndc = clip.xy / clip.w;
  vec2 away = ndc - uPointer;
  away.x *= uResolution.x / max(uResolution.y, 1.0);
  float dist = length(away);
  float falloff = 1.0 - smoothstep(0.0, uPointerRadius, dist);
  vec2 dir = dist > 0.0001 ? away / dist : vec2(0.0);
  return dir * falloff * falloff * uPointerStrength * amount * (-viewPosition.z) * 0.1;
}
`;

/**
 * Helpers for shapes that do their own hover. Offsets are worked out in view
 * space (x right, y up, the camera at the origin looking down -z) and taken back
 * to model space, so they can be added to a dot's target before its flight
 * (arriving dots land on already displaced spots) or to a line vertex.
 */
export const HOVER: string = /* glsl */ `
// A view-space vector in model space. The model-view is a rotation, a uniform
// scale and a shift, so its inverse on vectors is the transpose over the scale squared.
vec3 dmViewToModel(vec3 v) {
  return transpose(mat3(modelViewMatrix)) * v / max(dot(modelViewMatrix[0].xyz, modelViewMatrix[0].xyz), 1e-8);
}

// Stirring swirl at view-space point p: a smooth vortex, counter-clockwise on
// screen around centre (NDC). Everything is measured on the canvas, in canvas
// heights on both axes, so the swirl is round on screen and the same size at
// any depth. The turn is nothing right at the centre, peaks at size (canvas
// heights) at about 45% of reach and dies out smoothly at reach. The result is
// a view-space offset (world units at p's depth) parallel to the screen.
vec3 dmSwirl(vec3 p, vec2 centre, float reach, float size) {
  float depth = -p.z;
  if (depth <= 1e-3 || reach <= 0.0) return vec3(0.0);
  vec2 scale = vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  // NDC spans two canvas widths across and two heights up; scale.y / scale.x is width / height.
  vec2 offset = (scale * p.xy / depth - centre) * vec2(scale.y / scale.x, 1.0) * 0.5;
  float s = length(offset) / reach;
  if (s >= 1.0) return vec3(0.0);
  float fall = 1.0 - s * s;
  // s * (1 - s^2)^2 peaks at 16 / (25 * sqrt(5)) when s = 1 / sqrt(5); 3.4939 brings that peak to 1.
  vec2 turn = vec2(-offset.y, offset.x) * (3.4939 * size * fall * fall / reach);
  // One canvas height is 2 * depth / scale.y world units at this depth.
  return vec3(turn * (2.0 * depth / scale.y), 0.0);
}
`;

/** Vertex side of the colour ramp: the vertex's height on screen, 0 at the bottom edge, 1 at the top. */
export const RAMP_VERTEX: string = /* glsl */ `
float dmScreenHeight(vec4 clip) {
  return clip.y / clip.w * 0.5 + 0.5;
}
`;

/** Fragment side: bottom colour below, top colour from uRampEnd up, eased in between. */
export const RAMP: string = /* glsl */ `
vec3 dmRamp(float height) {
  float t = clamp(height / max(uRampEnd, 0.001), 0.0, 1.0);
  return mix(uColorBottom, uColorTop, t * t * (3.0 - 2.0 * t));
}
`;

/**
 * Builds a dot vertex shader. `declarations` holds the shape's own uniforms and
 * attributes; `body` must define `vec3 dmShapeDot(out float alpha, out float scale)`.
 * With `ownHover`, the shape adds its hover offset to the target itself and the
 * generic `dmRepel` push is left out.
 */
export function dotVertexShader(declarations: string, body: string, ownHover = false) {
  return /* glsl */ `
${SHARED_UNIFORMS}
attribute vec3 aCloud;
attribute float aSeed;
varying float vAlpha;
varying float vHeight;
${HELPERS}
${MORPH}
${HOVER}
${RAMP_VERTEX}
${declarations}
${body}
void main() {
  float alpha = 1.0;
  float scale = 1.0;
  vec3 target = dmShapeDot(alpha, scale);
  float k = dmProgress(uPresence, aSeed);
  vec3 position3 = dmFlight(dmCloud(aCloud, aSeed), target, k, aSeed);
  vec4 view = modelViewMatrix * vec4(position3, 1.0);
  ${ownHover ? '' : 'view.xy += dmRepel(view, k);'}
  gl_Position = projectionMatrix * view;
  vHeight = dmScreenHeight(gl_Position);
  gl_PointSize = uDotSize * uPixelRatio * scale * mix(uCloudDotScale, 1.0, k);
  vAlpha = alpha * mix(uCloudOpacity, 1.0, k) * smoothstep(0.0, 0.06, uPresence);
}
`;
}

export const DOT_FRAGMENT: string = /* glsl */ `
${SHARED_UNIFORMS}
varying float vAlpha;
varying float vHeight;
${RAMP}
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.34, 0.5, r)) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(dmRamp(vHeight), a);
}
`;

/**
 * Builds a line vertex shader. Lines don't fly through the cloud; they draw in
 * from their anchor (`aAlong` 0) to their tip (`aAlong` 1) once the dots have
 * mostly landed, and retract the same way. `body` must define
 * `vec3 dmShapeLine(out float alpha)`. With `ownHover`, the returned position
 * already includes the shape's hover and the generic `dmRepel` push is left out.
 */
export function lineVertexShader(declarations: string, body: string, ownHover = false) {
  return /* glsl */ `
${SHARED_UNIFORMS}
attribute float aAlong;
attribute float aSeed;
varying float vAlpha;
varying float vAlong;
varying float vReveal;
varying float vHeight;
${HELPERS}
${MORPH}
${HOVER}
${RAMP_VERTEX}
${declarations}
${body}
void main() {
  float alpha = 1.0;
  vec3 position3 = dmShapeLine(alpha);
  vec4 view = modelViewMatrix * vec4(position3, 1.0);
  ${ownHover ? '' : 'view.xy += dmRepel(view, aAlong);'}
  gl_Position = projectionMatrix * view;
  vHeight = dmScreenHeight(gl_Position);
  vAlpha = alpha;
  vAlong = aAlong;
  vReveal = clamp((uPresence - uLineStart) / max(1.0 - uLineStart, 0.001), 0.0, 1.0);
}
`;
}

export const LINE_FRAGMENT: string = /* glsl */ `
${SHARED_UNIFORMS}
varying float vAlpha;
varying float vAlong;
varying float vReveal;
varying float vHeight;
${RAMP}
void main() {
  float shown = vReveal >= 0.999 ? 1.0 : 1.0 - smoothstep(vReveal - 0.02, vReveal, vAlong);
  float a = vAlpha * shown;
  if (a < 0.004) discard;
  gl_FragColor = vec4(dmRamp(vHeight), a);
}
`;
