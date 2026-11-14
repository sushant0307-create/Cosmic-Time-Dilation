import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BODIES } from './physics.js';

// ---------- procedural texture helpers ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function hash(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(p, k, oct = 5) {
  let a = 0.5, s = 0, f = k;
  for (let i = 0; i < oct; i++) { s += a * vnoise(p[0] * f + i * 7.1, p[1] * f, p[2] * f); a /= 2; f *= 2.03; }
  return s / 0.96;
}

function makeCanvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
function toTexture(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function sphereTexture(fn, post, w = 512, h = 256) {
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 2 * Math.PI;
      const c = fn([cl * Math.cos(lon), sl, cl * Math.sin(lon)], lat);
      const i = (y * w + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3] ?? 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (post) post(ctx, w, h);
  return toTexture(cv);
}

function glowTexture(r, g, b, ring = false) {
  const cv = makeCanvas(256, 256), ctx = cv.getContext('2d');
  const gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  if (!ring) {
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.25, `rgba(${r},${g},${b},0.45)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  } else {
    gr.addColorStop(0, `rgba(${r},${g},${b},0)`); gr.addColorStop(0.38, `rgba(${r},${g},${b},0)`);
    gr.addColorStop(0.5, `rgba(255,235,200,0.95)`); gr.addColorStop(0.58, `rgba(${r},${g},${b},0.25)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  }
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 256);
  return toTexture(cv);
}

const DISK_INNER = 0.36;
function diskTexture() {
  const s = 384, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2), r = Math.hypot(dx, dy), i = (y * s + x) * 4;
    if (r > 1 || r < DISK_INNER) continue;
    const k = (r - DISK_INNER) / (1 - DISK_INNER), ang = Math.atan2(dy, dx);
    const n = fbm([Math.cos(ang + k * 5) * 1.5, Math.sin(ang + k * 5) * 1.5, k * 3], 3, 3);
    const heat = Math.pow(1 - k, 1.4);
    const a = clamp(heat * (0.5 + n * 1.0)) * sstep(0, 0.08, k) * (1 - sstep(0.85, 1, k));
    const c = mix([255, 80, 20], [255, 240, 210], heat);
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(cv);
}

const TEX = {}; // cache
function tex(name, build) { return TEX[name] || (TEX[name] = build()); }

function bodyTextures(key) {
  switch (key) {
    case 'earth': return {
      map: tex('earth', () => sphereTexture((p, lat) => {
        const n = fbm(p, 2.2), ice = sstep(1.1, 1.3, Math.abs(lat));
        let c;
        if (n < 0.5) c = mix([8, 32, 90], [22, 95, 175], n / 0.5);
        else { const t = (n - 0.5) / 0.3; c = t < 0.5 ? mix([40, 115, 55], [110, 125, 65], t * 2) : mix([110, 125, 65], [150, 120, 85], clamp(t * 2 - 1)); }
        return mix(c, [240, 245, 250], ice).concat(255);
      })),
      clouds: tex('earthClouds', () => sphereTexture((p) => [255, 255, 255, sstep(0.5, 0.78, fbm([p[0] + 9, p[1], p[2]], 3.5, 6)) * 215])),
    };
    case 'moon': return { map: tex('moon', () => sphereTexture((p) => {
      const g = 105 + fbm(p, 6) * 95, mare = sstep(0.55, 0.4, fbm(p, 1.4, 3));
      const v = g * (1 - 0.38 * mare); return [v, v, v * 0.97];
    }, (ctx, w, h) => {
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 1.5 + Math.random() ** 3 * 14;
        ctx.strokeStyle = 'rgba(30,30,30,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,230,230,.22)'; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r, 0.4, 2.4); ctx.stroke();
      }
    })) };
    case 'mars': return { map: tex('mars', () => sphereTexture((p, lat) => {
      let c = mix([150, 68, 38], [208, 122, 72], fbm(p, 2.6));
      c = mix(c, [85, 42, 30], sstep(0.5, 0.7, fbm([p[0], p[1] + 4, p[2]], 3.2)) * 0.7);
      return mix(c, [245, 240, 235], sstep(1.3, 1.42, Math.abs(lat)));
    })) };
    case 'jupiter': return { map: tex('jupiter', () => sphereTexture((p, lat) => {
      const b = Math.sin(lat * 15 + fbm(p, 3.2, 4) * 4.5) * 0.5 + 0.5;
      return mix(mix([150, 100, 68], [225, 195, 150], b), [240, 225, 200], sstep(0.7, 1, fbm(p, 9, 3)) * 0.4);
    }, (ctx, w, h) => { ctx.fillStyle = 'rgba(175,65,42,.85)'; ctx.beginPath(); ctx.ellipse(w * 0.65, h * 0.62, 26, 12, 0, 0, 7); ctx.fill(); })) };
    case 'sun': return { map: tex('sun', () => sphereTexture((p) => {
      const n = fbm(p, 4.5, 6), spot = sstep(0.38, 0.3, fbm(p, 2, 3));
      return mix([255, 120, 20], [255, 235, 140], n).map((v) => v * (1 - 0.55 * spot));
    })) };
    default: return {};
  }
}

// ---------- spacecraft ----------
function buildShip() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xd8e2ee, metalness: 0.85, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2a40, metalness: 0.6, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.75, 20), hull); body.rotation.x = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 20), hull); nose.rotation.x = Math.PI / 2; nose.position.z = 0.54; g.add(nose);
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), new THREE.MeshStandardMaterial({ color: 0x67d9ff, emissive: 0x2288aa, emissiveIntensity: 1.4 }));
  win.position.set(0, 0.1, 0.22); win.scale.set(1, 0.7, 1.5); g.add(win);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.018, 0.26), dark);
    wing.position.set(s * 0.33, 0, -0.18); wing.rotation.z = s * -0.08; g.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.2), hull); tip.position.set(s * 0.58, 0.04, -0.2); g.add(tip);
  }
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.12, 16), dark); eng.rotation.x = Math.PI / 2; eng.position.z = -0.42; g.add(eng);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(90, 215, 255), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.z = -0.55; g.add(glow);
  g.userData.glow = glow;
  return g;
}

// ---------- the universe ----------
export class Universe {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x050a14);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.06;

    this.scene.add(new THREE.AmbientLight(0x6f86a8, 0.35));
    const sun = new THREE.DirectionalLight(0xfff2dd, 3.0); sun.position.set(9, 4, 6); this.scene.add(sun);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.7, 0.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildStars();
    this.ship = buildShip(); this.scene.add(this.ship);
    this.buildTrail();
    this.theta = 0; this.gridT = -1; this.body = null; this.key = null;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 600, h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  buildStars() {
    const n = 6000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, s = Math.sqrt(1 - u * u), r = 600 + Math.random() * 300;
      pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
      const t = Math.random(), b = 0.06 + Math.random() ** 3 * 0.38;
      col.set([b * lerp(0.7, 1, t), b * 0.85, b * lerp(1, 0.7, t)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.0, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
    this.scene.add(this.stars);
  }

  buildTrail() {
    this.N = 140;
    this.trailPts = Array.from({ length: this.N }, () => new THREE.Vector3());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    const col = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) { const f = Math.pow(1 - i / this.N, 1.6); col.set([0.35 * f, 0.85 * f, f], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.trail.frustumCulled = false; this.scene.add(this.trail);
  }

  // ----- curvature grid (a visual analogy; depth grows with rs/R) -----
  rebuildGrid(vis, t) {
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); this.grid.material.dispose(); }
    const lines = 41, seg = 60, half = vis * 10, depth = vis * (0.35 + 2.6 * t), w = vis * 1.3, y0 = -vis * 1.25;
    const pts = [], cols = [];
    const P = (x, z) => { const d = Math.hypot(x, z), y = y0 - depth / Math.sqrt(1 + (d / w) ** 2); const k = clamp(1 - d / (half * 0.9)); cols.push(0.45 * k + 0.12, 0.38 * k + 0.1, 1 * k + 0.2); pts.push(x, y, z); };
    for (let i = 0; i < lines; i++) {
      const c = -half + (2 * half * i) / (lines - 1);
      for (let j = 0; j < seg; j++) {
        const a = -half + (2 * half * j) / seg, b = -half + (2 * half * (j + 1)) / seg;
        P(c, a); P(c, b); P(a, c); P(b, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
    this.scene.add(this.grid);
  }

  // ----- bodies -----
  setBody(key) {
    if (this.body) { this.scene.remove(this.body.group); this.body.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
    const vis = BODIES[key].vis, group = new THREE.Group(), T = bodyTextures(key), anim = [];
    const sphere = (r, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), mat);
    const atmos = (r, rgb, pow = 3) => new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(...rgb) } }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 n;uniform vec3 c;void main(){float i=pow(max(0.,0.72-dot(n,vec3(0.,0.,1.))),${pow.toFixed(1)});gl_FragColor=vec4(c*i*2.2,i);}`,
    }));

    if (['earth', 'moon', 'mars', 'jupiter'].includes(key)) {
      const m = sphere(vis, new THREE.MeshStandardMaterial({ map: T.map, roughness: key === 'earth' ? 0.65 : 0.95, metalness: 0 }));
      m.rotation.z = 0.2; group.add(m); anim.push((dt) => { m.rotation.y += dt * 0.12; });
      if (T.clouds) { const c = sphere(vis * 1.012, new THREE.MeshStandardMaterial({ map: T.clouds, transparent: true, depthWrite: false })); c.rotation.z = 0.2; group.add(c); anim.push((dt) => { c.rotation.y += dt * 0.16; }); }
      if (key === 'earth') group.add(atmos(vis * 1.14, [0.25, 0.55, 1]));
      if (key === 'mars') group.add(atmos(vis * 1.08, [0.9, 0.45, 0.25], 4));
      if (key === 'jupiter') group.add(atmos(vis * 1.06, [0.9, 0.7, 0.45], 4));
    } else if (key === 'sun') {
      const m = sphere(vis, new THREE.MeshBasicMaterial({ map: T.map, toneMapped: false })); m.material.color.setScalar(1.5); group.add(m);
      anim.push((dt) => { m.rotation.y += dt * 0.05; });
      const g1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(255, 150, 40), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); g1.scale.setScalar(vis * 4.2); group.add(g1);
      group.add(new THREE.PointLight(0xffe2b0, 40, 0, 1.2));
    } else if (key === 'neutron') {
      const m = sphere(vis, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.5, 2.2), toneMapped: false })); group.add(m);
      const g1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(120, 190, 255), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); g1.scale.setScalar(vis * 6); group.add(g1);
      const spin = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = 0.7;
      const cg = new THREE.ConeGeometry(vis * 0.8, vis * 9, 24, 1, true); cg.translate(0, -vis * 4.5, 0);
      const bm = new THREE.MeshBasicMaterial({ color: 0x67c6ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const b1 = new THREE.Mesh(cg, bm), b2 = new THREE.Mesh(cg, bm); b1.rotation.x = Math.PI; tilt.add(b1, b2); spin.add(tilt); group.add(spin);
      anim.push((dt) => { spin.rotation.y += dt * 7; });
    } else { // black hole
      const R = vis;
      group.add(sphere(R, new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const dt = tex('disk', diskTexture), tilt = new THREE.Group(), spin = new THREE.Group();
      tilt.rotation.set(1.25, 0, 0.18);
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 3.6 * DISK_INNER, R * 3.6, 128), new THREE.MeshBasicMaterial({ map: dt, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2; spin.add(ring); tilt.add(spin); group.add(tilt);
      anim.push((d) => { spin.rotation.y += d * 0.5; });
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(255, 150, 60, true), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      halo.scale.setScalar((2 * R * 1.55) / 0.5); group.add(halo);
    }

    this.scene.add(group);
    this.body = { group, anim }; this.key = key; this.gridT = -1;
    this.camera.position.set(0, vis * 2.2, vis * 7.5); this.controls.target.set(0, 0, 0);
    this.controls.minDistance = vis * 1.4; this.controls.maxDistance = vis * 40; this.controls.update();
    this.trailReset = true;
  }

  // st: physics state; o: { orbit, beta }
  update(st, dt, o) {
    if (this.key !== st.key) this.setBody(st.key);
    const b = BODIES[this.key], mm = st.mass / b.mass;
    const sc = this.key === 'blackhole' ? Math.pow(mm, 0.4) : 1, vis = b.vis * sc;
    this.body.group.scale.setScalar(sc);
    this.body.anim.forEach((f) => f(dt));

    const t = clamp((Math.log10(st.compact) + 9.5) / 9.5);
    if (Math.abs(t - this.gridT) > 0.004 || !this.grid) { this.rebuildGrid(b.vis, t); this.gridT = t; }

    // spacecraft
    const dist = vis * (1 + st.h * 0.55), tilt = 0.28;
    const at = (th) => new THREE.Vector3(Math.cos(th) * dist, Math.sin(th) * dist * Math.sin(tilt), Math.sin(th) * dist * Math.cos(tilt));
    if (o.orbit) this.theta += dt * (0.25 + 1.6 * st.beta) / Math.sqrt(dist / vis + 0.1);
    const pos = at(this.theta);
    if (this.trailReset) { this.trailPts.forEach((p) => p.copy(pos)); this.trailReset = false; }
    this.ship.position.copy(pos); this.ship.lookAt(at(this.theta + 0.05));
    this.ship.scale.setScalar(0.65 + vis * 0.3);
    const gl = this.ship.userData.glow; gl.scale.setScalar(0.35 + st.beta * 1.4); gl.material.opacity = 0.55 + st.beta * 0.45;

    if (o.orbit) { const last = this.trailPts.pop(); last.copy(pos); this.trailPts.unshift(last); }
    const arr = this.trail.geometry.attributes.position.array;
    this.trailPts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, Math.floor(this.N * (0.2 + 0.8 * st.beta)));

    // speed "feel": wider view, brighter stars, stronger glow
    this.camera.fov = lerp(this.camera.fov, 55 + st.beta * 22, 0.06); this.camera.updateProjectionMatrix();
    this.stars.material.size = 1.0 + st.beta * 0.7; this.stars.rotation.y += dt * (0.004 + 0.05 * st.beta);
    this.bloom.strength = 0.45 + 0.5 * st.beta + (['sun', 'blackhole', 'neutron'].includes(this.key) ? 0.15 : 0);

    this.controls.update();
  }

  render() { this.composer.render(); }
}