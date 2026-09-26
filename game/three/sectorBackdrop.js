import * as THREE from 'three'

// Fondo procedural animado por sector (meta/sectors.js). Un único plano lejano con un shader:
// nebulosa con domain-warp en la paleta del sector + un elemento propio que se anima.
// El centro queda oscuro (ahí se juega) y el color vive hacia los bordes.
//
// mode: 0 cinturón · 1 filamentos · 2 auroras · 3 esporas · 4 brasas · 5 anillo roto ·
//       6 vacío · 7 corona estelar · 8 agujero negro · 9 enjambre

const SECTOR_LOOKS = [
  { mode: 0, a: 0x0a1840, b: 0x3a1f6e, c: 0x6a8cff },
  { mode: 1, a: 0x2a0612, b: 0x8a1030, c: 0xff3d8a },
  { mode: 2, a: 0x06202e, b: 0x2a7a90, c: 0xbff6ff },
  { mode: 3, a: 0x0e1a06, b: 0x3f6a10, c: 0xffb02e },
  { mode: 4, a: 0x241006, b: 0x7a3a0c, c: 0xffc060 },
  { mode: 5, a: 0x06201e, b: 0x1f6a64, c: 0xe8d2a0 },
  { mode: 6, a: 0x07080c, b: 0x1c2230, c: 0x5a6a80 },
  { mode: 7, a: 0x1a1206, b: 0x5a4012, c: 0xfff0c0 },
  { mode: 8, a: 0x120a20, b: 0x5a1a50, c: 0xff8a3d },
  { mode: 9, a: 0x14061e, b: 0x5a1470, c: 0xff5ad9 },
]

const frag = (octaves) => /* glsl */`
uniform float uTime;
uniform int uMode;
uniform vec3 uA, uB, uC;
uniform vec2 uOff;
uniform float uGain;
uniform float uAspect;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < ${octaves}; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
// Puntos que viven en una grilla (uno por celda con probabilidad keep), con desplazamiento animado.
float dots(vec2 g, float keep, float size, vec2 wobble) {
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id);
  vec2 o = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  o = o * 0.5 + wobble * vec2(sin(uTime * 0.7 + h * 6.28), cos(uTime * 0.6 + h * 9.1));
  return smoothstep(size, 0.0, length(f - o)) * step(1.0 - keep, h);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) + uOff;
  float hx = uAspect * 0.5; // medio ancho visible (y va de -0.5 a 0.5)
  float t = uTime;
  float spd = uMode == 4 ? 3.0 : 1.0;
  vec2 q = vec2(fbm(p * 3.0 + t * 0.01 * spd), fbm(p * 3.0 + vec2(5.2, 1.3) - t * 0.012 * spd));
  float n = fbm(p * 2.5 + q * 1.6 + t * 0.005 * spd);
  vec3 col = mix(uA, uB, smoothstep(0.3, 0.8, n));
  col = mix(col, uC, smoothstep(0.62, 0.95, fbm(p * 5.0 + q * 2.0)) * 0.6);
  float edge = smoothstep(0.06, 0.55, length((vUv - 0.5) * vec2(1.3, 1.0)));
  float breathe = 0.9 + 0.1 * sin(t * 0.3);
  vec3 outc = col * n * n * (0.3 + 1.1 * edge) * breathe;

  if (uMode == 0) {
    // Cinturón de asteroides diagonal que se desliza.
    float d = abs(p.y + p.x * 0.35 - 0.12);
    float belt = smoothstep(0.1, 0.0, d) * dots(p * 160.0 + vec2(t * 0.8, 0.0), 0.12, 0.3, vec2(0.0));
    outc += vec3(0.55, 0.6, 0.8) * belt * (0.3 + 0.7 * edge);
  } else if (uMode == 1) {
    // Filamentos brillantes que ondulan.
    float r = 1.0 - abs(fbm(p * 4.0 + q * 3.0 + t * 0.02) * 2.0 - 1.0);
    outc += uC * pow(r, 9.0) * 0.9 * edge;
  } else if (uMode == 2) {
    // Auroras: cortinas verdes que se mueven + destellos de hielo.
    float a = sin(p.x * 6.0 + t * 0.35 + fbm(p * 3.0 + t * 0.05) * 4.0);
    float cur = smoothstep(0.14, 0.0, abs(p.y - 0.33 - 0.07 * a)) * (0.5 + 0.5 * sin(p.x * 24.0 + t * 1.5));
    outc += vec3(0.15, 1.0, 0.55) * cur * 0.45;
    outc += uC * dots(p * 90.0, 0.05, 0.12, vec2(0.0)) * (0.5 + 0.5 * sin(t * 3.0 + p.x * 40.0)) * edge;
  } else if (uMode == 3) {
    // Esporas que laten.
    vec2 g = p * 18.0;
    float pulse = 0.5 + 0.5 * sin(t * 1.6 + hash(floor(g)) * 6.28);
    outc += uC * dots(g, 0.3, 0.09, vec2(0.2)) * pulse * (0.2 + edge);
    outc += vec3(0.4, 1.0, 0.2) * dots(g * 2.3 + 11.0, 0.2, 0.06, vec2(0.25)) * 0.5 * edge;
  } else if (uMode == 4) {
    // Brasas subiendo entre humo cálido.
    outc += uC * dots(p * vec2(34.0, 24.0) + vec2(0.0, -t * 0.9), 0.18, 0.1, vec2(0.25)) * (0.3 + edge);
  } else if (uMode == 5) {
    // Planeta con anillo partido en un borde.
    vec2 d = p - vec2(hx - 0.22, 0.28);
    float r = length(d);
    float disc = smoothstep(0.17, 0.165, r);
    float shade = clamp(dot(normalize(vec3(d, sqrt(max(0.0, 0.028 - r * r)))), normalize(vec3(-0.6, 0.5, 0.6))), 0.0, 1.0);
    vec3 planet = mix(uA * 2.0, uC, shade) * (0.7 + 0.3 * fbm(vec2(d.y * 30.0, t * 0.02)));
    vec2 rd = mat2(0.94, -0.34, 0.34, 0.94) * d;
    float er = length(vec2(rd.x, rd.y * 4.0));
    float ang = atan(rd.y, rd.x);
    float gap = smoothstep(0.2, 0.35, abs(ang - 1.1 - 0.05 * sin(t * 0.2)));
    float ring = smoothstep(0.02, 0.0, abs(er - 0.27)) * gap * (0.6 + 0.4 * noise(vec2(er * 200.0, 0.0)));
    float front = step(0.0, rd.y) + (1.0 - disc);
    outc = mix(outc, planet, disc);
    outc += uC * ring * 0.55 * min(front, 1.0);
    // escombros del anillo roto
    outc += uC * dots((p - vec2(hx - 0.22, 0.28)) * 70.0 + vec2(t * 0.3, 0.0), 0.06, 0.15, vec2(0.1)) * smoothstep(0.45, 0.2, r) * 0.6;
  } else if (uMode == 6) {
    // Vacío: casi nada, un parpadeo lejano ocasional.
    outc *= 0.45;
    outc += vec3(0.6, 0.7, 0.9) * dots(p * 60.0, 0.015, 0.1, vec2(0.0)) * (0.5 + 0.5 * sin(t * 0.8 + p.y * 30.0));
  } else if (uMode == 7) {
    // Estrella gigante en una esquina con corona y rayos.
    vec2 d = p - vec2(-hx + 0.1, 0.38);
    float r = length(d);
    float ang = atan(d.y, d.x);
    float glow = max(0.0, 0.018 / (r + 0.03) - 0.03);
    float rays = pow(noise(vec2(ang * 9.0, t * 0.35)), 4.0) * smoothstep(0.45, 0.1, r);
    float flare = pow(max(0.0, fbm(vec2(ang * 3.0 + t * 0.05, r * 6.0 - t * 0.3))), 3.0) * smoothstep(0.32, 0.11, r);
    outc += vec3(1.0, 0.78, 0.45) * (glow * 0.6 + rays * 0.35 + flare * 1.4);
    outc = mix(outc, vec3(1.0, 0.97, 0.88), smoothstep(0.11, 0.1, r));
  } else if (uMode == 8) {
    // Agujero negro con disco de acreción girando y anillo de lente.
    vec2 d = p - vec2(hx - 0.26, -0.24);
    vec2 e = vec2(d.x, d.y * 2.4);
    float r = length(e);
    float ang = atan(e.y, e.x);
    float swirl = fbm(vec2(ang * 3.0 + t * 0.5 - r * 14.0, r * 9.0));
    float disk = smoothstep(0.07, 0.1, r) * smoothstep(0.42, 0.14, r);
    outc += mix(uB * 2.0, uC, swirl) * disk * swirl * 1.6;
    float rr = length(d);
    outc *= smoothstep(0.06, 0.075, rr);
    outc += vec3(1.0, 0.8, 0.6) * smoothstep(0.008, 0.0, abs(rr - 0.08)) * 0.9;
  } else if (uMode == 9) {
    // Enjambre: miles de luces que se mueven como bandada.
    vec2 flow = vec2(sin(p.y * 3.0 + t * 0.25), cos(p.x * 3.0 - t * 0.2)) * 0.6;
    float sw = dots(p * 55.0 + flow * 3.0, 0.35, 0.09, vec2(0.35));
    float sw2 = dots(p * 90.0 - flow * 5.0 + 3.0, 0.3, 0.08, vec2(0.35));
    outc += uC * (sw + sw2 * 0.6) * (0.15 + 1.0 * edge) * (0.7 + 0.3 * sin(t * 2.0));
  }

  gl_FragColor = vec4(outc * uGain, 1.0);
  #include <colorspace_fragment>
}
`

export function createSectorBackdrop(sectorN = 1, lowGfx = false) {
  const look = SECTOR_LOOKS[(Math.max(1, sectorN) - 1) % SECTOR_LOOKS.length]
  const uniforms = {
    uTime: { value: 0 },
    uMode: { value: look.mode },
    uA: { value: new THREE.Color(look.a) },
    uB: { value: new THREE.Color(look.b) },
    uC: { value: new THREE.Color(look.c) },
    uOff: { value: new THREE.Vector2() },
    uGain: { value: 0.85 },
    uAspect: { value: 1.6 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: frag(lowGfx ? 3 : 5),
    depthWrite: false,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  mesh.position.z = -2400
  mesh.renderOrder = -100
  return {
    mesh,
    mode: look.mode,
    // ox/oy: desplazamiento de la vista respecto al centro del mundo (parallax muy lento).
    update(timeSec, ox, oy) {
      uniforms.uTime.value = timeSec
      uniforms.uOff.value.set(ox * 0.000012, -oy * 0.000012)
    },
    // Ajusta el plano para cubrir justo el frustum de la cámara de fondo (perspectiva).
    fit(camera) {
      const dist = camera.position.z - mesh.position.z
      const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.04
      mesh.scale.set(h * camera.aspect, h, 1)
      uniforms.uAspect.value = camera.aspect
    },
    dispose() { mesh.geometry.dispose(); mat.dispose() },
  }
}
