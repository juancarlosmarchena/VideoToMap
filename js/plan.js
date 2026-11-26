// Dibujo del plano 2D (SVG) y edición interactiva.
import * as G from './geometry.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f2 = (n) => Number(n).toFixed(2);
const S = (p) => `${f2(p.x)},${f2(-p.y)}`; // mundo (Norte arriba) → SVG
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });

export const worldPoints = (room) => room.points.map((p) => add(p, room.offset || { x: 0, y: 0 }));
export const roomArea = (room) => G.polygonArea(room.points);
export const totalArea = (project) => project.rooms.reduce((a, r) => a + roomArea(r), 0);

/** Conjunto "roomId:pared" de las paredes de fachada (manuales o automáticas). */
export function facadeWalls(project) {
  const set = new Set(project.facadeManual || []);
  if (set.size || !project.facade || !project.rooms.length) return set;
  const fh = project.facade.heading, f = G.vec(fh, 1);
  const cand = [];
  for (const r of project.rooms) {
    G.edges(worldPoints(r)).forEach((e, i) => {
      if (e.length < 0.4 || Math.abs(G.angleDiff(e.outward, fh)) > 35) return;
      const m = mul(add(e.a, e.b), 0.5);
      cand.push({ key: `${r.id}:${i}`, proj: m.x * f.x + m.y * f.y });
    });
  }
  if (!cand.length) return set;
  const max = Math.max(...cand.map((c) => c.proj));
  cand.filter((c) => c.proj >= max - 0.4).forEach((c) => set.add(c.key));
  return set;
}

function bounds(project) {
  const pts = project.rooms.flatMap(worldPoints);
  if (!pts.length) return { minX: -2, maxX: 2, minY: -2, maxY: 2 };
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}

function openingSVG(room, wp, o, idx, u) {
  const e = G.edges(wp)[o.wall];
  if (!e) return '';
  const d = G.vec(e.heading, 1), nIn = G.vec(e.outward + 180, 1);
  const w = Math.min(o.width, e.length * 0.95);
  const c = Math.min(Math.max(o.t * e.length, w / 2), e.length - w / 2);
  const a = add(e.a, mul(d, c - w / 2)), b = add(e.a, mul(d, c + w / 2));
  let s = `<g class="opening" data-room="${room.id}" data-opening="${idx}">`;
  s += `<line x1="${f2(a.x)}" y1="${f2(-a.y)}" x2="${f2(b.x)}" y2="${f2(-b.y)}" stroke="#fff" stroke-width="0.2"/>`;
  if (o.type === 'door') {
    const tip = add(a, mul(nIn, w));
    const a0 = Math.atan2(d.y, d.x), da = Math.atan2(nIn.y, nIn.x) - a0;
    const delta = Math.atan2(Math.sin(da), Math.cos(da));
    const arc = Array.from({ length: 13 }, (_, k) => {
      const ang = a0 + (delta * k) / 12;
      return S(add(a, { x: Math.cos(ang) * w, y: Math.sin(ang) * w }));
    }).join(' ');
    s += `<line x1="${f2(a.x)}" y1="${f2(-a.y)}" x2="${f2(tip.x)}" y2="${f2(-tip.y)}" stroke="#333" stroke-width="0.04"/>`;
    s += `<polyline points="${arc}" fill="none" stroke="#333" stroke-width="0.02" stroke-dasharray="0.08 0.05"/>`;
  } else {
    const n = mul(nIn, 0.05);
    for (const k of [-1, 1]) {
      const p = add(a, mul(n, k)), q = add(b, mul(n, k));
      s += `<line x1="${f2(p.x)}" y1="${f2(-p.y)}" x2="${f2(q.x)}" y2="${f2(-q.y)}" stroke="#2a7fd4" stroke-width="0.03"/>`;
    }
  }
  // zona de toque ampliada para borrar
  s += `<line class="hit" x1="${f2(a.x)}" y1="${f2(-a.y)}" x2="${f2(b.x)}" y2="${f2(-b.y)}" stroke="transparent" stroke-width="${f2(u * 0.8)}"/>`;
  return s + '</g>';
}

function northArrow(x, y, u) {
  return `<g transform="translate(${f2(x)},${f2(y)})">
    <circle r="${f2(u * 1.3)}" fill="#fff" stroke="#333" stroke-width="${f2(u * 0.06)}"/>
    <path d="M0,${f2(-u * 1.1)} L${f2(u * 0.45)},${f2(u * 0.6)} L0,${f2(u * 0.25)} L${f2(-u * 0.45)},${f2(u * 0.6)} Z" fill="#c0392b"/>
    <text y="${f2(-u * 1.5)}" font-size="${f2(u * 0.9)}" text-anchor="middle" font-weight="700">N</text></g>`;
}

function scaleBar(x, y, u, W) {
  const nice = [0.5, 1, 2, 5, 10, 20, 50].find((v) => v >= W / 6) || 50;
  let s = `<g transform="translate(${f2(x)},${f2(y)})" font-size="${f2(u * 0.55)}">`;
  for (let i = 0; i < 2; i++) s += `<rect x="${f2((i * nice) / 2)}" y="0" width="${f2(nice / 2)}" height="${f2(u * 0.25)}" fill="${i ? '#fff' : '#333'}" stroke="#333" stroke-width="${f2(u * 0.04)}"/>`;
  s += `<text x="0" y="${f2(u * 0.95)}">0</text><text x="${f2(nice)}" y="${f2(u * 0.95)}" text-anchor="middle">${nice} m</text></g>`;
  return s;
}

/**
 * Genera el SVG completo del plano.
 * @param {object} project
 * @param {{selectedId?: string, interactive?: boolean}} opts
 */
export function planSVG(project, opts = {}) {
  const b = bounds(project);
  const W = Math.max(b.maxX - b.minX, 3), H = Math.max(b.maxY - b.minY, 3);
  const u = Math.max(W, H, 5) / 32;
  const facade = facadeWalls(project);
  const mL = 3 * u, mR = 4 * u, mT = 4 * u, mB = 4.5 * u, title = 7.5 * u;
  const vx = b.minX - mL, vy = -b.maxY - mT, vw = W + mL + mR, vh = H + mT + mB + title;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}" font-family="Helvetica, Arial, sans-serif">`;
  s += `<rect x="${f2(vx)}" y="${f2(vy)}" width="${f2(vw)}" height="${f2(vh)}" fill="#fff"/>`;
  // cuadrícula de 1 m
  s += `<g stroke="#eef1f5" stroke-width="${f2(u * 0.03)}">`;
  for (let x = Math.ceil(vx); x < vx + vw; x++) s += `<line x1="${x}" y1="${f2(vy)}" x2="${x}" y2="${f2(-b.minY + u)}"/>`;
  for (let y = Math.ceil(vy); y < -b.minY + u; y++) s += `<line x1="${f2(vx)}" y1="${y}" x2="${f2(vx + vw)}" y2="${y}"/>`;
  s += '</g>';

  project.rooms.forEach((room, ri) => {
    const wp = worldPoints(room);
    if (wp.length < 3) return;
    const sel = room.id === opts.selectedId;
    const hue = (ri * 67) % 360;
    s += `<g class="room" data-room="${room.id}">`;
    s += `<polygon class="room-fill" data-room="${room.id}" points="${wp.map(S).join(' ')}" fill="hsl(${hue} 60% 92%)" stroke="none" ${sel ? 'fill-opacity="1"' : 'fill-opacity="0.85"'}/>`;
    s += `<polygon points="${wp.map(S).join(' ')}" fill="none" stroke="${sel ? '#e67e22' : '#222'}" stroke-width="0.15" stroke-linejoin="miter" pointer-events="none"/>`;
    const E = G.edges(wp);
    E.forEach((e, i) => {
      if (facade.has(`${room.id}:${i}`)) {
        s += `<line x1="${f2(e.a.x)}" y1="${f2(-e.a.y)}" x2="${f2(e.b.x)}" y2="${f2(-e.b.y)}" stroke="#e67e22" stroke-width="0.3" pointer-events="none"/>`;
      }
      // cota de la pared
      const m = mul(add(e.a, e.b), 0.5), n = G.vec(e.outward, u * 0.75), t = add(m, n);
      let ang = 90 - e.heading; // ángulo SVG (y hacia abajo)
      ang = -ang;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      if (e.length >= 0.3) s += `<text x="${f2(t.x)}" y="${f2(-t.y)}" font-size="${f2(u * 0.55)}" text-anchor="middle" dominant-baseline="middle" fill="#555" transform="rotate(${f2(ang)} ${f2(t.x)} ${f2(-t.y)})" pointer-events="none">${e.length.toFixed(2)}</text>`;
      s += `<line class="wall-hit" data-room="${room.id}" data-wall="${i}" x1="${f2(e.a.x)}" y1="${f2(-e.a.y)}" x2="${f2(e.b.x)}" y2="${f2(-e.b.y)}" stroke="transparent" stroke-width="${f2(u * 0.9)}"/>`;
    });
    (room.openings || []).forEach((o, idx) => (s += openingSVG(room, wp, o, idx, u)));
    const c = G.centroid(wp);
    s += `<text x="${f2(c.x)}" y="${f2(-c.y)}" font-size="${f2(u * 0.85)}" text-anchor="middle" font-weight="700" fill="#222" pointer-events="none">${esc(room.name)}</text>`;
    s += `<text x="${f2(c.x)}" y="${f2(-c.y + u * 0.95)}" font-size="${f2(u * 0.65)}" text-anchor="middle" fill="#444" pointer-events="none">${G.polygonArea(wp).toFixed(2)} m²</text>`;
    s += '</g>';
  });

  // Indicador de fachada
  if (project.facade) {
    let best = null;
    for (const r of project.rooms) {
      G.edges(worldPoints(r)).forEach((e, i) => {
        if (facade.has(`${r.id}:${i}`) && (!best || e.length > best.length)) best = e;
      });
    }
    const fh = project.facade.heading;
    if (best) {
      const m = mul(add(best.a, best.b), 0.5);
      const p0 = add(m, G.vec(best.outward, u * 1.6)), p1 = add(m, G.vec(best.outward, u * 3.2));
      const lab = add(m, G.vec(best.outward, u * 2.4));
      s += `<line x1="${f2(p0.x)}" y1="${f2(-p0.y)}" x2="${f2(p1.x)}" y2="${f2(-p1.y)}" stroke="#e67e22" stroke-width="${f2(u * 0.12)}" marker-end="url(#arr)"/>`;
      s += `<text x="${f2(lab.x + u * 0.4)}" y="${f2(-lab.y)}" font-size="${f2(u * 0.6)}" fill="#e67e22" font-weight="700">FACHADA ${G.cardinalShort(fh)}</text>`;
    }
  }
  s += `<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#e67e22"/></marker></defs>`;

  s += northArrow(b.maxX + mR - 1.8 * u, -b.maxY - mT + 2.2 * u, u);
  s += scaleBar(b.minX, -b.maxY - mT + 1.2 * u, u, W);

  // Cajetín
  const ty = -b.minY + mB, fs = u * 0.6;
  const loc = project.location;
  const lines = [
    [`${esc(project.name || 'Plano')}`, u * 0.95, 700],
    [esc(project.address || (loc ? '' : 'Ubicación no registrada')), fs, 400],
    [loc ? `Coordenadas: ${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)} (±${Math.round(loc.accuracy)} m)` : '', fs, 400],
    [project.facade ? `Fachada orientada al ${G.cardinal(project.facade.heading)} (${Math.round(project.facade.heading)}°)` : 'Orientación de fachada no registrada', fs, 400],
    [`Superficie útil total: ${totalArea(project).toFixed(2)} m² · ${project.rooms.length} estancia(s) · ${new Date().toLocaleDateString('es-ES')}`, fs, 400],
    ['Plano aproximado generado con VideoToMap. Medidas orientativas, sin validez técnica ni legal.', fs * 0.8, 400],
  ].filter((l) => l[0]);
  s += `<line x1="${f2(vx + u)}" y1="${f2(ty - u * 0.4)}" x2="${f2(vx + vw - u)}" y2="${f2(ty - u * 0.4)}" stroke="#999" stroke-width="${f2(u * 0.04)}"/>`;
  let yy = ty + u * 0.6;
  for (const [txt, size, wgt] of lines) {
    s += `<text x="${f2(vx + u)}" y="${f2(yy)}" font-size="${f2(size)}" font-weight="${wgt}" fill="#222">${txt}</text>`;
    yy += size * 1.45;
  }
  return s + '</svg>';
}

/** SVG pequeño de una sola estancia (vista previa del editor). */
export function roomPreviewSVG(points, rawPoints) {
  const all = [...points, ...(rawPoints || [])];
  if (!all.length) return '<svg viewBox="0 0 10 10"></svg>';
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const W = Math.max(...xs) - Math.min(...xs) || 1, H = Math.max(...ys) - Math.min(...ys) || 1;
  const m = Math.max(W, H) * 0.15 + 0.3, u = Math.max(W, H) / 20;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f2(Math.min(...xs) - m)} ${f2(-Math.max(...ys) - m)} ${f2(W + 2 * m)} ${f2(H + 2 * m)}" font-family="sans-serif">`;
  if (rawPoints?.length) s += `<polyline points="${rawPoints.map(S).join(' ')}" fill="none" stroke="#c0392b" stroke-width="${f2(u * 0.3)}" stroke-dasharray="${f2(u)} ${f2(u * 0.6)}"/>`;
  if (points.length >= 3) {
    s += `<polygon points="${points.map(S).join(' ')}" fill="#dbeafe" stroke="#1d4ed8" stroke-width="${f2(u * 0.5)}"/>`;
    G.edges(points).forEach((e, i) => {
      const t = add(mul(add(e.a, e.b), 0.5), G.vec(e.outward, u * 1.4));
      s += `<text x="${f2(t.x)}" y="${f2(-t.y)}" font-size="${f2(u * 1.1)}" text-anchor="middle" dominant-baseline="middle" fill="#333">${i + 1}: ${e.length.toFixed(2)}</text>`;
    });
  }
  s += `<circle cx="0" cy="0" r="${f2(u * 0.6)}" fill="#16a34a"/>`;
  return s + '</svg>';
}

/** Vista interactiva del plano. */
export class PlanView {
  constructor(container, { getProject, onChange, onSelect }) {
    Object.assign(this, { container, getProject, onChange, onSelect });
    this.tool = 'move';
    this.selectedId = null;
    container.addEventListener('pointerdown', (e) => this.down(e));
    container.addEventListener('pointermove', (e) => this.move(e));
    container.addEventListener('pointerup', (e) => this.up(e));
    container.addEventListener('pointercancel', (e) => this.up(e));
  }
  render() {
    this.container.innerHTML = planSVG(this.getProject(), { selectedId: this.selectedId });
    this.svg = this.container.querySelector('svg');
  }
  toWorld(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: p.x, y: -p.y };
  }
  room(id) { return this.getProject().rooms.find((r) => r.id === id); }

  down(e) {
    if (!this.svg) return;
    const t = e.target, project = this.getProject();
    const roomId = t.closest('[data-room]')?.dataset.room;
    if (this.tool === 'delete') {
      const g = t.closest('.opening');
      if (g) {
        this.room(g.dataset.room).openings.splice(+g.dataset.opening, 1);
        this.onChange(); this.render();
      }
      return;
    }
    if (['door', 'window', 'facade'].includes(this.tool) && t.classList.contains('wall-hit')) {
      const room = this.room(roomId), wi = +t.dataset.wall;
      if (this.tool === 'facade') {
        const key = `${room.id}:${wi}`;
        const cur = new Set(project.facadeManual?.length ? project.facadeManual : facadeWalls(project));
        cur.has(key) ? cur.delete(key) : cur.add(key);
        project.facadeManual = [...cur];
      } else {
        const ed = G.edges(worldPoints(room))[wi], w = this.toWorld(e);
        const d = { x: ed.b.x - ed.a.x, y: ed.b.y - ed.a.y };
        const tt = ((w.x - ed.a.x) * d.x + (w.y - ed.a.y) * d.y) / (ed.length ** 2);
        room.openings = room.openings || [];
        room.openings.push({ type: this.tool, wall: wi, t: Math.min(1, Math.max(0, tt)), width: this.tool === 'door' ? 0.82 : 1.2 });
      }
      this.onChange(); this.render();
      return;
    }
    if (this.tool === 'move') {
      this.selectedId = roomId || null;
      this.onSelect?.(this.selectedId);
      if (!roomId) { this.render(); return; }
      const room = this.room(roomId);
      this.drag = { room, start: this.toWorld(e), orig: { ...room.offset }, g: t.closest('g.room') };
      this.container.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }
  move(e) {
    if (!this.drag) return;
    const w = this.toWorld(e), { room, start, orig, g } = this.drag;
    let off = { x: orig.x + w.x - start.x, y: orig.y + w.y - start.y };
    // imán: acercar vértices a los de otras estancias
    let best = null;
    for (const other of this.getProject().rooms) {
      if (other === room) continue;
      for (const q of worldPoints(other)) for (const p of room.points) {
        const dx = q.x - (p.x + off.x), dy = q.y - (p.y + off.y), d = Math.hypot(dx, dy);
        if (d < 0.3 && (!best || d < best.d)) best = { d, dx, dy };
      }
    }
    if (best) off = { x: off.x + best.dx, y: off.y + best.dy };
    this.drag.off = off;
    g.setAttribute('transform', `translate(${f2(off.x - orig.x)},${f2(-(off.y - orig.y))})`);
  }
  up() {
    if (!this.drag) return;
    if (this.drag.off) { this.drag.room.offset = this.drag.off; this.onChange(); }
    this.drag = null;
    this.render();
  }
}
