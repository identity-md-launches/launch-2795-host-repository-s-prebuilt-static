import { BLUE_STOPS, FACE_RGB, GOLD_STOPS, WELL_RGB, type Rgb } from './palette';

function vec3(rgb: Rgb): string {
  return `vec3(${rgb.map((c) => (c / 255).toFixed(4)).join(',')})`;
}

const stops = (name: string, list: readonly Rgb[]): string =>
  list.map((rgb, i) => `const vec3 ${name}${i + 1} = ${vec3(rgb)};`).join('\n');

export const FULLSCREEN_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const RAMPS = `
${stops('G', GOLD_STOPS)}
${stops('B', BLUE_STOPS)}
vec3 ramp(float heat, vec3 a, vec3 b, vec3 c, vec3 d) {
  float x = clamp(heat, 0.0, 1.0) * 4.0;
  if (x < 1.0) return a * x;
  if (x < 2.0) return mix(a, b, x - 1.0);
  if (x < 3.0) return mix(b, c, x - 2.0);
  return mix(c, d, x - 3.0);
}
vec3 goldRamp(float h) { return ramp(h, G1, G2, G3, G4); }
vec3 blueRamp(float h) { return ramp(h, B1, B2, B3, B4); }
`;

/** Seeds the bloom chain. Gold blooms hard, blue tiles stay crisp and only tint the room. */
export const BRIGHT_FRAG = `#version 300 es
precision highp float;
uniform highp sampler2D uCells;
in vec2 vUv;
out vec4 o;
${RAMPS}
void main() {
  ivec2 cell = ivec2(vec2(vUv.x, 1.0 - vUv.y) * vec2(textureSize(uCells, 0)));
  vec2 heat = texelFetch(uCells, cell, 0).rg;
  float g = heat.r * heat.r;
  float b = heat.g * heat.g;
  vec3 c = goldRamp(heat.r) * g + blueRamp(heat.g) * b * 0.16;
  o = vec4(c, 1.0);
}`;

export const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uStep;
in vec2 vUv;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUv) * 0.2270270;
  c += (texture(uTex, vUv + uStep * 1.3846153) + texture(uTex, vUv - uStep * 1.3846153)) * 0.3162162;
  c += (texture(uTex, vUv + uStep * 3.2307692) + texture(uTex, vUv - uStep * 3.2307692)) * 0.0702703;
  o = c;
}`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform highp sampler2D uCells;
uniform sampler2D uNear;
uniform sampler2D uFar;
uniform vec2 uRes;
uniform float uPitch;
uniform float uTransparent;
uniform float uPower;
in vec2 vUv;
out vec4 o;
${RAMPS}
const vec3 WELL = ${vec3(WELL_RGB)};
const vec3 FACE = ${vec3(FACE_RGB)};

float cellHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float gradientNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = frag / uPitch;
  vec2 id = floor(p);
  vec2 f = p - id - 0.5;
  float aa = 0.75 / uPitch;
  float px = 1.0 / uPitch;
  vec2 heat = texelFetch(uCells, ivec2(id), 0).rg;
  float bin = cellHash(id);

  float d = length(f);

  // The recessed lens of an unlit cell: dark rim, lit from above.
  float wellRadius = 0.40;
  float well = smoothstep(wellRadius + aa, wellRadius - aa, d);
  float lens = 0.72 + 0.62 * smoothstep(0.32, -0.34, f.y) * smoothstep(wellRadius, 0.12, d);
  vec3 col = FACE;
  if (uTransparent < 0.5) col = mix(col, WELL * lens * (0.86 + 0.28 * bin), well);
  else col = vec3(0.0);

  float covered = 0.0;

  // Blue square tile, with a one-step bevel lit from the top left.
  float tileHalf = 0.5 - max(1.0 * px, 0.045);
  float corner = 0.035;
  vec2 q = abs(f) - tileHalf + corner;
  float tileDist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  float tile = smoothstep(aa, -aa, tileDist);
  if (heat.g > 0.004) {
    float edge = max(1.4 * px, 0.07);
    float top = smoothstep(-tileHalf + edge + aa, -tileHalf + edge - aa, f.y);
    float left = smoothstep(-tileHalf + edge + aa, -tileHalf + edge - aa, f.x);
    float bottom = smoothstep(tileHalf - edge - aa, tileHalf - edge + aa, f.y);
    float right = smoothstep(tileHalf - edge - aa, tileHalf - edge + aa, f.x);
    vec3 face = blueRamp(heat.g) * (0.94 + 0.12 * bin);
    face += face * 0.34 * max(top, left * 0.55);
    face *= 1.0 - 0.42 * max(bottom, right * 0.6);
    float lit = smoothstep(0.0, 0.2, heat.g);
    col = mix(col, face, tile * lit);
    covered = max(covered, tile * lit);
  }

  // Gold round LED: a domed lens with a hot core and a small specular catch.
  if (heat.r > 0.004) {
    float radius = 0.435;
    float disc = smoothstep(radius + aa, radius - aa, d);
    vec3 face = goldRamp(heat.r) * (0.95 + 0.1 * bin);
    float dome = 1.0 - smoothstep(0.0, radius, d);
    face *= 0.86 + 0.3 * dome;
    float spec = smoothstep(0.13, 0.0, length(f - vec2(-0.135, -0.155)));
    face += vec3(1.0, 0.95, 0.8) * spec * 0.24 * smoothstep(0.4, 1.0, heat.r);
    float lit = smoothstep(0.0, 0.2, heat.r);
    col = mix(col, face, disc * lit);
    covered = max(covered, disc * lit);
  }

  // Glow lives in the gaps. Lit faces keep their exact palette colour.
  vec3 glow = texture(uNear, vUv).rgb * 1.5 + texture(uFar, vUv).rgb * 0.8;
  float energy = dot(glow, vec3(0.3, 0.55, 0.15));
  glow /= 1.0 + energy * 2.6;
  col += glow * (1.0 - covered * 0.92);
  col *= uPower;
  col += (gradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;

  if (uTransparent > 0.5) {
    // Bloom reaches the canvas edge, and on a stream that edge would show as a faint box.
    vec2 edge = min(vUv, 1.0 - vUv);
    col *= smoothstep(0.0, 0.05, min(edge.x * uRes.x / uRes.y, edge.y));
    float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.5, 0.0, 1.0);
    o = vec4(col, alpha);
    return;
  }
  o = vec4(col, 1.0);
}`;
