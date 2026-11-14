// Physics for Cosmic Time Explorer (educational Schwarzschild model)
export const G = 6.6743e-11;      // m^3 kg^-1 s^-2
export const C = 299792458;       // m/s
export const M_SUN = 1.98847e30;  // kg
export const M_EARTH = 5.972e24;  // kg
export const YEAR = 31557600;     // s (Julian year)

// vis = relative drawing size in the 3D scene (not to scale)
export const BODIES = {
  earth:     { name: 'Earth',        mass: 5.972e24,     radius: 6.371e6,  vis: 1.8 },
  moon:      { name: 'Moon',         mass: 7.342e22,     radius: 1.7374e6, vis: 0.9 },
  mars:      { name: 'Mars',         mass: 6.417e23,     radius: 3.3895e6, vis: 1.3 },
  jupiter:   { name: 'Jupiter',      mass: 1.898e27,     radius: 6.9911e7, vis: 3.2 },
  sun:       { name: 'Sun',          mass: M_SUN,        radius: 6.957e8,  vis: 4.2 },
  neutron:   { name: 'Neutron star', mass: 1.4 * M_SUN,  radius: 1.2e4,    vis: 0.8 },
  blackhole: { name: 'Black hole',   mass: 10 * M_SUN,   radius: null,     vis: 1.7 }, // radius = r_s
};

export const schwarzschildRadius = (m) => (2 * G * m) / (C * C);

/**
 * Full state for a body at height h (in body radii above the surface),
 * with spacecraft speed beta = v/c and a mass multiplier.
 */
export function computeState(key, massMult, h, beta) {
  const b = BODIES[key];
  const mass = b.mass * massMult;
  const rs = schwarzschildRadius(mass);
  const R = key === 'blackhole' ? rs : b.radius;
  const collapsed = rs >= R && key !== 'blackhole';
  let r = R * (1 + h);
  const minR = rs * 1.01;
  const clamped = r < minR;
  if (clamped) r = minR;
  const grav = Math.sqrt(1 - rs / r);
  const vel = Math.sqrt(1 - beta * beta);
  return {
    key, h, beta, mass, rs, R, r, clamped, collapsed,
    grav, vel, rate: grav * vel,
    compact: rs / R,
    gSurf: (G * mass) / (R * R),
    vEsc: Math.min(1, Math.sqrt(rs / R)), // escape speed as a fraction of c
  };
}

// ---------- formatters ----------
export function clockText(s) {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export function duration(s) {
  const a = Math.abs(s);
  if (a === 0) return '0 s';
  const units = [[YEAR, 'years'], [86400, 'days'], [3600, 'h'], [60, 'min'], [1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']];
  let u = units[units.length - 1];
  for (const x of units) if (a >= x[0]) { u = x; break; }
  const v = a / u[0];
  return (s < 0 ? '-' : '') + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toPrecision(3)) + ' ' + u[1];
}

export function percentText(x) {
  if (x <= 0) return '0.00%';
  const p = x * 100;
  return p >= 0.01 ? p.toFixed(2) + '%' : p.toExponential(2) + '%';
}

export function massText(kg) {
  return kg >= 0.5 * M_SUN ? (kg / M_SUN).toFixed(2) + ' M☉' : (kg / M_EARTH).toPrecision(3) + ' M⊕';
}

export const sci = (x) => x.toExponential(3).replace('e+', ' × 10^').replace('e-', ' × 10^-');
export const kmText = (m) => (m / 1000).toLocaleString(undefined, { maximumFractionDigits: m < 1e5 ? 2 : 0 }) + ' km';