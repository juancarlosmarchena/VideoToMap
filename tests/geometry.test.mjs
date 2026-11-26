import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as G from '../js/geometry.js';

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b}`);

test('cameraHeading: móvil vertical mirando al norte / este', () => {
  near(G.norm360(G.cameraHeading(0, 90, 0)), 0, 1e-6);
  // alpha 90 = girado 90° antihorario → mira al oeste (270)
  near(G.cameraHeading(90, 90, 0), 270, 1e-6);
  near(G.cameraHeading(270, 90, 0), 90, 1e-6);
  // plano: usa el borde superior
  near(G.cameraHeading(30, 0, 0), 330, 1e-6);
});

test('closeRoom: rectángulo con ruido se cierra y escuadra', () => {
  const raw = [
    { heading: 3, length: 4.1 }, { heading: 92, length: 3.0 },
    { heading: 178, length: 3.9 }, { heading: 268, length: 3.15 },
  ];
  const r = G.closeRoom(raw, { square: true });
  assert.equal(r.points.length, 4);
  r.walls.forEach((w) => near(Math.abs(G.angleDiff(w.heading, r.axis)) % 90, 0, 1e-6, 'ortogonal'));
  const last = r.points[3], w = r.walls[3], end = G.vec(w.heading, w.length);
  near(last.x + end.x, 0, 1e-6); near(last.y + end.y, 0, 1e-6);
  near(G.polygonArea(r.points), 4 * 3.075, 0.3);
});

test('closeRoom: Bowditch cierra el polígono', () => {
  const r = G.closeRoom([{ heading: 0, length: 5 }, { heading: 120, length: 5 }, { heading: 245, length: 5.3 }]);
  assert.ok(r.valid);
  const p = r.points[2], e = G.vec(r.walls[2].heading, r.walls[2].length);
  near(p.x + e.x, 0, 1e-9); near(p.y + e.y, 0, 1e-9);
});

test('closeRoom: cierre automático añade la pared que falta', () => {
  const r = G.closeRoom([{ heading: 0, length: 3 }, { heading: 90, length: 4 }, { heading: 180, length: 3 }], { autoClose: true, square: true });
  assert.equal(r.walls.length, 4);
  near(G.polygonArea(r.points), 12, 1e-6);
});

test('edges: normales exteriores', () => {
  const sq = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }]; // horario
  const e = G.edges(sq);
  near(e[0].outward, 270); // pared oeste mira al oeste
  near(e[1].outward, 0);
});

test('xrToPlan: desfase 90° convierte "delante" en este', () => {
  const p = G.xrToPlan(0, -1, 90);
  near(p.x, 1); near(p.y, 0);
  near(G.xrHeading(0, -1), 0);
});

test('cardinal y sol', () => {
  assert.equal(G.cardinal(181), 'Sur');
  assert.equal(G.cardinalShort(225), 'SO');
  assert.match(G.sunComment(180, 40), /Máximo/);
});

test('rotatePoints: girar +d suma d al rumbo de las paredes', () => {
  const pts = [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 0 }];
  const r = G.rotatePoints(pts, 10, { x: 0, y: 0 });
  near(G.wallsFromPoints(r)[0].heading, 10, 1e-6);
});

test('segmentWalk: detecta 4 paredes con ruido y giros', () => {
  const walk = [];
  const noise = (i) => ((i * 37) % 11) - 5; // ±5°
  for (let i = 0; i < 7; i++) walk.push(G.norm360(0 + noise(i)));
  walk.push(40); // paso durante el giro
  for (let i = 0; i < 5; i++) walk.push(90 + noise(i));
  walk.push(300); // lectura espuria aislada
  for (let i = 0; i < 2; i++) walk.push(90 + noise(i));
  for (let i = 0; i < 7; i++) walk.push(180 + noise(i));
  for (let i = 0; i < 5; i++) walk.push(270 + noise(i));
  const s = G.closeRoom(G.segmentWalk(walk).map((w) => ({ heading: w.heading, length: w.steps * 0.7 })), { square: true });
  assert.equal(s.walls.length, 4);
  const segs = G.segmentWalk(walk);
  assert.deepEqual(segs.map((x) => x.steps), [8, 8, 7, 5]);
});

test('segmentWalk: empezar a mitad de pared une el primer y el último tramo', () => {
  const walk = [...Array(3).fill(0), ...Array(5).fill(90), ...Array(6).fill(180), ...Array(5).fill(270), ...Array(3).fill(0)];
  const segs = G.segmentWalk(walk);
  assert.equal(segs.length, 4);
  assert.equal(segs[0].steps, 6);
});

test('offsetPolygon: 2x2 desplazado 0,5 m → 3x3', () => {
  const sq = [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 0 }];
  near(G.polygonArea(G.offsetPolygon(sq, 0.5)), 9, 1e-9);
  near(G.polygonArea(G.offsetPolygon([...sq].reverse(), 0.5)), 9, 1e-9);
});
