import { Effect } from '@babylonjs/core';

/**
 * Custom GLSL shaders for the cinematic space scene.
 *
 * - cinematicSky:   full procedural deep-space dome (stars + milky way + nebulae)
 *                   rendered in a single draw call. Replaces thousands of CPU
 *                   particles with pure GPU work.
 * - cinematicSun:   animated plasma star surface with granulation, limb
 *                   darkening and a hot HDR rim that feeds the bloom pass.
 * - atmosphereRim:  view-dependent atmospheric scattering shell for planets.
 *                   The limb brightens facing the sun and falls off on the
 *                   night side, giving the classic "movie planet" look.
 */

// Shared GLSL noise helpers (value noise + fbm), prepended to fragment shaders.
const NOISE_GLSL = `
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7,  74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p = p * 2.13 + vec3(11.3);
    amp *= 0.5;
  }
  return sum;
}
`;

const SKY_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;

void main(void) {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = `
precision highp float;
varying vec3 vDir;
uniform float time;

${NOISE_GLSL}

// One layer of grid-hashed stars. Returns colored star contribution.
vec3 starLayer(vec3 dir, float scale, float threshold, float radius,
               float brightness, float twinkleAmt) {
  vec3 p = dir * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 h = hash33(id);
  vec3 starPos = (h - 0.5) * 0.75;
  float d = length(f - starPos);
  float core = smoothstep(radius, 0.0, d);
  // Only a fraction of cells actually hold a star.
  float exists = smoothstep(threshold, threshold + 0.06, h.x);
  float tw = 1.0 - twinkleAmt + twinkleAmt *
    (0.5 + 0.5 * sin(time * (0.6 + h.y * 2.2) + h.z * 6.2831));
  // Blue-white to warm-amber color temperature per star.
  vec3 tint = mix(vec3(0.62, 0.75, 1.0), vec3(1.0, 0.82, 0.58), h.z);
  tint = mix(tint, vec3(1.0), 0.45);
  return tint * core * core * exists * brightness * tw;
}

void main(void) {
  vec3 dir = normalize(vDir);
  vec3 col = vec3(0.004, 0.006, 0.012); // not-quite-black deep space

  // ── Nebulae — layered colored gas, very slow drift ─────────────────────
  float n1 = fbm(dir * 2.6 + vec3(time * 0.004, 0.0, -time * 0.003));
  float n2 = fbm(dir * 4.4 + vec3(17.7, -8.2, 4.4) - vec3(0.0, time * 0.0035, 0.0));
  float n3 = fbm(dir * 1.7 + vec3(-31.0, 12.0, 7.0));

  vec3 nebDeep    = vec3(0.10, 0.16, 0.45); // deep blue
  vec3 nebViolet  = vec3(0.38, 0.12, 0.55); // violet
  vec3 nebTeal    = vec3(0.05, 0.38, 0.42); // teal
  vec3 nebEmber   = vec3(0.55, 0.18, 0.10); // faint ember

  col += nebDeep   * smoothstep(0.48, 0.98, n1) * 0.15;
  col += nebViolet * smoothstep(0.55, 1.00, n2) * 0.14;
  col += nebTeal   * smoothstep(0.60, 1.05, n1 * n2 * 2.2) * 0.11;
  col += nebEmber  * smoothstep(0.66, 1.05, n3 * n2 * 2.0) * 0.07;

  // ── Milky-way band — a narrow, cool, clumpy ribbon (space stays BLACK) ─
  vec3 bandN = normalize(vec3(0.35, 1.0, 0.22));
  float bd = dot(dir, bandN);
  float band = exp(-bd * bd * 60.0);
  float clump = fbm(dir * 6.5 + vec3(7.31));
  clump = smoothstep(0.35, 0.9, clump); // high contrast: wisps, not fog
  float dust  = fbm(dir * 9.5 + vec3(-3.17, 5.2, 1.8));
  vec3 mw = vec3(0.55, 0.58, 0.68) * band * clump * 0.9;
  // Dust lanes carve dark channels through the band.
  mw *= 1.0 - smoothstep(0.45, 0.8, dust) * 0.85;
  // Warm galactic-core hotspot along the band.
  vec3 coreDir = normalize(vec3(0.9, -0.05, 0.35));
  float coreGlow = pow(max(dot(dir, coreDir), 0.0), 20.0);
  mw += vec3(0.9, 0.72, 0.5) * coreGlow * band * 0.8;
  col += max(mw, 0.0) * 0.32;

  // ── Stars — three layers of depth, brightest ones twinkle ──────────────
  col += starLayer(dir, 64.0, 0.62, 0.14, 0.85, 0.15); // dense faint dust
  col += starLayer(dir, 32.0, 0.72, 0.12, 1.60, 0.25); // mid layer
  col += starLayer(dir, 14.0, 0.82, 0.09, 3.20, 0.45); // bright heroes

  // Extra star density inside the milky-way band.
  col += starLayer(dir * 1.7 + vec3(4.2), 80.0, 0.55, 0.16, 0.7, 0.1) * band;

  gl_FragColor = vec4(col, 1.0);
}
`;

const SUN_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vNormalL;

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(world) * normal);
  vNormalL = normalize(normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const SUN_FRAGMENT = `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vNormalL;
uniform vec3 cameraPosition;
uniform float time;
uniform vec3 coreColor;
uniform vec3 edgeColor;
uniform float flare; // 0..1 — solar flare pulse driven from the CPU

${NOISE_GLSL}

void main(void) {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float ndv = clamp(dot(n, v), 0.0, 1.0);

  // Animated plasma granulation — two scales of drifting fbm.
  vec3 ln = vNormalL;
  float g1 = fbm(ln * 5.0 + vec3(time * 0.05, -time * 0.03, time * 0.02));
  float g2 = fbm(ln * 13.0 - vec3(time * 0.04, time * 0.02, -time * 0.03));
  float plasma = g1 * 0.62 + g2 * 0.38;
  // Sharpen the cell contrast so granulation survives tone mapping.
  plasma = smoothstep(0.28, 0.78, plasma);

  // Surface: dark convection lanes against a hot background.
  vec3 surface = mix(edgeColor * 0.55, coreColor, plasma);
  // Occasional white-hot flare filaments.
  float filament = smoothstep(0.82, 0.98, plasma);
  surface += vec3(1.0, 0.95, 0.85) * filament * 0.55;

  // Limb darkening toward the edge of the disc.
  float limb = pow(ndv, 0.55);
  surface = mix(surface * 0.30, surface, limb);

  // Hot HDR rim right at the silhouette — feeds bloom for the corona glow.
  float rim = pow(1.0 - ndv, 3.0);
  surface += coreColor * rim * 1.5;

  // Solar flare pulse — the whole star breathes brighter for a moment.
  surface += coreColor * (rim + 0.18) * flare * 1.1;

  // Push into HDR so the bloom pass ignites.
  gl_FragColor = vec4(surface * 1.35, 1.0);
}
`;

const PLANET_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec3 vLocal;

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(world) * normal);
  vLocal = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const PLANET_FRAGMENT = `
precision highp float;
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec3 vLocal;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform vec3 baseColor;
uniform float kind;        // 0 rocky · 1 gas · 2 ice · 3 lava · 4 terra · 5 tech
uniform float seed;
uniform float time;
uniform float nightLights; // 1.0 = civilization glitters on the night side

${NOISE_GLSL}

float ridged(vec3 p) {
  return 1.0 - abs(2.0 * fbm(p) - 1.0);
}

void main(void) {
  vec3 dir = normalize(vLocal);
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(sunPosition - vPosW);
  float ndl = dot(N, L);
  float day = clamp(ndl, 0.0, 1.0);
  float dayMask = smoothstep(-0.08, 0.18, ndl);

  vec3 sp = dir * 3.0 + vec3(seed);
  vec3 albedo = baseColor;
  vec3 emissive = vec3(0.0);
  float specStrength = 0.0;

  if (kind < 0.5) {
    // ── Rocky world: weathered terrain + impact scarring ──────────────
    float h = fbm(sp * 1.6);
    float detail = fbm(sp * 6.0);
    float scars = ridged(sp * 2.5);
    albedo = baseColor * (0.5 + h * 0.75);
    albedo = mix(albedo, baseColor * 0.32, smoothstep(0.78, 0.96, scars) * 0.85);
    albedo += baseColor * detail * 0.16;
  } else if (kind < 1.5) {
    // ── Gas giant: animated turbulent bands + storm vortex ────────────
    float lat = dir.y;
    float turb = fbm(sp * 2.2 + vec3(time * 0.015, 0.0, time * 0.01)) * 2.4;
    float bands  = sin(lat * 14.0 + turb + seed) * 0.5 + 0.5;
    float bands2 = sin(lat * 5.0 - turb * 0.7) * 0.5 + 0.5;
    vec3 cDark  = baseColor * 0.55;
    vec3 cLight = min(baseColor * 1.3 + vec3(0.08), vec3(1.0));
    albedo = mix(cDark, cLight, bands);
    albedo = mix(albedo, baseColor * 1.12, bands2 * 0.35);
    // The Great Storm — a swirling oval like Jupiter's red spot
    vec3 stormC = normalize(vec3(0.8, -0.35, 0.5));
    float sd = distance(dir, stormC);
    float storm = smoothstep(0.30, 0.06, sd);
    float swirl = fbm(sp * 5.0 + vec3(sd * 18.0 - time * 0.05));
    albedo = mix(albedo, vec3(0.82, 0.42, 0.28) * (0.75 + swirl * 0.55), storm);
  } else if (kind < 2.5) {
    // ── Ice world: glacial sheets veined with pressure cracks ─────────
    float h = fbm(sp * 2.4);
    float crack = ridged(sp * 3.5);
    vec3 iceBase = mix(baseColor, vec3(0.85, 0.93, 1.0), 0.55);
    albedo = iceBase * (0.7 + h * 0.4);
    albedo = mix(albedo, iceBase * 0.45, smoothstep(0.82, 0.98, crack) * 0.75);
    specStrength = 0.5;
  } else if (kind < 3.5) {
    // ── Lava world: black crust split by glowing magma rivers (HDR) ───
    float crust = fbm(sp * 2.8);
    float crack = ridged(sp * 3.2 + vec3(time * 0.008));
    albedo = (baseColor * 0.10 + vec3(0.02)) * (0.6 + crust * 0.5);
    float glow = smoothstep(0.72, 0.97, crack);
    vec3 lavaCol = mix(baseColor, vec3(1.0, 0.55, 0.15), 0.5);
    float pulse = 0.8 + 0.2 * sin(time * 1.4 + seed * 3.0);
    emissive += lavaCol * glow * 2.2 * pulse;
    emissive += lavaCol * smoothstep(0.5, 0.72, crack) * 0.22;
  } else if (kind < 4.5) {
    // ── Terra: oceans, continents, coastal shallows, polar caps ───────
    float cont = fbm(sp * 1.5);
    float landMask = smoothstep(0.50, 0.56, cont);
    float mount = fbm(sp * 5.0);
    vec3 ocean = mix(vec3(0.015, 0.08, 0.20), baseColor * 0.5, 0.30);
    vec3 shallow = ocean * 1.9 + vec3(0.0, 0.05, 0.07);
    vec3 land = mix(baseColor * 0.5 + vec3(0.10, 0.09, 0.02), vec3(0.22, 0.28, 0.11), 0.5);
    land = mix(land, land * 0.55 + vec3(0.17, 0.12, 0.05), smoothstep(0.4, 0.8, mount));
    vec3 surf = mix(ocean, land, landMask);
    surf = mix(surf, shallow, smoothstep(0.46, 0.50, cont) * (1.0 - landMask));
    float pole = smoothstep(0.76, 0.88, abs(dir.y) + fbm(sp * 4.0) * 0.09);
    surf = mix(surf, vec3(0.92, 0.96, 1.0), pole);
    albedo = surf;
    specStrength = (1.0 - landMask) * (1.0 - pole) * 0.85; // sun glints off the sea
    // City lights sparkle across the dark side of inhabited worlds
    if (nightLights > 0.5) {
      vec3 cp = dir * 24.0 + vec3(seed);
      vec3 id = floor(cp);
      vec3 f = fract(cp) - 0.5;
      vec3 hsh = hash33(id);
      float dcell = length(f - (hsh - 0.5) * 0.6);
      float spot = smoothstep(0.30, 0.03, dcell);
      float cityOn = step(0.60, hsh.x) * landMask * (1.0 - pole);
      emissive += vec3(1.0, 0.78, 0.42) * spot * cityOn * (1.0 - dayMask) * 2.6;
    }
  } else {
    // ── Tech world: dark panels laced with a pulsing neon grid ────────
    vec3 g = abs(fract(dir * 8.0 + seed) - 0.5);
    float line = smoothstep(0.44, 0.5, max(g.x, max(g.y, g.z)));
    float panel = fbm(sp * 3.0);
    albedo = baseColor * (0.15 + panel * 0.2);
    emissive += baseColor * line * (1.1 + 0.5 * sin(time * 2.0 + panel * 12.0));
  }

  // Day side sunlight, cool starlit night floor, warm terminator band.
  vec3 lit = albedo * (0.035 + day * 1.15);
  lit += albedo * vec3(1.0, 0.55, 0.3) * smoothstep(0.22, 0.0, abs(ndl)) * 0.55;

  // Specular glint (oceans / ice)
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 90.0) * specStrength * dayMask;
  lit += vec3(1.0, 0.95, 0.85) * spec;

  gl_FragColor = vec4(lit + emissive, 1.0);
}
`;

const ATMO_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vNormalW;
varying vec3 vPosW;

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const ATMO_FRAGMENT = `
precision highp float;
varying vec3 vNormalW;
varying vec3 vPosW;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform vec3 atmoColor;
uniform float atmoStrength;
uniform float atmoFalloff;

void main(void) {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  float ndv = clamp(dot(n, v), 0.0, 1.0);

  // Fresnel rim — bright at the limb, transparent at the center.
  float rim = pow(1.0 - ndv, atmoFalloff);

  // Day/night response — the limb glows where sunlight grazes it.
  vec3 sunDir = normalize(sunPosition - vPosW);
  float day = clamp(dot(n, sunDir) * 0.65 + 0.42, 0.0, 1.0);

  // Slight hue shift toward blue-white on the day side (scattering).
  vec3 col = mix(atmoColor, atmoColor * 0.55 + vec3(0.30, 0.36, 0.45), day * 0.35);

  float intensity = rim * (0.22 + 1.05 * day) * atmoStrength;
  gl_FragColor = vec4(col * intensity, intensity);
}
`;

let registered = false;

/** Registers all custom shaders in Babylon's shader store (idempotent). */
export function registerSpaceShaders(): void {
  if (registered) return;
  registered = true;

  Effect.ShadersStore['cinematicSkyVertexShader'] = SKY_VERTEX;
  Effect.ShadersStore['cinematicSkyFragmentShader'] = SKY_FRAGMENT;

  Effect.ShadersStore['cinematicSunVertexShader'] = SUN_VERTEX;
  Effect.ShadersStore['cinematicSunFragmentShader'] = SUN_FRAGMENT;

  Effect.ShadersStore['atmosphereRimVertexShader'] = ATMO_VERTEX;
  Effect.ShadersStore['atmosphereRimFragmentShader'] = ATMO_FRAGMENT;

  Effect.ShadersStore['cinematicPlanetVertexShader'] = PLANET_VERTEX;
  Effect.ShadersStore['cinematicPlanetFragmentShader'] = PLANET_FRAGMENT;
}
