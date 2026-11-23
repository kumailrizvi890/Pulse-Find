import * as THREE from "three";
import { ecgPoints } from "@/lib/pulse-bear";

// The Pulse bear model, built procedurally (landing only, Nov 22 2026).
// Matched to the brand video: a fluffy patchwork plush in maroon and
// charcoal, split down the middle with hand stitches, a big round
// head with the face recessed into it like a hood, a soft dark face
// screen with glowing LED eyes, blush and a smile, two-tone ears,
// fuzzy antennae with glowing tips, a maroon belly patch outlined in
// stitches, and a neon pink ECG across the belly.
//
// The fluff is shell fur: each plush part gets an instanced stack of
// slightly inflated copies that keep only scattered strand pixels,
// darker at the root and lighter at the tip, which reads as real
// pile at a fraction of the cost of geometry. One draw call per
// part. Imported only by PulseBear3D, which is only ever loaded
// through next/dynamic with ssr: false.

export const MAROON = "#5e1b26";
export const MAROON_LIGHT = "#6f2330";
export const CHARCOAL = "#28262b";
export const CHARCOAL_LIGHT = "#323036";
const STITCH = "#d9c3ac";
/** Points in the belly ECG polyline (see ecgPoints). */
const ECG_N = ecgPoints().length;

export interface FaceState {
  lookX: number;
  lookY: number;
  blink: number;
  happy: number;
  mouth: number;
}

export interface PulseRig {
  scene: THREE.Scene;
  root: THREE.Group;
  bear: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  arms: THREE.Group[];
  antennae: { pivot: THREE.Group; side: number; a: number; v: number }[];
  shadow: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  ecg: { uKnobGlow: { value: number }; uEcgHead: { value: number }; uEcgBeat: { value: number } };
  haloMat: THREE.SpriteMaterial;
  stage: { uPhase: { value: number }; uBeat: { value: number } };
  stageRimGlow: THREE.MeshBasicMaterial;
  space: { uTime: { value: number }; uBeat: { value: number } };
  craft: THREE.Group;
  updateCraft: (t: number, beat: number) => void;
  setHatch: (open: number) => void;
  chest: THREE.PointLight;
  knobMat: THREE.MeshStandardMaterial;
  burst: THREE.Points;
  burstMat: THREE.PointsMaterial;
  burstPos: Float32Array;
  burstVel: Float32Array;
  setFace: (s: FaceState) => void;
  dispose: () => void;
}

// ---------- textures ----------

export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.8)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- the face: drawn on a canvas, mapped onto the face screen ----------

const FACE_W = 480;
const FACE_H = 400;
/** Face screen extents in head units: x -0.6..0.6, y -0.53..0.47. */
const FACE_X = 0.6;
const FACE_Y0 = -0.53;
const FACE_Y1 = 0.47;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function drawFace(g: CanvasRenderingContext2D, s: FaceState) {
  g.clearRect(0, 0, FACE_W, FACE_H);
  g.fillStyle = "#000";
  g.fillRect(0, 0, FACE_W, FACE_H);

  const ox = s.lookX * 22;
  const oy = s.lookY * 16;

  // Blush: two soft pink cheeks under the eyes.
  for (const cx of [92, 388]) {
    const grad = g.createRadialGradient(cx + ox * 0.5, 242 + oy * 0.5, 0, cx + ox * 0.5, 242 + oy * 0.5, 46);
    grad.addColorStop(0, `rgba(255, 92, 128, ${0.42 + s.happy * 0.2})`);
    grad.addColorStop(1, "rgba(255, 92, 128, 0)");
    g.fillStyle = grad;
    g.fillRect(cx - 60 + ox, 180 + oy, 120, 120);
  }

  // Eyes (Nov 23 2026: white with a pink-red glow, not amber): tall
  // glowing LED ovals with a dot grid and two sparkles,
  // or happy ^ ^ arcs when he is delighted.
  const eyeW = 62;
  const eyeH = 92;
  for (const cx of [134, 346]) {
    const x = cx + ox;
    const y = 150 + oy;
    if (s.happy > 0.55) {
      g.save();
      g.strokeStyle = "#ffe8ee";
      g.lineWidth = 16;
      g.lineCap = "round";
      g.shadowColor = "#ff3d63";
      g.shadowBlur = 26;
      g.beginPath();
      g.arc(x, y + 14, 30, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
      g.restore();
      continue;
    }
    const h = Math.max(8, eyeH * (1 - s.blink) * (1 - s.happy * 0.3));
    g.save();
    g.shadowColor = "#ff3d63";
    g.shadowBlur = 34;
    const grad = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.55, "#fff1f4");
    grad.addColorStop(1, "#ffc2cf");
    g.fillStyle = grad;
    roundRect(g, x - eyeW / 2, y - h / 2, eyeW, h, 28);
    g.fill();
    g.restore();
    // LED grid, clipped to the eye.
    g.save();
    roundRect(g, x - eyeW / 2, y - h / 2, eyeW, h, 28);
    g.clip();
    g.fillStyle = "rgba(150, 30, 60, 0.18)";
    for (let gx = x - eyeW / 2; gx < x + eyeW / 2; gx += 7) g.fillRect(gx, y - h / 2, 1.5, h);
    for (let gy = y - h / 2; gy < y + h / 2; gy += 7) g.fillRect(x - eyeW / 2, gy, eyeW, 1.5);
    g.restore();
    if (h > 40) {
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath();
      g.arc(x - 12, y - h / 2 + 22, 9, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x + 10, y - h / 2 + 40, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Mouth: a small smile that opens into a grin.
  const mx = 240 + ox;
  const my = 250 + oy;
  g.save();
  g.shadowColor = "#ff3d63";
  g.shadowBlur = 18;
  if (s.mouth < 0.3) {
    g.strokeStyle = "#ffe8ee";
    g.lineWidth = 10;
    g.lineCap = "round";
    g.beginPath();
    g.arc(mx, my - 16, 26, Math.PI * 0.2, Math.PI * 0.8);
    g.stroke();
  } else {
    const open = Math.min(1, s.mouth);
    const w = 34 + open * 6;
    const d = 18 + open * 18;
    g.fillStyle = "#ffd3dd";
    g.beginPath();
    g.moveTo(mx - w, my - 6);
    g.lineTo(mx + w, my - 6);
    g.bezierCurveTo(mx + w, my + d, mx - w, my + d, mx - w, my - 6);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#ff5a76";
    g.beginPath();
    g.ellipse(mx, my - 6 + d * 0.62, w * 0.55, d * 0.32, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------- materials ----------

const FABRIC_COMMON = `
varying vec3 vObjPos;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uStitch; uniform vec3 uScale; uniform vec3 uMeshPos;
uniform float uSeam; uniform float uSeamAxis; uniform float uRim; uniform float uHole; uniform float uSeamH; uniform float uGlowOn; uniform float uKnobGlow;
uniform float uEcgOn; uniform float uEcgHead; uniform float uEcgBeat; uniform vec2 uEcgPts[ECG_N];
float pfSeamCoord() { return uSeamAxis < 0.5 ? vObjPos.x : vObjPos.z; }
float pfHoleSdf() {
  vec2 p = vObjPos.xy * uScale.xy - vec2(0.0, -0.03);
  vec2 q = abs(p) - vec2(0.5, 0.36) + 0.26;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.26;
}
vec3 pfBase() {
  float side = step(0.0, vObjPos.x);
  return mix(uA, uB, side);
}
float pfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pfNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pfHash(i), pfHash(i + vec3(1,0,0)), f.x), mix(pfHash(i + vec3(0,1,0)), pfHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pfHash(i + vec3(0,0,1)), pfHash(i + vec3(1,0,1)), f.x), mix(pfHash(i + vec3(0,1,1)), pfHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// Whip stitch: short slanted thread stitches crossing a seam. u is the
// distance across the seam, v the distance along it, both in model
// units. Returns the thread mask, 0..1.
float pfWhip(float u, float v) {
  float per = 0.048;
  float k = (fract(v / per) - 0.5) * per;
  float slant = k - u * 0.85;
  float onLine = 1.0 - smoothstep(0.0045, 0.0075, abs(slant));
  float inLen = 1.0 - smoothstep(0.017, 0.021, abs(u));
  return onLine * inLen;
}
// Running stitch: dashes of thread laid along the seam line, the way
// the centre split of the video's plush is sewn.
float pfRun(float u, float v) {
  float per = 0.05;
  float dash = 1.0 - smoothstep(0.58, 0.66, fract(v / per));
  float onLine = 1.0 - smoothstep(0.0045, 0.0075, abs(u));
  return dash * onLine;
}
// Every seam on this part: x = stitch thread mask, y = distance to
// the nearest seam (for the groove the pile dips into).
vec2 pfSeams() {
  float m = 0.0; float g = 1.0;
  if (uSeam > 0.5) {
    float u; float v;
    if (uSeamAxis < 0.5) { u = vObjPos.x * uScale.x; v = atan(vObjPos.y, vObjPos.z) * 0.5 * (uScale.y + uScale.z); }
    else { u = vObjPos.z * uScale.z; v = atan(vObjPos.y, vObjPos.x) * 0.5 * (uScale.x + uScale.y); }
    m = max(m, uSeamAxis < 0.5 ? pfRun(u, v) : pfWhip(u, v)); g = min(g, abs(u));
  }
  if (uSeamH > 0.5 && vObjPos.z < 0.0) {
    float u = vObjPos.y * uScale.y;
    float v = atan(vObjPos.x, -vObjPos.z) * 0.5 * (uScale.x + uScale.z);
    m = max(m, pfRun(u, v)); g = min(g, abs(u));
  }
  if (uRim > 0.5 && vObjPos.z > 0.0) {
    float axy = 0.5 * (uScale.x + uScale.y);
    float u = (length(vObjPos.xy) - 0.93) * axy;
    float v = atan(vObjPos.y, vObjPos.x) * axy;
    m = max(m, pfWhip(u, v)); g = min(g, abs(u));
  }
  return vec2(m, g);
}
// Distance (in torso units) from this point of fabric to the ECG
// polyline sewn across the belly, and how far along the line it is.
float pfEcg(out float along) {
  along = 0.0;
  if (uEcgOn < 0.5) return 1e3;
  vec3 tp = vObjPos * uScale + uMeshPos;
  if (tp.z < 0.25) return 1e3;
  float total = 0.0;
  for (int i = 0; i < ECG_N - 1; i++) total += distance(uEcgPts[i], uEcgPts[i + 1]);
  float best = 1e3; float acc = 0.0;
  for (int i = 0; i < ECG_N - 1; i++) {
    vec2 a = uEcgPts[i]; vec2 ab = uEcgPts[i + 1] - a; float L = length(ab);
    float h = clamp(dot(tp.xy - a, ab) / (L * L), 0.0, 1.0);
    float d = length(tp.xy - a - ab * h);
    if (d < best) { best = d; along = (acc + h * L) / total; }
    acc += L;
  }
  return best;
}
// The ECG light as it reaches this layer of fabric: a hot red core
// under the pile, a deeper red bloom soaking into the fibres around it,
// a travelling bright pulse, all lifted by the heartbeat. depth is 0
// at the fabric, 1 at the fur tips: the core fades with depth (the
// pile covers it) while the bloom spreads wider, so the line reads as
// sewn in and lit from inside rather than stuck on top.
vec3 pfEcgLight(float depth) {
  float along;
  float d = pfEcg(along);
  if (d > 0.5) return vec3(0.0);
  float trail = exp(-mod(uEcgHead - along, 1.0) * 6.0);
  float coreW = mix(0.011, 0.02, depth);
  float core = (1.0 - smoothstep(coreW * 0.4, coreW, d)) * mix(1.0, 0.35, depth);
  float bloom = exp(-d * mix(30.0, 16.0, depth)) * mix(0.55, 0.9, depth);
  float beat = 0.75 + 0.6 * uEcgBeat;
  return vec3(1.0, 0.06, 0.1) * core * (1.5 + 1.1 * trail) * beat + vec3(0.85, 0.02, 0.06) * bloom * (0.9 + 0.8 * trail) * beat;
}
`;

interface FabricSpec {
  a: string;
  b?: string;
  /** Seam: 0 none, 1 down local x (front/back split), 2 round local z (silhouette edge). */
  seam?: 0 | 1 | 2;
  rim?: boolean;
  /** A horizontal seam across the back, like the video's head and body. */
  backSeam?: boolean;
  /** Glows from inside with the heartbeat (the antenna knobs). */
  glow?: boolean;
  hole?: boolean;
  /** This part carries the belly ECG (torso-space mesh position). */
  ecgAt?: [number, number, number];
}

export type EcgShared = {
  uKnobGlow: { value: number };
  uEcgHead: { value: number };
  uEcgBeat: { value: number };
  uEcgPts: { value: THREE.Vector2[] };
};

function fabricUniforms(spec: FabricSpec, scale: THREE.Vector3, ecg: EcgShared) {
  return {
    ...ecg,
    uA: { value: new THREE.Color(spec.a) },
    uB: { value: new THREE.Color(spec.b ?? spec.a) },
    uStitch: { value: new THREE.Color(STITCH) },
    uScale: { value: scale.clone() },
    uMeshPos: { value: new THREE.Vector3(...(spec.ecgAt ?? [0, 0, 0])) },
    uSeam: { value: spec.seam ? 1 : 0 },
    uSeamAxis: { value: spec.seam === 2 ? 1 : 0 },
    uRim: { value: spec.rim ? 1 : 0 },
    uHole: { value: spec.hole ? 1 : 0 },
    uSeamH: { value: spec.backSeam ? 1 : 0 },
    uGlowOn: { value: spec.glow ? 1 : 0 },
    uEcgOn: { value: spec.ecgAt ? 1 : 0 },
  };
}

/** Velvet: plush brightens toward grazing angles, where the pile is seen side-on. */
const VELVET = `#include <emissivemap_fragment>
float pfFres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.2);
totalEmissiveRadiance += pfVB * pfFres * 0.5;`;

/** The base plush surface: colour split, stitches, velvet sheen, the ECG glowing through. */
function baseFabric(spec: FabricSpec, scale: THREE.Vector3, ecg: EcgShared) {
  const m = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 1,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#ffc4c4").multiplyScalar(0.35),
  });
  const uniforms = fabricUniforms(spec, scale, ecg);
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\n#define ECG_N ${ECG_N}\n${FABRIC_COMMON}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if (uHole > 0.5 && vObjPos.z > 0.0 && pfHoleSdf() < 0.0) discard;
vec3 base = pfBase();
vec2 sm = pfSeams();
float groove = 1.0 - smoothstep(0.0, 0.026, sm.y);
float holeAo = uHole > 0.5 && vObjPos.z > 0.0 ? smoothstep(0.0, 0.09, pfHoleSdf()) : 1.0;
base *= (1.0 - 0.6 * groove) * mix(0.35, 1.0, holeAo);
base *= 0.85 + 0.3 * pfNoise(vObjPos * uScale * 22.0);
vec3 pfVB = base * holeAo;
base = mix(base, uStitch, sm.x);
diffuseColor.rgb *= base;`,
      )
      .replace("#include <emissivemap_fragment>", `${VELVET}\ntotalEmissiveRadiance += pfEcgLight(0.0) + vec3(1.0, 0.08, 0.16) * uKnobGlow * uGlowOn * (0.6 + 0.4 * vObjPos.y);`);
  };
  m.customProgramCacheKey = () => "pulse-fabric-v5";
  return m;
}

/**
 * Velvet shell fur: drawn as an InstancedMesh, one instance per
 * shell. Each shell is pushed out along the normal by its height and
 * keeps the strands that reach it. The pile is short and dense, its
 * height rolls in soft clumps like fleece, and strand edges use alpha
 * to coverage so they blur into a soft nap instead of speckling.
 */
function furFabric(spec: FabricSpec, scale: THREE.Vector3, shells: number, length: number, ecg: EcgShared) {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, alphaTest: 0.5, alphaToCoverage: true });
  const avg = (scale.x + scale.y + scale.z) / 3;
  const uniforms = {
    ...fabricUniforms(spec, scale, ecg),
    uShells: { value: shells },
    uLen: { value: length / avg },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vObjPos;\nvarying float vShell;\nuniform float uShells;\nuniform float uLen;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vObjPos = position;
float h = float(gl_InstanceID + 1) / uShells;
vShell = h;
transformed += normalize(position) * uLen * h;
transformed.y -= uLen * h * h * 0.35;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\n#define ECG_N ${ECG_N}\n${FABRIC_COMMON}\nvarying float vShell;`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if (uHole > 0.5 && vObjPos.z > 0.0 && pfHoleSdf() < 0.015) discard;
vec3 rp = vObjPos * uScale;
// Fleece: the pile rolls in soft tufts, each tuft's fibres swirl a
// little with height, and tips catch more light than roots.
float tuft = pfNoise(rp * 24.0);
float swirl = pfNoise(rp * 70.0 + vec3(vShell * 2.5, 0.0, vShell * 1.5));
float strand = pfHash(floor(rp * 380.0));
float pile = (0.35 + 0.65 * tuft) * (0.62 + 0.38 * strand) * (0.8 + 0.4 * swirl);
vec2 sm = pfSeams();
float gap = 0.12 + 0.88 * smoothstep(0.004, 0.04, sm.y);
diffuseColor.a = clamp((pile * gap - vShell) * 6.0 + 0.5, 0.0, 1.0);
vec3 base = pfBase() * (0.8 + 0.35 * tuft) * (0.92 + 0.16 * swirl);
vec3 pfVB = base;
diffuseColor.rgb *= base * mix(0.62, 1.22, vShell * vShell);
// Thread sits on top of the pile, pulled across the groove.
if (sm.x > 0.5 && vShell < 0.55) {
  diffuseColor.a = 1.0;
  diffuseColor.rgb = uStitch * mix(0.75, 1.05, vShell / 0.55);
  pfVB = vec3(0.0);
}`,
      )
      .replace("#include <emissivemap_fragment>", `${VELVET}\ntotalEmissiveRadiance += pfEcgLight(vShell) + vec3(1.0, 0.1, 0.18) * uKnobGlow * uGlowOn * (0.5 + 0.8 * vShell) * (0.7 + 0.3 * vObjPos.y);`);
  };
  m.customProgramCacheKey = () => "pulse-fur-v4";
  return m;
}

// ---------- build ----------

export function buildPulse(tier: "full" | "lite" | "still"): PulseRig {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  const seg = tier === "full" ? [64, 44] : [40, 28];
  const SHELLS = tier === "full" ? 16 : 7;
  const FUR = 0.042;
  const sphere = track(new THREE.SphereGeometry(1, seg[0], seg[1]));
  const glow = track(glowTexture());

  // Belly ECG, shared by every material that carries it: the brand
  // waveform in torso space, a travelling pulse head, the heartbeat.
  const ecg: EcgShared = {
    uKnobGlow: { value: 0 },
    uEcgHead: { value: 0 },
    uEcgBeat: { value: 0 },
    uEcgPts: { value: ecgPoints().map((q) => new THREE.Vector2(q.x * 0.74, 1.06 + q.y * 0.24)) },
  };

  // Lights: warm key from the front left, the brand red as a rim
  // from behind so he reads on near-black, a soft white back light.
  const key = new THREE.DirectionalLight("#fff1e6", 2.6);
  key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight("#fd585d", 2.4);
  rim.position.set(3.5, 3, -4);
  const rimW = new THREE.DirectionalLight("#ffe2e2", 1.2);
  rimW.position.set(-3, 4, -4);
  const fill = new THREE.HemisphereLight("#d8d4ff", "#1a0b0e", 0.3);
  scene.add(key, rim, rimW, fill);

  /** A plush part: base surface plus its velvet fur shells. */
  const plush = (
    spec: FabricSpec,
    s: [number, number, number],
    p: [number, number, number],
    zone: string,
    furLen = FUR,
  ) => {
    const scale = new THREE.Vector3(...s);
    const m = new THREE.Mesh(sphere, track(baseFabric(spec, scale, ecg)));
    m.scale.copy(scale);
    m.position.set(...p);
    m.userData.zone = zone;
    if (SHELLS > 0 && furLen > 0) {
      const fur = new THREE.InstancedMesh(sphere, track(furFabric(spec, scale, SHELLS, furLen, ecg)), SHELLS);
      fur.raycast = () => {};
      m.add(fur);
    }
    return m;
  };

  const root = new THREE.Group();
  const bear = new THREE.Group();
  root.add(bear);
  scene.add(root);

  // Legs: his right maroon, his left charcoal, stitched round the edge.
  bear.add(plush({ a: MAROON, seam: 2 }, [0.3, 0.36, 0.32], [-0.33, 0.33, 0.02], "body"));
  bear.add(plush({ a: CHARCOAL, seam: 2 }, [0.3, 0.36, 0.32], [0.33, 0.33, 0.02], "body"));

  // Torso and belly patch. Both carry the ECG: it is drawn into the
  // fabric and the fur, not stuck on top, so it glows from inside.
  const torso = new THREE.Group();
  bear.add(torso);
  torso.add(plush({ a: CHARCOAL, b: CHARCOAL_LIGHT, seam: 1, backSeam: true, ecgAt: [0, 1.12, 0] }, [0.84, 0.9, 0.72], [0, 1.12, 0], "body"));
  torso.add(plush({ a: MAROON_LIGHT, rim: true, ecgAt: [0, 1.0, 0.56] }, [0.56, 0.52, 0.2], [0, 1.0, 0.56], "belly", 0.03));

  // A little tail on his back, like the video.
  torso.add(plush({ a: MAROON }, [0.12, 0.12, 0.1], [0.05, 0.62, -0.66], "body", 0.035));

  // Arms on shoulder pivots, both maroon, stitched along the edge.
  // Index 0 is his right arm (viewer left), the one that waves.
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.68, 1.5, 0.06);
    pivot.add(plush({ a: side < 0 ? MAROON : MAROON_LIGHT, seam: 2 }, [0.21, 0.4, 0.23], [0, -0.3, 0], "body"));
    torso.add(pivot);
    arms.push(pivot);
  }

  // A soft red light in front of the belly so the ECG also tints the
  // arms and the fur around it.
  const chest = new THREE.PointLight("#ff1a2e", 0.6, 1.8, 2);
  chest.position.set(0, 1.06, 1.0);
  torso.add(chest);

  // Head on a neck pivot. Sized like the video: a little wider than
  // the body, with the face screen filling most of the front.
  const neck = new THREE.Group();
  neck.position.set(0, 1.84, 0);
  torso.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.46, 0);
  neck.add(head);
  const HS: [number, number, number] = [0.9, 0.8, 0.82];
  head.add(plush({ a: CHARCOAL, b: MAROON, seam: 1, backSeam: true, hole: true }, HS, [0, 0, 0], "head", 0.046));

  // Face screen: recessed inside the head, soft and matte, with the
  // face canvas as its emissive map.
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = FACE_W;
  faceCanvas.height = FACE_H;
  const fg = faceCanvas.getContext("2d")!;
  const faceTex = track(new THREE.CanvasTexture(faceCanvas));
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const IN = 0.955;
  const faceGeo = track(new THREE.SphereGeometry(1, 56, 36, Math.PI / 2 - 1.0, 2.0, 0.9, 1.35));
  const pos = faceGeo.attributes.position;
  const uv = faceGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * HS[0] * IN;
    const y = pos.getY(i) * HS[1] * IN;
    uv.setXY(i, x / (2 * FACE_X) + 0.5, (y - FACE_Y0) / (FACE_Y1 - FACE_Y0));
  }
  uv.needsUpdate = true;
  const faceMat = track(
    new THREE.MeshStandardMaterial({
      color: "#1b1a1f",
      roughness: 0.9,
      emissive: "#ffffff",
      emissiveMap: faceTex,
      emissiveIntensity: 1.5,
    }),
  );
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.scale.set(HS[0] * IN, HS[1] * IN, HS[2] * IN);
  face.userData.zone = "head";
  head.add(face);
  let faceKey = "";
  const setFace = (s: FaceState) => {
    const k = [s.lookX, s.lookY, s.blink, s.happy, s.mouth].map((v) => Math.round(v * 40)).join(",");
    if (k === faceKey) return;
    faceKey = k;
    drawFace(fg, s);
    faceTex.needsUpdate = true;
  };
  setFace({ lookX: 0, lookY: 0, blink: 0, happy: 0, mouth: 0 });

  // Ears: charcoal with a maroon inside on his right, the reverse on his left.
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.66, 0.54, -0.1);
    ear.rotation.z = -side * 0.5;
    ear.add(plush({ a: side < 0 ? CHARCOAL : MAROON }, [0.29, 0.29, 0.18], [0, 0, 0], "head"));
    ear.add(plush({ a: side < 0 ? MAROON_LIGHT : CHARCOAL_LIGHT, rim: true }, [0.17, 0.17, 0.07], [0, -0.01, 0.13], "head", 0.022));
    head.add(ear);
  }

  // Antennae: short fuzzy stalks with round maroon knobs whose tips
  // glow pink with the heartbeat.
  const stalkGeo = track(new THREE.CylinderGeometry(0.05, 0.06, 0.36, 14));
  const stalkMat = track(baseFabric({ a: CHARCOAL }, new THREE.Vector3(0.06, 0.36, 0.06), ecg));
  const knobMat = track(
    new THREE.MeshStandardMaterial({ color: MAROON_LIGHT, roughness: 0.9, emissive: "#ff2a5a", emissiveIntensity: 0 }),
  );
  const haloMat = track(
    new THREE.SpriteMaterial({ map: glow, color: "#ff2a45", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  const antennae: PulseRig["antennae"] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.26, 0.7, 0);
    const stalk = new THREE.Mesh(stalkGeo, stalkMat);
    stalk.position.y = 0.17;
    stalk.userData.zone = "head";
    pivot.add(stalk);
    pivot.add(plush({ a: MAROON_LIGHT, glow: true }, [0.115, 0.115, 0.115], [0, 0.38, 0], "head", 0.03));
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.62);
    halo.position.y = 0.39;
    halo.raycast = () => {};
    pivot.add(halo);
    const tip = new THREE.Mesh(sphere, knobMat);
    tip.scale.setScalar(0.04);
    tip.position.set(0, 0.48, 0.03);
    pivot.add(tip);
    head.add(pivot);
    antennae.push({ pivot, side, a: 0, v: 0 });
  }

  // His craft: a little hover pod. A sleek saucer he stands on, with a
  // red neon rim, chasing running lights underneath and a glowing
  // thruster puffing exhaust, under a round glass cockpit bubble. The
  // whole craft bobs, sways and banks toward the pointer (driven from
  // PulseBear3D via updateCraft), so he reads as flying, not trapped.
  // It lives on the root, so it stays put while he jumps and spins.
  const craft = new THREE.Group();
  root.add(craft);
  // Materials (Nov 23 2026, fighter pass): a silver gunmetal body with
  // a lacquered clearcoat, polished chrome trim, dark carbon panels, and
  // the brand red as neon.
  const hullMat = track(
    new THREE.MeshPhysicalMaterial({ color: "#a3a7b3", roughness: 0.22, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 3.6 }),
  );
  const chromeMat = track(
    new THREE.MeshPhysicalMaterial({ color: "#d4d7e0", roughness: 0.14, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.8 }),
  );
  const darkMetalMat = track(
    new THREE.MeshPhysicalMaterial({ color: "#16161d", roughness: 0.38, metalness: 0.8, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.6 }),
  );
  const rimMat = track(new THREE.MeshBasicMaterial({ color: "#ff2a40", toneMapped: false }));
  const rimGlowMat = track(
    new THREE.MeshBasicMaterial({ color: "#ff2a40", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  const neonMat = track(new THREE.MeshBasicMaterial({ color: "#ff4a5e", toneMapped: false }));
  /** Decorative mesh: never intercepts taps meant for Pulse. */
  const deco = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D = craft) => {
    o.traverse((c) => ((c as THREE.Mesh).raycast = () => {}));
    parent.add(o);
    return o;
  };

  // Deck: the heartbeat ripple rolls out across the top on each beat.
  const stageUniforms = { uPhase: { value: 0 }, uBeat: { value: 0 } };
  const DECK_R = 0.74;
  const rippleMat = track(
    new THREE.ShaderMaterial({
      uniforms: stageUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vP; uniform float uPhase; uniform float uBeat;
void main(){
  float r = length(vP) / ${DECK_R.toFixed(2)};
  float wave = 0.3 + uPhase * 0.7;
  float ring = exp(-pow((r - wave) / 0.03, 2.0)) * (1.0 - uPhase);
  float rings = (0.5 + 0.5 * cos(r * 34.0)) * smoothstep(0.4, 1.0, r) * 0.05;
  float inner = exp(-r * r * 12.0) * (0.12 + 0.2 * uBeat);
  float a = (ring * 0.5 + rings + inner) * smoothstep(1.0, 0.96, r);
  gl_FragColor = vec4(vec3(1.0, 0.14, 0.24) * a, a);
}`,
    }),
  );
  const ripple = new THREE.Mesh(track(new THREE.CircleGeometry(DECK_R, 96)), rippleMat);
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.004;
  craft.add(ripple);

  // Thruster flame (as on the original pod): a flickering glow cone.
  const thrustUniforms = { uFlicker: { value: 1 } };
  const thrustMat = track(
    new THREE.ShaderMaterial({
      uniforms: thrustUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vY; varying vec3 vN; varying vec3 vV; uniform float uFlicker;
void main(){
  float h = clamp(0.5 - vY / 1.3, 0.0, 1.0);
  float edge = pow(abs(dot(vN, vV)), 1.4);
  float a = edge * pow(1.0 - h, 1.6) * 0.75 * uFlicker;
  vec3 c = mix(vec3(1.0, 0.75, 0.6), vec3(1.0, 0.12, 0.22), smoothstep(0.0, 0.5, h));
  gl_FragColor = vec4(c * a, a);
}`,
    }),
  );
  let er = 72;
  const erand = () => ((er = (er * 1664525 + 1013904223) >>> 0) / 4294967296);
  const spaceUniforms = { uTime: { value: 0 }, uBeat: { value: 0 } };
  // Exhaust sparks: points that stream out of a nozzle (local -y).
  const EXHAUST = tier === "full" ? 40 : 20;
  const exhaustGeo = () => {
    const pos = new Float32Array(EXHAUST * 3);
    const seed = new Float32Array(EXHAUST);
    for (let i = 0; i < EXHAUST; i++) {
      pos[i * 3] = (erand() - 0.5) * 0.3;
      pos[i * 3 + 2] = (erand() - 0.5) * 0.3;
      seed[i] = erand();
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    return g;
  };
  const exMat = track(
    new THREE.ShaderMaterial({
      uniforms: { ...spaceUniforms, uMap: { value: glow } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime; varying float vA;
void main(){
  float life = fract(uTime * (0.9 + seed * 0.6) + seed);
  vec3 p = position * (1.0 + life * 2.2);
  p.y = -0.9 - life * 1.6;
  vA = (1.0 - life) * (0.5 + 0.5 * seed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (10.0 + life * 18.0) * (6.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `uniform sampler2D uMap; varying float vA;
void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * 0.5; gl_FragColor = vec4(vec3(1.0, 0.3, 0.36) * a, a); }`,
    }),
  );

  // Cockpit bubble: a glass sphere seated in the deck. A fresnel shader,
  // not real transmission (that costs a whole extra render): bright at
  // grazing angles, two soft highlight streaks, a cool tint with the
  // red picked up from the deck below. Stars drift inside.
  const BUBBLE_R = 2.0;
  const BUBBLE_Y = 1.85;
  const glassMat = track(
    new THREE.ShaderMaterial({
      uniforms: spaceUniforms,
      transparent: true,
      depthWrite: false,
      // Purely additive in colour AND alpha: the glass only adds light,
      // so on the transparent canvas the space behind shows through
      // (plain additive blending wrote alpha 1 and blacked it out).
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL;
void main(){ vL = normalize(position); vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uBeat;
void main(){
  vec3 n = gl_FrontFacing ? vN : -vN;
  float fres = pow(1.0 - clamp(abs(dot(n, vV)), 0.0, 1.0), 2.6);
  float spec = exp(-pow((n.x + 0.42) / 0.12, 2.0)) * exp(-pow((n.y - 0.48) / 0.14, 2.0));
  float arc = exp(-pow((n.x - 0.5) / 0.04, 2.0)) * smoothstep(-0.2, 0.3, n.y) * smoothstep(0.85, 0.4, n.y);
  float redPick = smoothstep(-0.55, -0.82, vL.y) * (0.5 + 0.5 * uBeat);
  vec3 col = vec3(0.62, 0.76, 1.0) * fres * 0.5 + vec3(1.0) * (spec * 0.4 + arc * 0.22)
           + vec3(1.0, 0.16, 0.26) * redPick * (0.15 + fres * 0.5);
  col *= gl_FrontFacing ? 1.0 : 0.4;
  gl_FragColor = vec4(col, clamp(max(max(col.r, col.g), col.b), 0.0, 1.0));
}`,
    }),
  );
  // The glass has a door (Nov 23 2026): a curved panel cut from the
  // front of the bubble, hinged on its right edge, that swings open like
  // a door for Pulse to hop out and back in. The rest of the bubble is
  // fixed: the sphere minus the door's slice, plus the slice's bottom
  // (which sits down in the cradle).
  const DOOR_W = 1.5; // door width, as an angle around the bubble
  const DOOR_TOP = 0.62; // polar angle where the door starts (below the crown)
  const DOOR_BOTTOM = 2.45; // polar angle where the door ends
  const doorStart = Math.PI / 2 - DOOR_W / 2;
  const glassMesh = (geo: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(track(geo), glassMat);
    m.raycast = () => {};
    m.renderOrder = 10;
    return m;
  };
  // Fixed glass: the bubble minus the door's slice, plus the crown above
  // the door and the strip below it (which sits down in the cradle).
  const bubble = glassMesh(new THREE.SphereGeometry(BUBBLE_R, 72, 48, doorStart + DOOR_W, Math.PI * 2 - DOOR_W, 0, Math.PI));
  bubble.position.y = BUBBLE_Y;
  craft.add(bubble);
  const doorCrown = glassMesh(new THREE.SphereGeometry(BUBBLE_R, 24, 10, doorStart, DOOR_W, 0, DOOR_TOP));
  doorCrown.position.y = BUBBLE_Y;
  craft.add(doorCrown);
  const doorSill = glassMesh(new THREE.SphereGeometry(BUBBLE_R, 24, 8, doorStart, DOOR_W, DOOR_BOTTOM, Math.PI - DOOR_BOTTOM));
  doorSill.position.y = BUBBLE_Y;
  craft.add(doorSill);
  // Hinge: a vertical axis through the door's right edge at the equator.
  const hingePhi = doorStart + DOOR_W;
  const hingeX = -Math.cos(hingePhi) * BUBBLE_R;
  const hingeZ = Math.sin(hingePhi) * BUBBLE_R;
  const hatch = new THREE.Group();
  hatch.position.set(hingeX, BUBBLE_Y, hingeZ);
  craft.add(hatch);
  const door = glassMesh(new THREE.SphereGeometry(BUBBLE_R, 36, 36, doorStart, DOOR_W, DOOR_TOP, DOOR_BOTTOM - DOOR_TOP));
  door.position.set(-hingeX, 0, -hingeZ);
  hatch.add(door);

  // The door frame (Nov 23 2026): a machined portal set into the glass.
  // One closed loop round the opening with rounded corners, built as a
  // polished chrome rail, a dark rubber gasket just inside it, and a
  // fine neon line inside that, so it reads as a real hatch frame.
  const spherePt = (phi: number, theta: number, r = BUBBLE_R * 1.004) =>
    new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r);
  // A rounded-rectangle loop on the sphere, inset by `inset` radians.
  const portal = (inset: number, r: number) => {
    const p0 = doorStart + inset, p1 = doorStart + DOOR_W - inset;
    const t0 = DOOR_TOP + inset, t1 = DOOR_BOTTOM - inset;
    const c = 0.16; // corner radius, in radians
    const pts: THREE.Vector3[] = [];
    const arc = (cp: number, ct: number, a0: number) => {
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (Math.PI / 2) * (i / 6);
        pts.push(spherePt(cp + Math.cos(a) * c, ct + Math.sin(a) * c, r));
      }
    };
    const line = (pa: number, ta: number, pb: number, tb: number, n: number) => {
      for (let i = 1; i < n; i++) pts.push(spherePt(pa + ((pb - pa) * i) / n, ta + ((tb - ta) * i) / n, r));
    };
    arc(p0 + c, t0 + c, Math.PI); // top-left
    line(p0 + c, t0, p1 - c, t0, 10);
    arc(p1 - c, t0 + c, -Math.PI / 2); // top-right
    line(p1, t0 + c, p1, t1 - c, 16);
    arc(p1 - c, t1 - c, 0); // bottom-right
    line(p1 - c, t1, p0 + c, t1, 10);
    arc(p0 + c, t1 - c, Math.PI / 2); // bottom-left
    line(p0, t1 - c, p0, t0 + c, 16);
    return new THREE.CatmullRomCurve3(pts, true);
  };
  const loopTube = (inset: number, r: number, radius: number, mat: THREE.Material, parent: THREE.Object3D, offset?: THREE.Vector3) => {
    const m = new THREE.Mesh(track(new THREE.TubeGeometry(portal(inset, r), 220, radius, 10, true)), mat);
    if (offset) m.position.copy(offset);
    else m.position.y = BUBBLE_Y;
    m.raycast = () => {};
    parent.add(m);
    return m;
  };
  const seamMat = track(new THREE.MeshBasicMaterial({ color: "#ff5a70", transparent: true, opacity: 0.9, toneMapped: false }));
  const seamGlowMat = track(
    new THREE.MeshBasicMaterial({ color: "#ff2a45", transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  // Frame (fixed): chrome rail just outside the opening, gasket on it.
  loopTube(-0.035, BUBBLE_R * 1.01, 0.04, chromeMat, craft);
  loopTube(0.0, BUBBLE_R * 1.006, 0.022, darkMetalMat, craft);
  // Door (moves with it): a thin chrome bezel and the neon line inset.
  const doorOffset = new THREE.Vector3(-hingeX, 0, -hingeZ);
  loopTube(0.03, BUBBLE_R * 1.008, 0.016, chromeMat, hatch, doorOffset);
  loopTube(0.075, BUBBLE_R * 1.006, 0.008, seamMat, hatch, doorOffset);
  loopTube(0.075, BUBBLE_R * 1.006, 0.026, seamGlowMat, hatch, doorOffset);
  // Hinges: two chrome barrels on the hinge edge, lined up with it.
  const knuckleGeo = track(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 24));
  for (const theta of [1.05, 2.0]) {
    const a = spherePt(hingePhi + 0.04, theta - 0.06, BUBBLE_R * 1.03);
    const b = spherePt(hingePhi + 0.04, theta + 0.06, BUBBLE_R * 1.03);
    const k = new THREE.Mesh(knuckleGeo, chromeMat);
    k.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + BUBBLE_Y, (a.z + b.z) / 2);
    k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    k.raycast = () => {};
    craft.add(k);
  }
  // Handle: a slim recessed chrome grip near the free edge, with a red
  // status light above it.
  const handlePhi = doorStart + 0.2;
  const handleCurve = new THREE.CatmullRomCurve3([1.3, 1.45, 1.6, 1.75].map((th) => spherePt(handlePhi, th, BUBBLE_R * 1.045)));
  const handle = new THREE.Mesh(track(new THREE.TubeGeometry(handleCurve, 24, 0.026, 10, false)), chromeMat);
  handle.position.copy(doorOffset);
  handle.raycast = () => {};
  hatch.add(handle);
  for (const th of [1.3, 1.75]) {
    const post = new THREE.Mesh(
      track(new THREE.TubeGeometry(new THREE.LineCurve3(spherePt(handlePhi, th, BUBBLE_R * 1.004), spherePt(handlePhi, th, BUBBLE_R * 1.045)), 1, 0.016, 8, false)),
      chromeMat,
    );
    post.position.copy(doorOffset);
    post.raycast = () => {};
    hatch.add(post);
  }
  const statusLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.032, 12, 10)), rimMat);
  const ledPt = spherePt(handlePhi, 1.16, BUBBLE_R * 1.012);
  statusLed.position.set(ledPt.x - hingeX, ledPt.y, ledPt.z - hingeZ);
  hatch.add(statusLed);
  /** Open the door: 0 shut, 1 swung open (about 85 degrees, so it stays in frame). */
  const setHatch = (open: number) => {
    hatch.rotation.y = open * 1.5;
  };

  // The cradle: a metal cup rising out of the deck that the ball sits
  // in, hugging the glass, with a neon lip where glass meets metal, so
  // ball and base read as one craft. The ball's lower half is hidden
  // inside the hull.
  const sphereR = (y: number) => Math.sqrt(Math.max(0, BUBBLE_R * BUBBLE_R - (y - BUBBLE_Y) ** 2));
  const LIP_Y = 0.34;
  const cradleProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const y = -0.02 + ((LIP_Y + 0.02) * i) / 10;
    cradleProfile.push(new THREE.Vector2(sphereR(y) + 0.02, y));
  }
  const lipR = sphereR(LIP_Y) + 0.02;
  cradleProfile.push(new THREE.Vector2(lipR + 0.1, LIP_Y + 0.01));
  cradleProfile.push(new THREE.Vector2(lipR + 0.16, LIP_Y - 0.06));
  cradleProfile.push(new THREE.Vector2(lipR + 0.26, 0.1));
  cradleProfile.push(new THREE.Vector2(1.75, -0.3));
  const cradleMat = track(
    new THREE.MeshPhysicalMaterial({ color: "#24222b", roughness: 0.22, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.8, side: THREE.DoubleSide }),
  );
  const cradle = new THREE.Mesh(track(new THREE.LatheGeometry(cradleProfile, 96)), cradleMat);
  cradle.raycast = () => {};
  craft.add(cradle);
  const lip = new THREE.Mesh(track(new THREE.TorusGeometry(lipR + 0.05, 0.014, 10, 128)), rimMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = LIP_Y + 0.012;
  craft.add(lip);
  const lipGlow = new THREE.Mesh(track(new THREE.TorusGeometry(lipR + 0.05, 0.06, 10, 128)), rimGlowMat);
  lipGlow.rotation.x = Math.PI / 2;
  lipGlow.position.y = LIP_Y + 0.012;
  craft.add(lipGlow);
  // A chrome collar where the glass seats into the cradle, and a ring of
  // small red indicator lights set into the cradle's slope.
  const seat = new THREE.Mesh(track(new THREE.TorusGeometry(lipR + 0.12, 0.028, 14, 128)), chromeMat);
  seat.rotation.x = Math.PI / 2;
  seat.position.y = LIP_Y - 0.03;
  seat.raycast = () => {};
  craft.add(seat);
  const slopeR0 = lipR + 0.26;
  const INDICATORS = 12;
  const indGeo = track(new THREE.BoxGeometry(0.11, 0.022, 0.03));
  for (let i = 0; i < INDICATORS; i++) {
    const a = (i / INDICATORS) * Math.PI * 2 + 0.13;
    const r = slopeR0 + (1.62 - slopeR0) * 0.45;
    const y = 0.1 + (-0.02 - 0.1) * 0.45 + 0.012;
    const ind = new THREE.Mesh(indGeo, rimMat);
    ind.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    ind.rotation.y = -a + Math.PI / 2;
    ind.raycast = () => {};
    craft.add(ind);
  }

  // ---------- the fighter (Nov 23 2026) ----------
  // The pod becomes a little starfighter: the glass canopy sits in a
  // chrome frame on a silver body, with a rounded nose below it, swept
  // wings out to the sides with red vents in their tips, a spine over
  // the canopy carrying two engines that burn red, neon trim lines and
  // holographic screens in the cockpit.
  const C = new THREE.Vector3(0, BUBBLE_Y, 0);

  // Canopy frame: a thick silver ring round the glass, a chrome lip and
  // a neon line just outside it, with a chase of lights round the ring.
  const frame = deco(new THREE.Mesh(track(new THREE.TorusGeometry(BUBBLE_R + 0.1, 0.17, 24, 160)), hullMat));
  frame.position.copy(C);
  frame.position.z = -0.15;
  const frameLip = deco(new THREE.Mesh(track(new THREE.TorusGeometry(BUBBLE_R + 0.0, 0.035, 14, 160)), chromeMat));
  frameLip.position.copy(C);
  frameLip.position.z = 0.02;
  const frameNeon = deco(new THREE.Mesh(track(new THREE.TorusGeometry(BUBBLE_R + 0.28, 0.014, 10, 180)), neonMat));
  frameNeon.position.copy(C);
  frameNeon.position.z = -0.08;
  const frameNeonGlow = deco(new THREE.Mesh(track(new THREE.TorusGeometry(BUBBLE_R + 0.28, 0.06, 10, 180)), rimGlowMat));
  frameNeonGlow.position.copy(frameNeon.position);
  const LIGHTS = 18;
  const lightGeo = track(new THREE.SphereGeometry(0.03, 10, 8));
  const runLights: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < LIGHTS; i++) {
    const m = track(new THREE.MeshBasicMaterial({ color: "#ff4a5e", transparent: true, opacity: 0.3, toneMapped: false }));
    const a = (i / LIGHTS) * Math.PI * 2;
    const l = deco(new THREE.Mesh(lightGeo, m));
    l.position.set(Math.cos(a) * (BUBBLE_R + 0.18), BUBBLE_Y + Math.sin(a) * (BUBBLE_R + 0.18), 0.03);
    runLights.push(m);
  }

  // Nose: a rounded silver chin under the canopy, with a neon line across
  // it, two red light bars and a dark grille.
  const NOSE_C = new THREE.Vector3(0, -0.55, 0.55);
  const NOSE_S = new THREE.Vector3(2.25, 0.72, 1.75);
  const nose = deco(new THREE.Mesh(track(new THREE.SphereGeometry(1, 64, 32)), hullMat));
  nose.position.copy(NOSE_C);
  nose.scale.copy(NOSE_S);
  const noseZ = (x: number, y: number, out = 0.01) => {
    const q = 1 - (x / NOSE_S.x) ** 2 - ((y - NOSE_C.y) / NOSE_S.y) ** 2;
    return NOSE_C.z + NOSE_S.z * Math.sqrt(Math.max(0, q)) + out;
  };
  const noseLine = (y: number, span: number, radius: number, mat: THREE.Material) => {
    const pts = Array.from({ length: 41 }, (_, i) => {
      const x = -span + (2 * span * i) / 40;
      return new THREE.Vector3(x, y, noseZ(x, y, 0.012));
    });
    return deco(new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, radius, 8, false)), mat));
  };
  noseLine(-0.22, 1.85, 0.016, neonMat);
  noseLine(-0.22, 1.85, 0.05, rimGlowMat);
  noseLine(-0.62, 1.6, 0.022, chromeMat);
  const barGeo = track(new THREE.BoxGeometry(0.5, 0.1, 0.06));
  for (const side of [-1, 1]) {
    const x = side * 1.2;
    const y = -0.42;
    const bar = deco(new THREE.Mesh(barGeo, neonMat));
    bar.position.set(x, y, noseZ(x, y, 0.0));
    bar.rotation.y = side * 0.55;
    const glowBar = deco(new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.2, 0.02)), rimGlowMat));
    glowBar.position.copy(bar.position);
    glowBar.rotation.y = bar.rotation.y;
  }
  const grille = deco(new THREE.Group());
  grille.position.set(0, -0.86, noseZ(0, -0.86, -0.02));
  grille.rotation.x = 0.35;
  const grilleBack = deco(new THREE.Mesh(track(new THREE.BoxGeometry(1.0, 0.26, 0.06)), darkMetalMat), grille);
  grilleBack.position.z = 0;
  for (let i = 0; i < 4; i++) {
    const slat = deco(new THREE.Mesh(track(new THREE.BoxGeometry(0.94, 0.022, 0.04)), chromeMat), grille);
    slat.position.set(0, -0.09 + i * 0.06, 0.04);
  }

  // Spine over the canopy, carrying the engines.
  const spine = deco(new THREE.Mesh(track(new THREE.CapsuleGeometry(0.42, 1.6, 10, 24)), hullMat));
  spine.rotation.x = Math.PI / 2;
  spine.scale.set(1.25, 1, 0.75);
  spine.position.set(0, BUBBLE_Y + BUBBLE_R + 0.05, -1.05);
  const spinePanel = deco(new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.06, 1.3)), darkMetalMat));
  spinePanel.position.set(0, BUBBLE_Y + BUBBLE_R + 0.36, -0.95);
  const spineNeon = deco(new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.03, 0.05)), neonMat));
  spineNeon.position.set(0, BUBBLE_Y + BUBBLE_R + 0.24, -0.2);

  // Thruster, as on the original pod: a hot nozzle disc in a chrome
  // collar, a flickering glow cone and exhaust puffs, all moved down to
  // sit under the bottom of the new body.
  const thruster = deco(new THREE.Group());
  thruster.position.set(0, NOSE_C.y - NOSE_S.y + 0.74, NOSE_C.z - 0.1);
  const nozzle = deco(new THREE.Mesh(track(new THREE.CircleGeometry(0.3, 40)), rimMat), thruster);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.y = -0.845;
  const collar = deco(new THREE.Mesh(track(new THREE.TorusGeometry(0.34, 0.035, 14, 96)), chromeMat), thruster);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.84;
  const thrust = deco(new THREE.Mesh(track(new THREE.CylinderGeometry(0.28, 0.06, 1.3, 32, 1, true)), thrustMat), thruster);
  thrust.position.y = -0.85 - 0.65;
  const exhaust = deco(new THREE.Points(exhaustGeo(), exMat), thruster);
  exhaust.frustumCulled = false;

  // Cockpit screens: small holographic panels floating in front of Pulse,
  // red line-art UI drawn on a canvas, additive so they glow.
  const holoCanvas = document.createElement("canvas");
  holoCanvas.width = 256;
  holoCanvas.height = 160;
  {
    const g = holoCanvas.getContext("2d")!;
    g.strokeStyle = "rgba(255, 90, 110, 0.95)";
    g.fillStyle = "rgba(255, 60, 80, 0.16)";
    g.lineWidth = 3;
    g.fillRect(4, 4, 248, 152);
    g.strokeRect(4, 4, 248, 152);
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(18, 26 + i * 16);
      g.lineTo(18 + 60 + ((i * 37) % 70), 26 + i * 16);
      g.stroke();
    }
    g.beginPath();
    g.arc(196, 52, 30, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(196, 52, 30, -Math.PI / 2, Math.PI * 0.8);
    g.lineWidth = 6;
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(14, 124);
    [[60, 124], [74, 104], [88, 146], [102, 112], [116, 124], [242, 124]].forEach(([x, y]) => g.lineTo(x, y));
    g.stroke();
  }
  const holoTex = track(new THREE.CanvasTexture(holoCanvas));
  holoTex.colorSpace = THREE.SRGBColorSpace;
  const holoMat = track(
    new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  const holoGeo = track(new THREE.PlaneGeometry(0.62, 0.39));
  for (const [x, y, z, ry, rx] of [
    [-1.15, 0.95, 0.7, 0.55, -0.2],
    [1.15, 0.95, 0.7, -0.55, -0.2],
    [-0.7, 0.62, 1.15, 0.3, -0.45],
    [0.7, 0.62, 1.15, -0.3, -0.45],
  ] as [number, number, number, number, number][]) {
    const h = deco(new THREE.Mesh(holoGeo, holoMat));
    h.position.set(x, y, z);
    h.rotation.set(rx, ry, 0);
    h.renderOrder = 11;
  }

  const STARS = tier === "full" ? 90 : 45;
  const starPos = new Float32Array(STARS * 3);
  const starSeed = new Float32Array(STARS);
  for (let i = 0; i < STARS; i++) {
    let x = 0, y = 0, z = 0;
    do {
      x = (erand() * 2 - 1) * 1.8;
      y = (erand() * 2 - 1) * 1.8;
      z = (erand() * 2 - 1) * 1.8;
    } while (x * x + y * y + z * z > 1.8 * 1.8 || y + BUBBLE_Y < 0.2);
    starPos[i * 3] = x;
    starPos[i * 3 + 1] = y + BUBBLE_Y;
    starPos[i * 3 + 2] = z;
    starSeed[i] = erand();
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("seed", new THREE.BufferAttribute(starSeed, 1));
  const starMat = track(
    new THREE.ShaderMaterial({
      uniforms: { ...spaceUniforms, uMap: { value: glow } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime; varying float vTw; varying float vSeed;
void main(){
  vec3 p = position;
  float a = uTime * (0.05 + seed * 0.05);
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  vTw = 0.45 + 0.55 * sin(uTime * (1.5 + seed * 3.0) + seed * 40.0);
  vSeed = seed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (4.0 + seed * 7.0) * (6.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `uniform sampler2D uMap; varying float vTw; varying float vSeed;
void main(){
  float a = texture2D(uMap, gl_PointCoord).a * vTw;
  vec3 c = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.35, 0.42), step(0.72, vSeed));
  gl_FragColor = vec4(c * a, a);
}`,
    }),
  );
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.raycast = () => {};
  stars.renderOrder = 9;
  craft.add(stars);

  /** Per-frame craft animation: running-light chase, thruster flicker. */
  const updateCraft = (t: number, beat: number) => {
    for (let i = 0; i < LIGHTS; i++) {
      const d = (((t * 1.6 - i / LIGHTS) % 1) + 1) % 1;
      runLights[i].opacity = 0.25 + 0.75 * Math.exp(-d * 9);
    }
    thrustUniforms.uFlicker.value = 0.8 + 0.12 * Math.sin(t * 37) + 0.08 * Math.sin(t * 59 + 1.3) + beat * 0.15;
  };

  // Soft contact shadow.
  const shadowMat = track(new THREE.MeshBasicMaterial({ map: track(shadowTexture()), transparent: true, depthWrite: false }));
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(2.8, 1.5)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  root.add(shadow);

  // Heartbeat burst particles (belly taps).
  const BURST = tier === "full" ? 56 : 28;
  const burstPos = new Float32Array(BURST * 3);
  const burstVel = new Float32Array(BURST * 3);
  const burstGeo = track(new THREE.BufferGeometry());
  burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
  const burstMat = track(
    new THREE.PointsMaterial({ map: glow, color: "#ff5a7a", size: 0.17, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  const burst = new THREE.Points(burstGeo, burstMat);
  burst.frustumCulled = false;
  torso.add(burst);

  return {
    scene,
    root,
    bear,
    torso,
    neck,
    arms,
    antennae,
    shadow,
    shadowMat,
    ecg,
    haloMat,
    stage: stageUniforms,
    stageRimGlow: rimGlowMat,
    space: spaceUniforms,
    craft,
    updateCraft,
    setHatch,
    chest,
    knobMat,
    burst,
    burstMat,
    burstPos,
    burstVel,
    setFace,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
