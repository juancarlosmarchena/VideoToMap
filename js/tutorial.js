// Vídeo tutorial animado (canvas) del modo «vídeo continuo».
const W = 640, H = 720;
const ROOM = { w: 4.9, h: 3.5 };             // metros
const INSET = 0.4;                            // distancia de la persona a la pared
const S = 100, OX = (W - ROOM.w * S) / 2, OY = 120;
const P = (x, y) => [OX + x * S, OY + (ROOM.h - y) * S]; // y hacia arriba = Norte
// recorrido: empieza en la esquina SO, sentido horario
const PATH = [[INSET, INSET], [INSET, ROOM.h - INSET], [ROOM.w - INSET, ROOM.h - INSET], [ROOM.w - INSET, INSET], [INSET, INSET]];
const T = { intro: 3, rec: 1.5, wall: 2.6, back: 2.2, plan: 4 };
export const TUTORIAL_DURATION = T.intro + T.rec + 4 * T.wall + T.back + T.plan;

const CAPTIONS = [
  [0, '1 · Ponte en una esquina con el móvil vertical y la cámara mirando a lo largo de la pared.'],
  [T.intro, '2 · Pulsa ⏺ Grabar.'],
  [T.intro + T.rec, '3 · Camina pegado a la pared. En cada esquina gira y sigue: se detecta sola.'],
  [T.intro + T.rec + 4 * T.wall, '4 · De vuelta a la esquina inicial, pulsa ⏹ Terminar.'],
  [T.intro + T.rec + 4 * T.wall + T.back, '5 · Revisa las medidas y guarda. ¡Plano listo!'],
];

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; }
    else line = t;
  }
  ctx.fillText(line, x, y);
}

function frame(ctx, t) {
  const tWalk0 = T.intro + T.rec, tWalk1 = tWalk0 + 4 * T.wall, tPlan = tWalk1 + T.back;
  ctx.fillStyle = '#f5f7fb'; ctx.fillRect(0, 0, W, H);
  // título
  ctx.fillStyle = '#1d4ed8'; ctx.font = '700 26px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Cómo grabar una estancia', W / 2, 44);
  ctx.fillStyle = '#6b7280'; ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Vista desde arriba', W / 2, 70);

  // estancia
  const showPlan = t >= tPlan;
  ctx.lineWidth = 10; ctx.strokeStyle = '#222'; ctx.fillStyle = showPlan ? '#dbeafe' : '#fff';
  ctx.beginPath();
  [[0, 0], [0, ROOM.h], [ROOM.w, ROOM.h], [ROOM.w, 0]].forEach(([x, y], i) => (i ? ctx.lineTo(...P(x, y)) : ctx.moveTo(...P(x, y))));
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // posición actual de la persona
  let pos = PATH[0], dir = 0, k = 0, walking = false;
  if (t >= tWalk0 && t < tWalk1) {
    const u = (t - tWalk0) / T.wall; k = Math.floor(u); const f = u - k;
    const a = PATH[k], b = PATH[k + 1];
    pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    dir = Math.atan2(b[0] - a[0], b[1] - a[1]); walking = true;
  } else if (t >= tWalk1) { pos = PATH[4]; dir = Math.PI; k = 4; }

  // rastro
  if (t >= tWalk0) {
    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(...P(...PATH[0]));
    for (let i = 1; i <= Math.min(k, 4); i++) ctx.lineTo(...P(...PATH[i]));
    if (walking) ctx.lineTo(...P(...pos));
    ctx.stroke(); ctx.setLineDash([]);
  }
  // esquinas detectadas
  const corners = t >= tWalk0 ? Math.min(Math.floor((t - tWalk0) / T.wall), 4) : 0;
  for (let i = 1; i <= corners; i++) {
    const [x, y] = P(...PATH[i % 4]);
    ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✓', x, y + 5);
  }
  // aviso de esquina recién detectada
  if (walking && k >= 1 && (t - tWalk0) % T.wall < 1.1) {
    const [x, y] = P(...PATH[k]);
    ctx.fillStyle = '#16a34a'; ctx.font = '700 17px system-ui';
    ctx.textAlign = x > W / 2 ? 'right' : 'left';
    ctx.fillText(`Esquina ${k} detectada`, x + (x > W / 2 ? -18 : 18), y + (y > OY + ROOM.h * S / 2 ? -18 : 30));
  }

  if (!showPlan) {
    // persona con móvil y cono de cámara
    const [px, py] = P(...pos);
    const bob = walking ? Math.sin(t * 14) * 2 : 0;
    ctx.save(); ctx.translate(px, py + bob); ctx.rotate(dir);
    const g = ctx.createLinearGradient(0, 0, 0, -120);
    g.addColorStop(0, 'rgba(29,78,216,.45)'); g.addColorStop(1, 'rgba(29,78,216,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-45, -120); ctx.lineTo(45, -120); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(0, 8, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#93c5fd'; ctx.fillRect(-9, -14, 18, 8);
    ctx.restore();
    if (t < T.intro && Math.floor(t * 2) % 2 === 0) {
      ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 30, 0, 7); ctx.stroke();
    }
  } else {
    // plano final con cotas
    ctx.fillStyle = '#111'; ctx.font = '700 24px system-ui'; ctx.textAlign = 'center';
    const [cx, cy] = P(ROOM.w / 2, ROOM.h / 2);
    ctx.fillText('Salón', cx, cy - 4);
    ctx.font = '18px system-ui'; ctx.fillText(`${(ROOM.w * ROOM.h).toFixed(2)} m²`, cx, cy + 22);
    ctx.fillStyle = '#555'; ctx.font = '16px system-ui';
    ctx.fillText(`${ROOM.w.toFixed(2)} m`, cx, OY - 12);
    ctx.fillText(`${ROOM.w.toFixed(2)} m`, cx, OY + ROOM.h * S + 26);
    ctx.save(); ctx.translate(OX - 16, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(`${ROOM.h.toFixed(2)} m`, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(OX + ROOM.w * S + 18, cy); ctx.rotate(Math.PI / 2); ctx.fillText(`${ROOM.h.toFixed(2)} m`, 0, 0); ctx.restore();
  }

  // HUD del móvil
  const hx = W - 190, hy = OY + ROOM.h * S + 50;
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.roundRect(hx, hy, 170, 92, 14); ctx.fill();
  ctx.textAlign = 'left'; ctx.font = '700 16px system-ui';
  const rec = t >= T.intro && t < tPlan;
  ctx.fillStyle = rec ? (Math.floor(t * 2) % 2 ? '#f87171' : '#7f1d1d') : '#9ca3af';
  ctx.fillText(rec ? '● REC' : (showPlan ? '✔ Guardado' : '○ Listo'), hx + 14, hy + 26);
  const headings = [0, 90, 180, 270, 180];
  const hd = t >= tWalk0 ? headings[Math.min(k, 4)] : 0;
  const steps = t >= tWalk0 ? Math.round(Math.min(t - tWalk0, 4 * T.wall) / T.wall * 6) : 0;
  ctx.fillStyle = '#fff'; ctx.font = '15px system-ui';
  ctx.fillText(`🧭 ${hd}°   👣 ${steps} pasos`, hx + 14, hy + 52);
  ctx.fillText(`Esquinas: ${corners}`, hx + 14, hy + 76);

  // botón
  const bx = 30, by = hy + 18;
  if (t >= T.intro - 0.4 && t < T.intro + T.rec) {
    const pulse = 1 + Math.sin(t * 10) * 0.06;
    ctx.save(); ctx.translate(bx + 90, by + 28); ctx.scale(pulse, pulse);
    ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.roundRect(-90, -28, 180, 56, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⏺ Grabar', 0, 7);
    ctx.restore();
  } else if (t >= tWalk1 && t < tPlan) {
    ctx.fillStyle = '#1d4ed8'; ctx.beginPath(); ctx.roundRect(bx, by, 180, 56, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⏹ Terminar', bx + 90, by + 35);
  }

  // subtítulo
  const cap = [...CAPTIONS].reverse().find(([s]) => t >= s)[1];
  ctx.fillStyle = 'rgba(17,24,39,.92)'; ctx.fillRect(0, H - 92, W, 92);
  ctx.fillStyle = '#fff'; ctx.font = '600 20px system-ui'; ctx.textAlign = 'center';
  wrap(ctx, cap, W / 2, H - 56, W - 50, 26);
  // barra de progreso
  ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, H - 4, (W * t) / TUTORIAL_DURATION, 4);
}

/** Reproduce el tutorial en bucle en un canvas. Devuelve una función para pararlo. */
export function playTutorial(canvas, { loop = true, onEnd } = {}) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); }; // iOS < 16
  let start = performance.now(), raf;
  const tick = (now) => {
    let t = Math.max(0, (now - start) / 1000);
    if (t >= TUTORIAL_DURATION) {
      if (!loop) { frame(ctx, TUTORIAL_DURATION - 0.01); onEnd?.(); return; }
      start = now; t = 0;
    }
    frame(ctx, t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
