// Geometría pura (sin DOM). Sistema de coordenadas del plano:
//   x = Este (m), y = Norte (m). Rumbos en grados, sentido horario desde el Norte.

export const DEG = Math.PI / 180;
export const norm360 = (a) => ((a % 360) + 360) % 360;
/** Diferencia angular con signo a-b en (-180, 180]. */
export const angleDiff = (a, b) => norm360(a - b + 180) - 180;

export function circularMean(degs, weights) {
  let s = 0, c = 0;
  degs.forEach((d, i) => {
    const w = weights ? weights[i] : 1;
    s += w * Math.sin(d * DEG);
    c += w * Math.cos(d * DEG);
  });
  if (Math.hypot(s, c) < 1e-9) return null;
  return norm360(Math.atan2(s, c) / DEG);
}

export const vec = (heading, length) => ({
  x: length * Math.sin(heading * DEG),
  y: length * Math.cos(heading * DEG),
});
export const headingOf = (dx, dy) => norm360(Math.atan2(dx, dy) / DEG);

/** Eje dominante (0..90) de un conjunto de paredes, ponderado por longitud. */
export function dominantAxis(walls) {
  const m = circularMean(walls.map((w) => w.heading * 4), walls.map((w) => w.length));
  return m == null ? 0 : m / 4;
}
export function snapHeading(h, axis) {
  const k = Math.round(angleDiff(h, axis) / 90);
  return norm360(axis + k * 90);
}

const sum = (vs) => vs.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 });

/**
 * Convierte una secuencia de paredes recorridas (rumbo + longitud) en un
 * polígono cerrado, compensando el error de cierre.
 *  - square: fuerza ángulos rectos respecto al eje dominante.
 *  - autoClose: añade la pared que falta entre el último punto y el inicio.
 */
export function closeRoom(rawWalls, { square = false, autoClose = false } = {}) {
  let walls = rawWalls
    .filter((w) => w.length > 0.01 && Number.isFinite(w.heading))
    .map((w) => ({ heading: norm360(w.heading), length: w.length }));
  if (walls.length < 2) return { walls, points: [], closureError: 0, valid: false };

  let axis = null;
  if (square) {
    axis = dominantAxis(walls);
    walls.forEach((w) => (w.heading = snapHeading(w.heading, axis)));
  }
  let e = sum(walls.map((w) => vec(w.heading, w.length)));
  if (autoClose && Math.hypot(e.x, e.y) > 0.05) {
    const cw = { heading: headingOf(-e.x, -e.y), length: Math.hypot(e.x, e.y), auto: true };
    if (square) cw.heading = snapHeading(cw.heading, axis);
    walls.push(cw);
  }
  let vs = walls.map((w) => vec(w.heading, w.length));
  e = sum(vs);
  const closureError = Math.hypot(e.x, e.y);
  const perimeterRaw = walls.reduce((a, w) => a + w.length, 0);

  if (square) {
    // Repartir el residuo de cada eje entre las paredes paralelas a ese eje.
    const u = vec(axis, 1), v = vec(axis + 90, 1);
    for (const ax of [u, v]) {
      const along = walls.map((w) => Math.abs(Math.abs(Math.cos((w.heading - headingOf(ax.x, ax.y)) * DEG)) - 1) < 1e-6);
      const total = walls.reduce((a, w, i) => a + (along[i] ? w.length : 0), 0);
      const r = e.x * ax.x + e.y * ax.y;
      if (total > 0) {
        vs = vs.map((p, i) => (along[i] ? { x: p.x - ax.x * r * walls[i].length / total, y: p.y - ax.y * r * walls[i].length / total } : p));
      }
    }
  } else {
    // Regla de la brújula (Bowditch): corrección proporcional a la longitud.
    vs = vs.map((p, i) => ({ x: p.x - e.x * walls[i].length / perimeterRaw, y: p.y - e.y * walls[i].length / perimeterRaw }));
  }

  // Reconstruir paredes y fusionar tramos colineales consecutivos.
  let out = [];
  for (const p of vs) {
    const len = Math.hypot(p.x, p.y);
    if (len < 0.02) continue;
    const h = headingOf(p.x, p.y);
    const last = out[out.length - 1];
    if (last && Math.abs(angleDiff(h, last.heading)) < 1) {
      const s = { x: vec(last.heading, last.length).x + p.x, y: vec(last.heading, last.length).y + p.y };
      last.heading = headingOf(s.x, s.y);
      last.length = Math.hypot(s.x, s.y);
    } else out.push({ heading: h, length: len });
  }
  const points = [];
  let cur = { x: 0, y: 0 };
  for (const w of out) {
    points.push(cur);
    const d = vec(w.heading, w.length);
    cur = { x: cur.x + d.x, y: cur.y + d.y };
  }
  return { walls: out, points, closureError, perimeterRaw, axis, valid: points.length >= 3 };
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
export const polygonArea = (pts) => Math.abs(signedArea(pts));
export function perimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    s += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return s;
}
export function centroid(pts) {
  const A = signedArea(pts);
  if (Math.abs(A) < 1e-9) {
    const n = pts.length || 1;
    return { x: pts.reduce((a, p) => a + p.x, 0) / n, y: pts.reduce((a, p) => a + p.y, 0) / n };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

/** Paredes (rumbo, longitud, normal exterior) de un polígono cerrado. */
export function edges(pts) {
  const ccw = signedArea(pts) > 0;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const heading = headingOf(q.x - p.x, q.y - p.y);
    return {
      a: p, b: q, heading,
      length: Math.hypot(q.x - p.x, q.y - p.y),
      // CCW: interior a la izquierda → exterior a la derecha (rumbo + 90).
      outward: norm360(heading + (ccw ? 90 : -90)),
    };
  });
}
export const wallsFromPoints = (pts) => edges(pts).map((e) => ({ heading: e.heading, length: e.length }));

export function rotatePoints(pts, deg, c = centroid(pts)) {
  // Rotación horaria (en rumbo) alrededor de c.
  const r = -deg * DEG, cs = Math.cos(r), sn = Math.sin(r);
  return pts.map((p) => {
    const dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
  });
}

const CARD = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
const CARD_S = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const cardinal = (h) => CARD[Math.round(norm360(h) / 45) % 8];
export const cardinalShort = (h) => CARD_S[Math.round(norm360(h) / 45) % 8];

/**
 * Rumbo hacia el que apunta la cámara trasera (eje -Z del dispositivo) a partir
 * de los ángulos de DeviceOrientation absolutos (alpha, beta, gamma en grados).
 * Si el móvil está casi plano se usa el borde superior del dispositivo.
 */
export function cameraHeading(alpha, beta, gamma) {
  const cA = Math.cos(alpha * DEG), sA = Math.sin(alpha * DEG);
  const cB = Math.cos(beta * DEG), sB = Math.sin(beta * DEG);
  const cG = Math.cos(gamma * DEG), sG = Math.sin(gamma * DEG);
  const vx = -cA * sG - sA * sB * cG;
  const vy = -sA * sG + cA * sB * cG;
  if (Math.hypot(vx, vy) > 0.35) return headingOf(vx, vy);
  return headingOf(-sA * cB, cA * cB);
}

/** Punto WebXR (x, z) → plano (Este, Norte) dado el desfase brújula-XR en grados. */
export function xrToPlan(x, z, offsetDeg) {
  const o = offsetDeg * DEG, c = Math.cos(o), s = Math.sin(o);
  return { x: x * c + -z * s, y: -x * s + -z * c };
}
/** Rumbo (en el marco XR) de un vector horizontal (dx, dz). */
export const xrHeading = (dx, dz) => headingOf(dx, -dz);

/** Comentario de soleamiento según orientación de la fachada y hemisferio. */
export function sunComment(facadeHeading, lat) {
  const north = lat == null || lat >= 0;
  const sunny = north ? 180 : 0;
  const d = Math.abs(angleDiff(facadeHeading, sunny));
  if (d <= 30) return 'Máximo soleamiento: recibe sol directo la mayor parte del día.';
  if (d <= 75) return angleDiff(facadeHeading, sunny) * (north ? 1 : -1) > 0
    ? 'Buen soleamiento, sobre todo por la tarde.'
    : 'Buen soleamiento, sobre todo por la mañana.';
  if (d <= 120) return Math.abs(angleDiff(facadeHeading, 90)) < 60
    ? 'Sol de mañana; tardes más frescas.'
    : 'Sol de tarde; puede calentarse en verano.';
  return 'Poco sol directo: fachada fresca y luz difusa.';
}

/**
 * Divide un recorrido continuo (rumbo registrado en cada paso) en paredes.
 * Se detecta una esquina cuando el rumbo se desvía más de `turn` grados de la
 * media de la pared actual durante `confirm` pasos seguidos.
 * @param {number[]} stepHeadings rumbo en cada paso
 * @returns {{heading:number, steps:number}[]}
 */
export function segmentWalk(stepHeadings, { turn = 45, confirm = 2, minSteps = 2 } = {}) {
  if (!stepHeadings.length) return [];
  const segs = [];
  let cur = { hs: [stepHeadings[0]], steps: 1 };
  let pending = [];
  for (const h of stepHeadings.slice(1)) {
    const m = circularMean(cur.hs);
    if (Math.abs(angleDiff(h, m)) > turn) {
      // ¿el giro es coherente con los pasos pendientes?
      if (pending.length && Math.abs(angleDiff(h, circularMean(pending))) > turn) {
        cur.steps += pending.length; pending = [];
      }
      pending.push(h);
      if (pending.length >= confirm) {
        segs.push(cur);
        cur = { hs: pending, steps: pending.length };
        pending = [];
      }
    } else {
      cur.steps += pending.length; // pasos sueltos durante el giro
      pending = [];
      cur.hs.push(h);
      cur.steps++;
    }
  }
  cur.steps += pending.length;
  segs.push(cur);

  // rumbo de cada pared sin los primeros pasos (aún girando)
  let out = segs.map((s) => ({ heading: circularMean(s.hs.length > confirm + 2 ? s.hs.slice(confirm) : s.hs), steps: s.steps }));
  // tramos demasiado cortos → se suman al anterior
  out = out.reduce((acc, s) => {
    if (s.steps < minSteps && acc.length) acc[acc.length - 1].steps += s.steps;
    else acc.push({ ...s });
    return acc;
  }, []);
  // fusionar tramos consecutivos con el mismo rumbo
  out = out.reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && Math.abs(angleDiff(s.heading, last.heading)) <= turn) {
      last.heading = circularMean([last.heading, s.heading], [last.steps, s.steps]);
      last.steps += s.steps;
    } else acc.push({ ...s });
    return acc;
  }, []);
  // si se empezó a mitad de pared, el último tramo continúa el primero
  if (out.length >= 4 && Math.abs(angleDiff(out[0].heading, out.at(-1).heading)) <= turn) {
    const l = out.pop();
    out[0].heading = circularMean([out[0].heading, l.heading], [out[0].steps, l.steps]);
    out[0].steps += l.steps;
  }
  return out;
}

/** Desplaza las paredes de un polígono cerrado `d` metros hacia fuera. */
export function offsetPolygon(pts, d) {
  if (pts.length < 3 || !d) return pts;
  const E = edges(pts);
  const lines = E.map((e) => {
    const n = vec(e.outward, d);
    return { p: { x: e.a.x + n.x, y: e.a.y + n.y }, u: vec(e.heading, 1) };
  });
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const out = lines.map((L, i) => {
    const P = lines[(i - 1 + lines.length) % lines.length];
    const den = cross(P.u, L.u);
    if (Math.abs(den) < 1e-6) return L.p;
    const s = cross({ x: L.p.x - P.p.x, y: L.p.y - P.p.y }, L.u) / den;
    return { x: P.p.x + P.u.x * s, y: P.p.y + P.u.y * s };
  });
  const o = out[0];
  return out.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
}
