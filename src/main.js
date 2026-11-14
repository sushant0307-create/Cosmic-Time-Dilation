import { BODIES, G, C, M_EARTH, YEAR, computeState, clockText, duration, percentText, massText, sci, kmText } from './physics.js';
import { Universe } from './universe.js';

const $ = (id) => document.getElementById(id);
const el = {
  body: $('bodySelect'), speed: $('speedSlider'), dist: $('distanceSlider'), mass: $('massSlider'), rate: $('rateSlider'),
  speedOut: $('speedOutput'), distOut: $('distanceOutput'), massOut: $('massOutput'), rateOut: $('rateOutput'),
  start: $('startButton'), reset: $('resetButton'), orbit: $('orbitButton'), title: $('sceneTitle'),
  ref: $('referenceClock'), ship: $('spacecraftClock'), diff: $('timeDifference'), explain: $('physicsExplanation'),
  facts: $('bodyFacts'), shipMass: $('shipMass'), grav: $('gravGrid'), gravTitle: $('gravTitle'), table: $('compareBody'), chart: $('diffChart'), loading: $('sceneLoading'),
};

const universe = new Universe($('sceneContainer'));

let running = false, orbit = true, refT = 0, shipT = 0, last = performance.now(), sampleT = 0, frames = 0;
let history = [];

const inputs = () => ({
  key: el.body.value, beta: +el.speed.value / 100, h: +el.dist.value,
  massMult: Math.pow(10, +el.mass.value), timeRate: +el.rate.value,
});
const getState = () => { const i = inputs(); return computeState(i.key, i.massMult, i.h, i.beta); };

// ---------- readouts ----------
function updateLabels() {
  const i = inputs();
  el.speedOut.textContent = (i.beta * 100).toFixed(1) + '% c';
  el.distOut.textContent = i.h.toFixed(2) + ' × radius';
  el.massOut.textContent = i.massMult.toFixed(2) + '×';
  el.rateOut.textContent = i.timeRate + '×';
}

function updateFacts(st) {
  const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  let h = row('Mass', `${massText(st.mass)}`) + row('Mass (kg)', sci(st.mass)) + row('Radius', kmText(st.R)) +
    row('Schwarzschild r<sub>s</sub>', st.rs < 1000 ? st.rs.toFixed(2) + ' m' : kmText(st.rs)) +
    row('Surface gravity', (st.gSurf / 9.80665 >= 1000 ? (st.gSurf / 9.80665).toExponential(2) : (st.gSurf / 9.80665).toPrecision(3)) + ' g') +
    row('Escape speed', (st.vEsc * 100).toFixed(st.vEsc < 0.01 ? 4 : 1) + '% c');
  if (st.collapsed) h += '<span class="warn">At this mass the body would collapse into a black hole. The clock is calculated outside r<sub>s</sub>.</span>';
  else if (st.clamped) h += '<span class="warn">Closest allowed point: 1.01 r<sub>s</sub>, just outside the event horizon.</span>';
  el.facts.innerHTML = h;
}

function updateGravity(st) {
  const num = (x) => (x >= 1e5 || x < 1e-2 ? sci(x) : x.toPrecision(4));
  const mShip = Math.max(1, +el.shipMass.value || 1000);
  const g0 = 9.80665, gShip = (G * st.mass) / (st.r * st.r), force = gShip * mShip;
  const vOrb = Math.min(C, Math.sqrt((G * st.mass) / st.r)), vEsc = Math.min(C, Math.sqrt((2 * G * st.mass) / st.R));
  const earthRatio = st.mass / M_EARTH;
  const card = (cls, label, value, note) => `<div class="grav-card ${cls}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  el.gravTitle.textContent = BODIES[st.key].name + ': mass and gravitational force';
  el.grav.innerHTML =
    card('mass', 'MASS OF BODY', num(st.mass) + ' kg', `${massText(st.mass)} · ${earthRatio >= 1000 ? earthRatio.toExponential(2) : earthRatio.toPrecision(3)}× Earth`) +
    card('', 'SURFACE GRAVITY', num(st.gSurf) + ' m/s²', `${num(st.gSurf / g0)} g (Earth = 1 g)`) +
    card('', 'GRAVITY AT SPACECRAFT', num(gShip) + ' m/s²', `${num(gShip / g0)} g at ${kmText(st.r)} from the centre`) +
    card('force', 'FORCE ON SPACECRAFT', num(force) + ' N', `F = GMm/r² for m = ${mShip.toLocaleString()} kg`) +
    card('', 'ORBITAL SPEED HERE', num(vOrb / 1000) + ' km/s', `${((vOrb / C) * 100).toPrecision(3)}% of c for a circular orbit`) +
    card('', 'ESCAPE VELOCITY', num(vEsc / 1000) + ' km/s', `${((vEsc / C) * 100).toPrecision(3)}% of c from the surface`);
}

function updateExplanation(st) {
  const vl = 1 - st.vel, gl = 1 - st.grav, name = BODIES[st.key].name;
  const dom = vl > gl * 3 ? 'Here speed is the main reason the clocks differ.'
    : gl > vl * 3 ? 'Here gravity is the main reason the clocks differ.'
    : 'Speed and gravity both contribute noticeably.';
  el.explain.textContent = `At ${(st.beta * 100).toFixed(1)}% of light speed and ${st.h.toFixed(2)} radii above the ${name}, ` +
    `every hour on the distant reference clock is only ${duration(3600 * st.rate)} on the spacecraft clock. ${dom}`;
  const set = (id, frac, bar) => { $(id + 'Percent').textContent = percentText(frac); $(id + 'Bar').style.width = bar + '%'; };
  set('velocity', vl, vl * 100);
  // gravity effect is tiny for planets, so the bar is log-scaled to stay visible
  set('gravity', gl, gl <= 0 ? 0 : clamp(((Math.log10(gl) + 10) / 10) * 100, 2, 100));
  $('combinedPercent').textContent = (st.rate * 100).toFixed(st.rate > 0.9999 ? 8 : 3) + '%';
  $('combinedBar').style.width = st.rate * 100 + '%';
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function updateTable() {
  const i = inputs();
  el.table.innerHTML = Object.keys(BODIES).map((key) => {
    const mm = key === i.key ? i.massMult : 1;
    const s = computeState(key, mm, i.h, i.beta), g0 = computeState(key, mm, i.h, 0);
    return `<tr data-key="${key}" class="${key === i.key ? 'active' : ''}"><td>${BODIES[key].name}</td><td>${massText(s.mass)}</td>` +
      `<td>${kmText(s.R)}</td><td>${percentText(1 - g0.grav)}</td><td>${duration((1 - s.rate) * YEAR)}</td></tr>`;
  }).join('');
}
el.shipMass.addEventListener('input', refreshAll);
el.table.addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  el.body.value = tr.dataset.key; onBodyChange();
});

// ---------- chart ----------
function drawChart() {
  const cv = el.chart, dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.font = '10px "DM Mono", monospace'; ctx.fillStyle = '#8496ad'; ctx.strokeStyle = '#25354c';
  const L = 62, B = 22, T = 14, R = 12;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, h - B); ctx.lineTo(w - R, h - B); ctx.stroke();
  if (history.length < 2) { ctx.textAlign = 'center'; ctx.fillText('Press Start mission to record data', w / 2, h / 2); return; }
  const tMax = history[history.length - 1][0], dMax = Math.max(...history.map((p) => p[1]), 1e-12);
  ctx.textAlign = 'right'; ctx.fillText(duration(dMax), L - 6, T + 8); ctx.fillText('0', L - 6, h - B);
  ctx.textAlign = 'right'; ctx.fillText(clockText(tMax) + ' ref', w - R, h - 6);
  ctx.beginPath();
  history.forEach(([t, d], k) => { const x = L + (t / tMax) * (w - L - R), y = h - B - (d / dMax) * (h - B - T); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = '#ffc17a'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
}

// ---------- events ----------
function refreshAll() { updateLabels(); const st = getState(); updateFacts(st); updateGravity(st); updateExplanation(st); updateTable(); }
function onBodyChange() { el.title.textContent = BODIES[el.body.value].name + ' system'; resetClocks(); refreshAll(); }
function resetClocks() { refT = shipT = 0; history = []; running = false; el.start.textContent = '▶ Start mission'; }

el.body.addEventListener('change', onBodyChange);
[el.speed, el.dist, el.mass, el.rate].forEach((s) => s.addEventListener('input', refreshAll));
// physics inputs change the rate, so restart the recorded curve to keep it meaningful
[el.speed, el.dist, el.mass].forEach((s) => s.addEventListener('change', () => { history = []; }));
el.start.addEventListener('click', () => { running = !running; el.start.textContent = running ? '⏸ Pause mission' : '▶ Resume mission'; });
el.reset.addEventListener('click', resetClocks);
el.orbit.addEventListener('click', () => { orbit = !orbit; el.orbit.textContent = orbit ? '◎ Orbital animation: on' : '◎ Orbital animation: off'; });
el.orbit.textContent = '◎ Orbital animation: on';

// ---------- main loop ----------
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const st = getState(), i = inputs();
  if (running) {
    const sd = dt * i.timeRate;
    refT += sd; shipT += sd * st.rate;
    sampleT += dt;
    if (sampleT > 0.25) { sampleT = 0; history.push([refT, refT - shipT]); if (history.length > 600) history.shift(); }
  }
  el.ref.textContent = clockText(refT);
  el.ship.textContent = clockText(shipT);
  el.diff.textContent = refT - shipT === 0 ? '0.000 s' : duration(refT - shipT);

  universe.update(st, dt, { orbit });
  universe.render();
  if (++frames % 8 === 0) drawChart();
  if (el.loading) { el.loading.remove(); el.loading = null; }
  requestAnimationFrame(frame);
}

onBodyChange();
requestAnimationFrame(frame);