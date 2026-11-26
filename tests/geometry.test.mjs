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
