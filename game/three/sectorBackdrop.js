import * as THREE from 'three'

// Un plano, sin texturas. El centro oscuro deja legible la partida.
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
#define LOW_GFX ${octaves === 3 ? 1 : 0}
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
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < ${octaves}; i++) {
    v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5;
  }
  return v;
}
float dots(vec2 g, float keep, float size, vec2 wobble) {
  vec2 id = floor(g), f = fract(g) - 0.5;
  float h = hash(id);
  vec2 o = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.5;
  o += wobble * vec2(sin(uTime * 0.7 + h * 6.28), cos(uTime * 0.6 + h * 9.1));
  return (1.0 - smoothstep(0.0, size, length(f - o))) * step(1.0 - keep, h);
}
vec3 stars(vec2 p) {
  vec2 g = p * 14.0, id = floor(g);
  vec2 d = fract(g) - 0.25 - vec2(hash(id + 1.3), hash(id + 4.7)) * 0.5;
  float seed = hash(id + 51.0);
  float pin = exp(-length(d) * 160.0);
  float spikes = exp(-abs(d.x) * 300.0 - abs(d.y) * 23.0)
               + exp(-abs(d.y) * 300.0 - abs(d.x) * 23.0);
  float twinkle = 0.8 + 0.2 * sin(uTime * 0.9 + seed * 61.0);
  return mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.85, 0.65), seed)
       * (pin + spikes * 0.23) * step(0.981, seed) * twinkle;
}

float ringDensity(float r) {
  float bands = 0.48 + 0.25 * sin(r * 95.0) + 0.16 * noise(vec2(r * 210.0, 2.0));
  float cassini = smoothstep(0.018, 0.035, abs(r - 1.73));
  return bands * cassini * smoothstep(1.22, 1.27, r) * (1.0 - smoothstep(2.04, 2.12, r));
}
vec3 saturn(vec3 bg, vec2 d) {
  float r = length(d);
  if (r > 2.85) return bg;
  // Disco, anillos y órbitas comparten el mismo plano inclinado.
  mat2 tilt = mat2(0.94, -0.342, 0.342, 0.94);
  vec2 q = tilt * d;
  vec3 light = normalize(vec3(-0.58, 0.48, 0.66));
  float z = sqrt(max(0.0, 1.0 - r * r));
  float disc = 1.0 - smoothstep(0.992, 1.0, r);
  bg += vec3(0.48, 0.65, 0.58) * exp(-abs(r - 1.0) * 32.0) * 0.07;
  if (r < 1.0) {
    vec3 normal = vec3(q, z);
    float longitude = atan(q.x, max(z, 0.001));
    float speed = 0.026 + 0.018 * sin(q.y * 13.0);
    float turbulence = fbm(vec2(longitude * 0.85 + uTime * speed, q.y * 19.0));
    float fine = fbm(vec2(longitude * 1.7 - uTime * speed * 0.6, q.y * 44.0));
    float bands = 0.5 + 0.5 * sin(q.y * 47.0 + turbulence * 5.0 + fine * 1.4);
    vec3 surface = mix(vec3(0.44, 0.29, 0.13), vec3(0.91, 0.78, 0.53), bands * 0.7 + fine * 0.3);
    vec2 storm = (vec2(longitude, q.y) - vec2(-0.30 + 0.04 * sin(uTime * 0.04), -0.23)) / vec2(0.27, 0.095);
    float sr = length(storm);
    float oval = 1.0 - smoothstep(0.75, 1.2, sr);
    float spiral = 0.5 + 0.5 * sin(sr * 16.0 - atan(storm.y, storm.x) * 2.0 - uTime * 0.18);
    surface = mix(surface, mix(vec3(0.48, 0.28, 0.11), vec3(0.96, 0.84, 0.61), spiral), oval * 0.7);
    float diffuse = smoothstep(-0.15, 0.85, dot(normal, light));
    surface *= (0.07 + diffuse * 0.93) * (0.38 + 0.62 * pow(z, 0.35));
    // Rayo hacia la luz contra el plano: sombra de anillos sobre la atmósfera.
    vec3 ringNormal = vec3(0.0, 0.9404, 0.34);
    float travel = -dot(normal, ringNormal) / dot(light, ringNormal);
    if (travel > 0.0) {
      vec3 hit = normal + light * travel;
      surface *= 1.0 - ringDensity(length(vec2(hit.x, hit.y / 0.34))) * 0.68;
    }
    bg = mix(bg, surface, disc);
  }
  if (r < 2.15) {
    vec3 ringPoint = vec3(q.x, q.y, -q.y * 0.9404 / 0.34);
    float er = length(vec2(q.x, q.y / 0.34));
    if (er > 1.22 && er < 2.12) {
      float density = ringDensity(er);
      float towardsLight = max(0.0, -dot(ringPoint, light));
      float shadow = 1.0 - smoothstep(0.88, 1.08, length(ringPoint + light * towardsLight));
      float grain = noise(vec2(er * 430.0, atan(q.y / 0.34, q.x) * 95.0));
      float sparkle = pow(grain, 10.0) * (0.5 + 0.5 * sin(uTime * 2.2 + grain * 170.0));
      vec3 ringColor = mix(vec3(0.36, 0.29, 0.19), vec3(0.89, 0.79, 0.57), density);
      ringColor = ringColor * (1.0 - shadow * 0.88) + sparkle * 0.2;
      // La profundidad decide qué tramo queda delante del disco.
      float visible = r >= 1.0 || ringPoint.z > z ? 1.0 : 0.0;
      bg = mix(bg, ringColor, density * visible * 0.92);
    }
  }
  // Una luna en móviles; tres órbitas de 28, 41 y 54 segundos en calidad normal.
  for (int m = 0; m < ${octaves === 3 ? 1 : 3}; m++) {
    float fm = float(m);
    float phase = uTime * 6.283185 / (28.0 + fm * 13.0) + fm * 2.4;
    float orbit = 2.3 + fm * 0.21;
    vec3 moon = vec3(cos(phase) * orbit, sin(phase) * orbit * 0.34, -sin(phase) * orbit * 0.9404);
    float size = 0.045 + fm * 0.009;
    vec2 md = (q - moon.xy) / size;
    float mr = length(md);
    if (mr < 1.0 && (r >= 1.0 || moon.z > z)) {
      vec3 mn = vec3(md, sqrt(max(0.0, 1.0 - mr * mr)));
      float shade = 0.12 + 0.88 * max(0.0, dot(mn, light));
      vec3 rock = mix(vec3(0.42, 0.4, 0.35), vec3(0.78, 0.72, 0.58), noise(md * 8.0 + fm));
      bg = mix(bg, rock * shade, 1.0 - smoothstep(0.87, 1.0, mr));
    }
  }
  return bg;
}

float cells(vec2 p) {
  vec2 id = floor(p), f = fract(p);
  float nearest = 2.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 seed = vec2(hash(id + offset), hash(id + offset + 19.1));
      vec2 center = 0.5 + 0.34 * sin(seed * 6.283185 + uTime * 0.3);
      vec2 delta = offset + center - f;
      nearest = min(nearest, dot(delta, delta));
    }
  }
  return sqrt(nearest);
}
vec3 sun(vec3 bg, vec2 d) {
  float r = length(d);
  if (r > 2.8) return bg;
  float outer = 1.0 - smoothstep(2.1, 2.8, r);
  bg += vec3(1.0, 0.39, 0.07) * exp(-r * r * 1.1) * 0.19 * outer;
  if (r > 0.98) {
    float angle = atan(d.y, d.x);
    vec2 radial = d / max(r, 0.001);
    float filament = noise(radial * 13.0 + uTime * 0.025);
    float rays = pow(0.5 + 0.5 * sin(angle * 31.0 + filament * 8.0), 7.0);
    float streamer = pow(0.5 + 0.5 * sin(angle * 11.0 + filament * 3.0), 5.0);
    float breath = 0.8 + 0.2 * sin(uTime * 0.65 + angle * 3.0);
    float corona = exp(-max(r - 1.0, 0.0) * 4.8) * (0.1 + rays * 0.65 + streamer * 0.35) * breath;
    float phase = fract(uTime / 11.0);
    float pulseRadius = (r - 1.02 - phase * 1.7) / 0.075;
    float pulse = exp(-pulseRadius * pulseRadius);
    pulse *= smoothstep(0.0, 0.1, phase) * (1.0 - smoothstep(0.55, 0.95, phase));
    bg += vec3(1.0, 0.57, 0.19) * (corona + pulse * (0.12 + streamer * 0.4)) * outer;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float a = -1.25 + fi * 0.65 + 0.06 * sin(uTime * 0.12 + fi);
      vec2 axis = vec2(cos(a), sin(a));
      vec2 local = d - axis * 0.985;
      vec2 arc = vec2(dot(local, vec2(-axis.y, axis.x)), dot(local, axis) / 1.35);
      float arcRadius = 0.13 + 0.03 * sin(uTime * 0.4 + fi * 2.0);
      float loop = exp(-abs(length(arc) - arcRadius) * 170.0);
      loop *= smoothstep(-0.015, 0.02, dot(local, axis));
      bg += vec3(1.0, 0.16, 0.025) * loop * 0.8;
    }
  }
  if (r < 1.0) {
    float z = sqrt(max(0.0, 1.0 - r * r));
    float granule = 1.0 - smoothstep(0.08, 0.7, cells(d * 38.0 + vec2(uTime * 0.12, 0.0)));
    vec3 surface = mix(vec3(0.85, 0.22, 0.025), vec3(1.6, 1.04, 0.35), granule);
    vec2 spot1 = (d - vec2(0.32 + 0.025 * sin(uTime * 0.08), -0.28)) / vec2(0.075, 0.105);
    vec2 spot2 = (d - vec2(0.52, -0.16)) / vec2(0.04, 0.055);
    float spots = min(length(spot1), length(spot2)) + noise(d * 100.0) * 0.25;
    surface *= mix(0.12, 1.0, smoothstep(0.4, 1.45, spots));
    surface *= 0.35 + 0.65 * pow(z, 0.45);
    bg = mix(bg, surface, 1.0 - smoothstep(0.99, 1.0, r));
  }
  return bg;
}

void main() {
  vec2 view = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 p = view + uOff;
  float hx = uAspect * 0.5;
  float scale = min(uAspect, 1.0);
  vec2 sunCenter = vec2(-hx - 0.015 * scale, 0.46);
  vec2 blackCenter = vec2(hx - 0.10 * scale, -0.32);
  vec2 nebulaP = p;
  #if LOW_GFX == 0
  if (uMode == 7) {
    vec2 heat = (p - sunCenter) / (0.235 * scale);
    float r = length(heat);
    if (r > 1.0 && r < 2.8) {
      float strength = (1.0 - smoothstep(1.0, 2.8, r)) * smoothstep(1.0, 1.12, r);
      nebulaP += vec2(sin(r * 43.0 - uTime * 1.4), cos(heat.y * 31.0 - uTime)) * strength * 0.003;
    }
  }
  if (uMode == 8) {
    vec2 lens = p - blackCenter;
    float r = length(lens);
    if (r < 0.48 * scale) {
      float fade = 1.0 - smoothstep(0.09 * scale, 0.48 * scale, r);
      nebulaP += lens * (0.012 * scale * scale / (dot(lens, lens) + 0.004)) * fade;
    }
  }
  #endif
  // Cinco fbm por píxel; las variantes reutilizan estas dos capas y el polvo.
  float t = uTime, spd = uMode == 4 ? 3.0 : 1.0;
  vec2 q = vec2(fbm(nebulaP * 3.0 + t * 0.01 * spd),
                fbm(nebulaP * 3.0 + vec2(5.2, 1.3) - t * 0.012 * spd));
  float n = fbm(nebulaP * 2.5 + q * 1.6 + t * 0.005 * spd);
  float detail = fbm(nebulaP * 5.0 - q * 1.9 - t * 0.007);
  float dust = fbm(nebulaP * 4.0 + q * 2.5 + vec2(13.0, 2.0));
  float edge = smoothstep(0.06, 0.55, length((vUv - 0.5) * vec2(1.3, 1.0)));
  vec3 col = mix(uA, uB, smoothstep(0.25, 0.75, n));
  col = col * n * n + mix(uB, uC, smoothstep(0.48, 0.85, detail)) * detail * detail * 0.28;
  col *= 1.0 - smoothstep(0.48, 0.72, dust) * 0.85;
  vec3 outc = col * (0.12 + 0.95 * edge) * (0.93 + 0.07 * sin(t * 0.3));
  outc += stars(p) * (0.12 + edge) * 0.65;

  if (uMode == 0) {
    float belt = 1.0 - smoothstep(0.02, 0.10, abs(p.y + p.x * 0.35 - 0.12));
    outc *= 1.0 - belt * dust * 0.55;
    outc += vec3(0.55, 0.6, 0.8) * belt * dots(p * 160.0 + vec2(t * 0.8, 0.0), 0.12, 0.3, vec2(0.0)) * edge;
  } else if (uMode == 1) {
    float ridge = 1.0 - abs(detail * 2.0 - 1.0);
    outc += uC * pow(ridge, 12.0) * (0.3 + n) * edge * 0.55;
  } else if (uMode == 2) {
    float wave = sin(p.x * 6.0 + t * 0.35 + q.x * 4.0);
    float curtain = 1.0 - smoothstep(0.0, 0.14, abs(p.y - 0.33 - 0.07 * wave));
    curtain *= 0.5 + 0.5 * sin(p.x * 24.0 + t * 1.5 + detail * 4.0);
    outc += vec3(0.15, 1.0, 0.55) * curtain * 0.45 * edge;
    outc += uC * dots(p * 90.0, 0.05, 0.12, vec2(0.0)) * (0.5 + 0.5 * sin(t * 3.0 + p.x * 40.0)) * edge;
  } else if (uMode == 3) {
    vec2 g = p * 18.0;
    float pulse = 0.5 + 0.5 * sin(t * 1.6 + hash(floor(g)) * 6.28);
    outc += uC * dots(g, 0.3, 0.09, vec2(0.2)) * pulse * edge;
    outc += vec3(0.4, 1.0, 0.2) * dots(g * 2.3 + 11.0, 0.2, 0.06, vec2(0.25)) * 0.5 * edge;
  } else if (uMode == 4) {
    outc += uC * dots(p * vec2(34.0, 24.0) + vec2(0.0, -t * 0.9), 0.18, 0.1, vec2(0.25)) * edge;
  } else if (uMode == 5) {
    vec2 d = (p - vec2(hx - 0.13 * scale, 0.32)) / (0.205 * scale);
    if (length(d) < 2.85) outc = saturn(outc, d);
  } else if (uMode == 6) {
    outc *= 0.3;
    outc += vec3(0.6, 0.7, 0.9) * dots(p * 60.0, 0.015, 0.1, vec2(0.0)) * (0.5 + 0.5 * sin(t * 0.8 + p.y * 30.0)) * edge;
  } else if (uMode == 7) {
    vec2 d = (p - sunCenter) / (0.235 * scale);
    if (length(d) < 2.8) outc = sun(outc, d);
    #if LOW_GFX == 0
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 ghost = p - sunCenter * (0.64 - fi * 0.24);
      float r = length(ghost) / ((0.024 + fi * 0.012) * scale);
      if (r < 1.5) {
        float halo = exp(-abs(r - 0.85) * 12.0) + exp(-r * r * 3.0) * 0.25;
        outc += mix(vec3(0.18, 0.4, 0.35), vec3(0.55, 0.28, 0.12), fi / 3.0) * halo * 0.025 * edge;
      }
    }
    #endif
  } else if (uMode == 8) {
    vec2 d = (p - blackCenter) / scale;
    float rr = length(d);
    if (rr < 0.46) {
      vec2 e = vec2(d.x, d.y * 2.4);
      float r = length(e), angle = atan(e.y, e.x);
      float swirl = fbm(vec2(cos(angle) * 3.0 - t * 0.2, sin(angle) * 3.0 + r * 19.0));
      float disk = smoothstep(0.07, 0.11, r) * (1.0 - smoothstep(0.14, 0.42, r));
      outc += mix(uB * 2.0, uC, swirl) * disk * swirl * 1.6;
      outc *= smoothstep(0.06, 0.075, rr);
      outc += vec3(1.0, 0.8, 0.6) * (1.0 - smoothstep(0.0, 0.008, abs(rr - 0.08))) * 0.9;
    }
  } else if (uMode == 9) {
    vec2 flow = vec2(sin(p.y * 3.0 + t * 0.25), cos(p.x * 3.0 - t * 0.2)) * 0.6;
    float sw = dots(p * 55.0 + flow * 3.0, 0.35, 0.09, vec2(0.35));
    float sw2 = dots(p * 90.0 - flow * 5.0 + 3.0, 0.3, 0.08, vec2(0.35));
    outc += uC * (sw + sw2 * 0.6) * edge * (0.7 + 0.3 * sin(t * 2.0));
  }

  outc *= uGain * (0.04 + 0.96 * edge);
  outc *= 1.0 - 0.22 * smoothstep(0.55, 0.85, length(vUv - 0.5));
  outc += (hash(gl_FragCoord.xy) - 0.5) / 1024.0;
  gl_FragColor = vec4(max(outc, vec3(0.0)), 1.0);
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
    // ox/oy están en píxeles de mundo; el fondo apenas acompaña la cámara.
    update(timeSec, ox, oy) {
      uniforms.uTime.value = timeSec
      uniforms.uOff.value.set(ox * 0.000012, -oy * 0.000012)
    },
    fit(camera) {
      const dist = camera.position.z - mesh.position.z
      const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.04
      mesh.scale.set(h * camera.aspect, h, 1)
      uniforms.uAspect.value = camera.aspect
    },
    dispose() { mesh.geometry.dispose(); mat.dispose() },
  }
}
