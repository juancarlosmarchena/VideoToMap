import * as G from './geometry.js';
import { sensors, onSensors, enableSensors, setManualHeading, addSimulatedStep, getPosition, reverseGeocode } from './sensors.js';
import { openCamera, stopCamera, startRecording, stopRecording, snapshot } from './camera.js';
import { arSupported, captureAR } from './ar.js';
import { playTutorial } from './tutorial.js';
import { PlanView, planSVG, roomPreviewSVG, roomArea, totalArea, worldPoints } from './plan.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const KEY = 'videotomap.project.v1';
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- Estado ----------
const defaults = () => ({
  name: 'Mi vivienda', address: '', location: null, facade: null, rooms: [], facadeManual: [],
  settings: { stepLength: 0.7, compassCorrection: 0, wallInset: 0.35 },
});
let project = load();
const videos = new Map(); // roomId → Blob (solo en memoria)

function load() {
  try {
    const p = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY)) };
    p.settings = { ...defaults().settings, ...p.settings };
    return p;
  } catch { return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(project)); }
  catch { toast('No se pudo guardar en el dispositivo (¿almacenamiento lleno?).'); }
}

let toastTimer;
function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}
const fmtH = (h) => (h == null ? '— °' : `${Math.round(h)}° ${G.cardinalShort(h)}`);

// ---------- Pestañas ----------
$$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(name) {
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  if (name !== 'fachada' && name !== 'estancias') stopCamera();
  if (name === 'plano') renderPlan();
  if (name === 'estancias') renderRooms();
}

// ---------- Cabecera, sensores y ajustes ----------
$('#project-name').value = project.name;
$('#project-name').addEventListener('input', (e) => { project.name = e.target.value; save(); });

sensors.correction = project.settings.compassCorrection || 0;
$('#btn-sensors').addEventListener('click', async () => {
  try {
    await enableSensors();
    $('#btn-sensors').textContent = 'Sensores ✓';
    setTimeout(() => { if (sensors.heading == null) toast('No llegan datos de brújula. En escritorio usa el rumbo simulado de Ajustes.'); }, 2500);
  } catch (e) { toast(e.message); }
});
onSensors((s) => {
  $('#sensor-bar').textContent = `Brújula: ${fmtH(s.heading)}${s.headingSource ? ` (${s.headingSource})` : ''} · Pasos: ${s.steps}`;
});

$('#set-step').value = project.settings.stepLength;
$('#set-corr').value = project.settings.compassCorrection;
$('#set-inset').value = project.settings.wallInset;
$('#set-inset').addEventListener('change', (e) => { project.settings.wallInset = Math.max(0, +e.target.value || 0); save(); });
$('#set-step').addEventListener('change', (e) => { project.settings.stepLength = +e.target.value || 0.7; save(); });
$('#set-corr').addEventListener('change', (e) => { project.settings.compassCorrection = +e.target.value || 0; sensors.correction = project.settings.compassCorrection; save(); });
$('#btn-calc-step').addEventListener('click', () => {
  const h = +$('#set-height').value;
  if (!h) return toast('Introduce tu altura en cm.');
  project.settings.stepLength = +(h * 0.00415).toFixed(2);
  $('#set-step').value = project.settings.stepLength; save();
  toast(`Paso estimado: ${project.settings.stepLength} m`);
});
$('#set-sim').addEventListener('input', (e) => setManualHeading(+e.target.value));
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('¿Borrar todo el proyecto?')) return;
  project = defaults(); save(); location.reload();
});

// ---------- 1. Ubicación ----------
function renderLocation() {
  const l = project.location;
  $('#address').value = project.address || '';
  $('#btn-geocode').disabled = !l;
  if (!l) return;
  $('#loc-info').innerHTML = `<b>${l.lat.toFixed(6)}, ${l.lon.toFixed(6)}</b> · precisión ±${Math.round(l.accuracy)} m`
    + (l.altitude != null ? ` · altitud ${Math.round(l.altitude)} m` : '')
    + `<br><a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=19/${l.lat}/${l.lon}">Ver en OpenStreetMap</a>`
    + ` · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${l.lat},${l.lon}">Google Maps</a>`;
  const d = 0.0015;
  $('#map').src = `https://www.openstreetmap.org/export/embed.html?bbox=${l.lon - d},${l.lat - d},${l.lon + d},${l.lat + d}&layer=mapnik&marker=${l.lat},${l.lon}`;
  $('#map-wrap').hidden = false;
}
$('#btn-locate').addEventListener('click', async () => {
  $('#loc-info').textContent = 'Obteniendo ubicación…';
  try {
    project.location = await getPosition(); save(); renderLocation();
    if (project.location.accuracy > 50) toast('Precisión baja: sal al exterior o espera unos segundos y repite.');
  } catch (e) { $('#loc-info').textContent = e.message; }
});
$('#btn-geocode').addEventListener('click', async () => {
  try {
    project.address = await reverseGeocode(project.location.lat, project.location.lon);
    save(); renderLocation();
  } catch (e) { toast(e.message); }
});
$('#address').addEventListener('input', (e) => { project.address = e.target.value; save(); });

// ---------- 2. Fachada ----------
const recent = [];
onSensors((s) => {
  if (s.heading == null) return;
  recent.push({ h: s.heading, t: performance.now() });
  while (recent.length && performance.now() - recent[0].t > 1200) recent.shift();
  $('#facade-live').textContent = `Cámara: ${fmtH(s.heading)} → fachada ${fmtH(G.norm360(s.heading + 180))}`;
});
$('#btn-facade-cam').addEventListener('click', async () => {
  try { await openCamera($('#facade-video')); } catch (e) { toast(e.message); }
});
$('#btn-facade-capture').addEventListener('click', () => {
  if (sensors.heading == null) return toast('Activa los sensores (botón superior) o introduce el rumbo manualmente.');
  const cam = G.circularMean(recent.map((r) => r.h)) ?? sensors.heading;
  project.facade = { heading: G.norm360(cam + 180), cameraHeading: cam, photo: snapshot($('#facade-video')), time: new Date().toISOString(), source: sensors.headingSource };
  save(); renderFacade(); navigator.vibrate?.(40);
});
$('#btn-facade-manual').addEventListener('click', () => {
  const v = parseFloat($('#facade-manual').value);
  if (!Number.isFinite(v)) return toast('Introduce un rumbo entre 0 y 359.');
  project.facade = { heading: G.norm360(v), cameraHeading: G.norm360(v + 180), photo: null, time: new Date().toISOString(), source: 'Manual' };
  save(); renderFacade();
});
function compassSVG(h) {
  const marks = ['N', 'E', 'S', 'O'].map((c, i) => {
    const v = G.vec(i * 90, 62);
    return `<text x="${v.x}" y="${-v.y}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="700" fill="${c === 'N' ? '#c0392b' : '#333'}">${c}</text>`;
  }).join('');
  const a = G.vec(h, 48);
  return `<svg class="compass" viewBox="-80 -80 160 160"><circle r="74" fill="#fff" stroke="#cbd5e1"/>${marks}
    <rect x="-30" y="-8" width="60" height="16" fill="#94a3b8" transform="rotate(${h})"/>
    <line x1="0" y1="0" x2="${a.x}" y2="${-a.y}" stroke="#e67e22" stroke-width="5" marker-end="url(#ca)"/>
    <defs><marker id="ca" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10z" fill="#e67e22"/></marker></defs></svg>`;
}
function renderFacade() {
  const f = project.facade;
  if (!f) return;
  $('#facade-result').innerHTML = `<b>Fachada orientada al ${G.cardinal(f.heading)} (${Math.round(f.heading)}°)</b><br>
    ${G.sunComment(f.heading, project.location?.lat)}<br><small>Medido: ${new Date(f.time).toLocaleString('es-ES')} · ${f.source || ''}</small>
    ${compassSVG(f.heading)}${f.photo ? `<img class="facade-photo" src="${f.photo}" alt="Fachada">` : ''}`;
}

// ---------- 3. Estancias: captura ----------
const HELP = {
  auto: 'Graba un único vídeo dando la vuelta a la estancia pegado a las paredes, con la cámara mirando hacia donde caminas. No hay que pulsar nada en las esquinas: se detectan solas por el giro de la brújula, y la longitud sale de tus pasos.',
  steps: 'Empieza en una esquina. Apunta la cámara a lo largo de la pared y camina pegado a ella hasta la siguiente esquina; pulsa «Esquina» en cada rincón. La brújula da la dirección y el podómetro la longitud.',
  tape: 'Igual que el anterior, pero escribes la longitud de cada pared medida con cinta o medidor láser antes de pulsar «Esquina». Es el método más preciso sin AR.',
  ar: 'Usa la cámara en realidad aumentada (Chrome Android con ARCore). Apunta al suelo junto a cada esquina y pulsa «Marcar esquina»; la medida es real en metros.',
  manual: 'Introduce las paredes a mano: rumbo de cada pared (dirección en la que la recorres) y longitud.',
};
const updateHelp = () => ($('#method-help').textContent = HELP[$('#room-method').value]);
$('#room-method').addEventListener('change', updateHelp);
updateHelp();
arSupported().then((ok) => { if (!ok) $('#room-method option[value=ar]').textContent += ' — no disponible en este dispositivo'; });

// ---------- Tutorial ----------
let stopTut = null, tutGo = null, tutShown = false;
function openTutorial(onGo) {
  tutGo = onGo || null;
  $('#btn-tutorial-go').textContent = onGo ? 'Entendido, ¡a grabar!' : 'Entendido';
  $('#tutorial-hide').checked = localStorage.getItem('videotomap.tutorialSeen') === '1';
  $('#tutorial').hidden = false;
  stopTut = playTutorial($('#tutorial-canvas'));
}
function closeTutorial(go) {
  stopTut?.(); $('#tutorial').hidden = true;
  localStorage.setItem('videotomap.tutorialSeen', $('#tutorial-hide').checked ? '1' : '0');
  if (go && tutGo) tutGo();
}
$('#btn-tutorial').addEventListener('click', () => openTutorial());
$('#btn-tutorial-close').addEventListener('click', () => closeTutorial(false));
$('#btn-tutorial-go').addEventListener('click', () => closeTutorial(true));

let cap = null; // captura en curso
let editing = null; // {room, isNew}

onSensors((s) => {
  if (!cap) return;
  $('#cap-heading').textContent = fmtH(s.heading);
  if (cap.wall && s.heading != null) cap.wall.samples.push(s.heading);
  if (cap.method === 'auto' && cap.started) {
    const now = performance.now();
    if (s.heading != null) cap.hbuf.push({ h: s.heading, t: now });
    while (cap.hbuf.length > 1 && now - cap.hbuf[0].t > 700) cap.hbuf.shift();
    while (cap.lastSteps < s.steps) {
      cap.lastSteps++;
      const h = G.circularMean(cap.hbuf.map((x) => x.h));
      if (h != null) cap.stepLog.push(h);
    }
  }
  updateCapHUD();
});

$('#btn-room-start').addEventListener('click', async () => {
  const method = $('#room-method').value;
  if (method === 'auto' && localStorage.getItem('videotomap.tutorialSeen') !== '1' && !tutShown) {
    tutShown = true; // una vez por sesión
    return openTutorial(() => $('#btn-room-start').click());
  }
  const name = $('#room-name').value.trim() || `Estancia ${project.rooms.length + 1}`;
  if (method === 'manual') {
    return openEditor({ id: uid(), name, method, rawWalls: [{ heading: 0, length: 4 }, { heading: 90, length: 3 }, { heading: 180, length: 4 }, { heading: 270, length: 3 }], options: { square: true, autoClose: false } }, true);
  }
  if (method === 'ar') return startAR(name);
  if (!sensors.orientationOn) { try { await enableSensors(); } catch (e) { toast(e.message); } }
  try { await openCamera($('#capture-video')); } catch (e) { return toast(e.message); }
  cap = { name, method, walls: [], wall: null, recording: method === 'auto' ? false : startRecording(), started: false, stepLog: [], hbuf: [], lastSteps: sensors.steps };
  $('#rec-dot').hidden = !cap.recording;
  $('#new-room').hidden = true; $('#capture').hidden = false; $('#editor').hidden = true;
  $('#tape-row').hidden = method !== 'tape';
  $('#btn-cap-step').hidden = method === 'tape';
  $('#btn-cap-undo').hidden = method === 'auto';
  $('#btn-cap-corner').hidden = false;
  $('#cap-live').hidden = method !== 'auto';
  $('#btn-cap-corner').textContent = method === 'auto' ? '⏺ Grabar' : '📍 Estoy en la esquina inicial';
  $('#btn-cap-finish').textContent = method === 'auto' ? '⏹ Terminar' : '✔ Terminar';
  updateCapHUD();
});

function autoSegments() {
  return G.segmentWalk(cap.stepLog).map((w) => ({ heading: w.heading, length: w.steps * project.settings.stepLength }));
}
function updateCapHUD() {
  if (!cap) return;
  if (cap.method === 'auto') {
    const n = cap.stepLog.length;
    $('#cap-steps').textContent = cap.started ? `👣 ${n} pasos ≈ ${(n * project.settings.stepLength).toFixed(1)} m` : '';
    if (!cap.started) {
      $('#cap-instr').textContent = 'Ponte en una esquina, móvil vertical y cámara mirando a lo largo de la pared. Pulsa ⏺ Grabar y empieza a caminar.';
      $('#cap-walls').innerHTML = '';
      $('#cap-live').innerHTML = '';
      return;
    }
    const segs = autoSegments();
    $('#cap-instr').textContent = `Camina pegado a la pared y gira en cada esquina. Paredes detectadas: ${segs.length}. Al volver a la esquina inicial, pulsa ⏹ Terminar.`;
    $('#cap-walls').innerHTML = segs.map((w) => `<li>${fmtH(w.heading)} · ${w.length.toFixed(2)} m</li>`).join('');
    const raw = [{ x: 0, y: 0 }];
    cap.stepLog.forEach((h) => { const v = G.vec(h, project.settings.stepLength), p = raw.at(-1); raw.push({ x: p.x + v.x, y: p.y + v.y }); });
    $('#cap-live').innerHTML = roomPreviewSVG([], raw);
    return;
  }
  const L = project.settings.stepLength;
  const st = cap.wall ? sensors.steps - cap.wall.steps0 : 0;
  $('#cap-steps').textContent = cap.method === 'steps' && cap.wall ? `${st} pasos ≈ ${(st * L).toFixed(2)} m` : '';
  $('#cap-instr').textContent = !cap.wall
    ? 'Colócate en una esquina de la estancia, con la pared a tu lado, y pulsa el botón.'
    : `Pared ${cap.walls.length + 1}: apunta la cámara en la dirección de la pared y camina hasta la siguiente esquina.`;
  $('#cap-walls').innerHTML = cap.walls.map((w) => `<li>${fmtH(w.heading)} · ${w.length.toFixed(2)} m</li>`).join('');
}

$('#btn-cap-corner').addEventListener('click', () => {
  if (!cap) return;
  if (cap.method === 'auto') {
    if (cap.started) return;
    cap.started = true;
    cap.lastSteps = sensors.steps;
    cap.recording = startRecording();
    $('#rec-dot').hidden = !cap.recording;
    $('#btn-cap-corner').hidden = true;
    navigator.vibrate?.(40);
    if (!sensors.motionOn || sensors.heading == null) toast('⚠ No llegan datos de brújula/pasos: activa los sensores.');
    updateCapHUD();
    return;
  }
  if (cap.wall) {
    const w = cap.wall;
    let heading = G.circularMean(w.samples.slice(Math.floor(w.samples.length * 0.15))) ?? sensors.heading;
    if (heading == null) heading = cap.walls.length ? G.norm360(cap.walls.at(-1).heading + 90) : 0;
    let length;
    if (cap.method === 'tape') {
      length = parseFloat($('#tape-length').value.replace?.(',', '.') ?? $('#tape-length').value);
      if (!(length > 0)) return toast('Escribe la longitud medida de esta pared.');
      $('#tape-length').value = '';
    } else {
      length = (sensors.steps - w.steps0) * project.settings.stepLength;
      if (length <= 0) toast('No se han detectado pasos: podrás corregir la longitud al terminar.');
    }
    cap.walls.push({ heading, length, steps: sensors.steps - w.steps0 });
    navigator.vibrate?.(30);
  }
  cap.wall = { samples: [], steps0: sensors.steps };
  $('#btn-cap-corner').textContent = '📍 Esquina (siguiente pared)';
  updateCapHUD();
});
$('#btn-cap-step').addEventListener('click', addSimulatedStep);
$('#btn-cap-undo').addEventListener('click', () => {
  if (!cap) return;
  cap.walls.pop();
  cap.wall = { samples: [], steps0: sensors.steps };
  updateCapHUD();
});
$('#btn-cap-cancel').addEventListener('click', async () => {
  await stopRecording(); stopCamera(); cap = null;
  $('#capture').hidden = true; $('#new-room').hidden = false;
});
$('#btn-cap-finish').addEventListener('click', async () => {
  if (!cap) return;
  if (cap.wall && cap.walls.length && (sensors.steps - cap.wall.steps0 > 0 || cap.method === 'tape' && $('#tape-length').value)) {
    $('#btn-cap-corner').click(); // cerrar la pared en curso
  }
  if (cap.method === 'auto') {
    cap.walls = autoSegments();
    if (cap.stepLog.length < 4) toast('Se detectaron muy pocos pasos. Revisa las longitudes en la tabla.', 5000);
  }
  const blob = await stopRecording();
  stopCamera();
  const c = cap; cap = null;
  $('#capture').hidden = true;
  if (c.walls.length < 2) {
    $('#cap-live').hidden = true; $('#new-room').hidden = false; return toast('Se necesitan al menos 2 paredes.'); }
  const id = uid();
  if (blob) videos.set(id, blob);
  // Si faltan una o más paredes por recorrer, sugerir el cierre automático.
  const e = c.walls.reduce((a, w) => { const v = G.vec(w.heading, w.length); return { x: a.x + v.x, y: a.y + v.y }; }, { x: 0, y: 0 });
  const per = c.walls.reduce((a, w) => a + w.length, 0);
  openEditor({ id, name: c.name, method: c.method, rawWalls: c.walls.map(({ heading, length }) => ({ heading, length })), options: { square: true, autoClose: Math.hypot(e.x, e.y) > per * 0.2 }, inset: c.method === 'tape' ? 0 : project.settings.wallInset }, true);
});

async function startAR(name) {
  if (!(await arSupported())) return toast('La realidad aumentada (WebXR) no está disponible aquí. Usa Chrome en Android con ARCore, o elige otro método.', 5000);
  if (!sensors.orientationOn) { try { await enableSensors(); } catch { /* sin brújula */ } }
  try {
    const r = await captureAR({ overlay: $('#ar-overlay'), info: $('#ar-info'), btnMark: $('#ar-mark'), btnUndo: $('#ar-undo'), btnDone: $('#ar-done'), btnCancel: $('#ar-cancel') });
    if (!r || r.points.length < 3) return toast('Captura AR cancelada o con menos de 3 esquinas.');
    if (!r.compass) toast('Sin brújula: la estancia no está orientada al Norte. Gírala en el plano.', 5000);
    else if (r.offsetSpread > 20) toast(`La brújula fue inestable (±${Math.round(r.offsetSpread)}°). Revisa la orientación.`, 5000);
    openEditor({ id: uid(), name, method: 'ar', rawWalls: G.wallsFromPoints(r.points), options: { square: false, autoClose: false } }, true);
  } catch (e) { toast(`Error AR: ${e.message}`, 5000); }
}

// ---------- 3b. Editor de estancia ----------
function openEditor(room, isNew) {
  editing = { room: JSON.parse(JSON.stringify(room)), isNew };
  $('#new-room').hidden = true; $('#capture').hidden = true; $('#editor').hidden = false;
  $('#ed-title').textContent = room.name;
  $('#ed-square').checked = !!room.options?.square;
  $('#ed-autoclose').checked = !!room.options?.autoClose;
  $('#ed-inset').value = room.inset || 0;
  renderEditor();
  $('#editor').scrollIntoView({ behavior: 'smooth' });
}
function renderEditor() {
  const r = editing.room;
  $('#ed-walls').innerHTML = r.rawWalls.map((w, i) => `<tr>
    <td>${i + 1}</td>
    <td><input type="number" step="1" data-i="${i}" data-k="heading" value="${Math.round(w.heading)}"></td>
    <td><input type="number" step="0.01" min="0" data-i="${i}" data-k="length" value="${w.length.toFixed(2)}"></td>
    <td><button class="btn small danger" data-del="${i}">✖</button></td></tr>`).join('');
  updatePreview();
}
function computeRoom(r) {
  const res = G.closeRoom(r.rawWalls, { square: $('#ed-square').checked, autoClose: $('#ed-autoclose').checked });
  r.inset = Math.max(0, parseFloat($('#ed-inset').value) || 0);
  if (res.valid && r.inset) res.points = G.offsetPolygon(res.points, r.inset);
  return res;
}
function updatePreview() {
  const r = editing.room, res = computeRoom(r);
  const raw = [{ x: 0, y: 0 }];
  r.rawWalls.forEach((w) => { const v = G.vec(w.heading, w.length), p = raw.at(-1); raw.push({ x: p.x + v.x, y: p.y + v.y }); });
  $('#ed-preview').innerHTML = roomPreviewSVG(res.points, raw);
  const per = r.rawWalls.reduce((a, w) => a + w.length, 0);
  const pct = per ? (100 * res.closureError) / per : 0;
  $('#ed-stats').innerHTML = res.valid
    ? `Superficie: <b>${G.polygonArea(res.points).toFixed(2)} m²</b> · Perímetro: ${G.perimeter(res.points).toFixed(2)} m · Error de cierre corregido: ${res.closureError.toFixed(2)} m (${pct.toFixed(1)} %)${pct > 15 ? '<br>⚠ Error alto: revisa longitudes o activa el cierre automático.' : ''}`
    : '⚠ Se necesitan al menos 3 paredes válidas.';
  return res;
}
$('#ed-walls').addEventListener('input', (e) => {
  const { i, k } = e.target.dataset;
  if (i == null) return;
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v)) { editing.room.rawWalls[+i][k] = v; updatePreview(); }
});
$('#ed-walls').addEventListener('click', (e) => {
  const d = e.target.dataset.del;
  if (d == null) return;
  editing.room.rawWalls.splice(+d, 1); renderEditor();
});
$('#btn-ed-add').addEventListener('click', () => {
  const w = editing.room.rawWalls;
  w.push({ heading: w.length ? G.norm360(w.at(-1).heading + 90) : 0, length: 3 });
  renderEditor();
});
$('#ed-square').addEventListener('change', updatePreview);
$('#ed-autoclose').addEventListener('change', updatePreview);
$('#ed-inset').addEventListener('input', updatePreview);
$('#btn-ed-cancel').addEventListener('click', () => {
  if (editing?.isNew) videos.delete(editing.room.id);
  editing = null; $('#editor').hidden = true; $('#new-room').hidden = false;
});
$('#btn-ed-save').addEventListener('click', () => {
  const res = updatePreview();
  if (!res.valid) return toast('La estancia no es válida.');
  const r = editing.room;
  r.options = { square: $('#ed-square').checked, autoClose: $('#ed-autoclose').checked };
  r.points = res.points;
  // Alinear con el eje del edificio si la desviación es pequeña (error de brújula).
  const others = project.rooms.filter((x) => x.id !== r.id);
  if (r.options.square && others.length) {
    const axis = G.dominantAxis(others.flatMap((x) => G.wallsFromPoints(x.points)));
    const mine = G.dominantAxis(G.wallsFromPoints(r.points));
    const d = G.angleDiff(axis * 4, mine * 4) / 4;
    if (Math.abs(d) > 0.05 && Math.abs(d) <= 8) {
      r.points = G.rotatePoints(r.points, d, { x: 0, y: 0 });
      toast(`Estancia alineada ${d.toFixed(1)}° con el resto de la vivienda.`);
    }
  }
  r.openings = (r.openings || []).filter((o) => o.wall < res.points.length);
  if (editing.isNew) {
    // Colocar a la derecha de lo ya dibujado
    const xs = project.rooms.flatMap(worldPoints).map((p) => p.x);
    const minX = Math.min(...res.points.map((p) => p.x));
    r.offset = { x: xs.length ? Math.max(...xs) + 0.5 - minX : 0, y: 0 };
    r.created = new Date().toISOString();
    project.rooms.push(r);
  } else {
    const i = project.rooms.findIndex((x) => x.id === r.id);
    project.rooms[i] = r;
  }
  save();
  editing = null;
  $('#editor').hidden = true; $('#new-room').hidden = false;
  $('#room-name').value = '';
  renderRooms();
  toast('Estancia guardada. Añade otra o ve a «Plano».');
});

function renderRooms() {
  const list = $('#room-list');
  if (!project.rooms.length) { list.innerHTML = '<p class="hint">Todavía no hay estancias. Captura la primera abajo.</p>'; return; }
  list.innerHTML = project.rooms.map((r) => `<div class="room-card">
      ${roomPreviewSVG(r.points)}
      <div class="meta"><b>${r.name.replace(/</g, '&lt;')}</b><br>${roomArea(r).toFixed(2)} m² · ${r.points.length} paredes<br><small>${({ steps: 'Vídeo + pasos', tape: 'Vídeo + cinta', ar: 'AR', manual: 'Manual', auto: 'Vídeo continuo' })[r.method] || ''}</small>
        <div class="acts">
          <button class="btn small" data-edit="${r.id}">Editar</button>
          ${videos.has(r.id) ? `<button class="btn small" data-video="${r.id}">⬇ Vídeo</button>` : ''}
          <button class="btn small danger" data-remove="${r.id}">Borrar</button>
        </div></div></div>`).join('');
}
$('#room-list').addEventListener('click', (e) => {
  const t = e.target.dataset;
  if (t.edit) openEditor(project.rooms.find((r) => r.id === t.edit), false);
  if (t.video) {
    const b = videos.get(t.video), r = project.rooms.find((x) => x.id === t.video);
    download(b, `${r.name}.${b.type.includes('mp4') ? 'mp4' : 'webm'}`);
  }
  if (t.remove && confirm('¿Borrar esta estancia?')) {
    project.rooms = project.rooms.filter((r) => r.id !== t.remove);
    project.facadeManual = (project.facadeManual || []).filter((k) => !k.startsWith(`${t.remove}:`));
    save(); renderRooms();
  }
});

// ---------- 4. Plano ----------
const TOOL_HELP = {
  move: 'Arrastra las estancias para encajarlas (se imantan por las esquinas). Toca una para seleccionarla.',
  door: 'Toca una pared para añadir una puerta en ese punto.',
  window: 'Toca una pared para añadir una ventana en ese punto.',
  facade: 'Toca paredes para marcarlas o desmarcarlas como fachada (por defecto se detectan automáticamente).',
  delete: 'Toca una puerta o ventana para eliminarla.',
};
const view = new PlanView($('#plan'), {
  getProject: () => project,
  onChange: () => { save(); renderSummary(); },
  onSelect: (id) => showRoomPanel(id),
});
$$('#tools [data-tool]').forEach((b) => b.addEventListener('click', () => {
  view.tool = b.dataset.tool;
  $$('#tools [data-tool]').forEach((x) => x.classList.toggle('active', x === b));
  $('#plan').className = `plan tool-${view.tool}`;
  $('#tool-help').textContent = TOOL_HELP[view.tool];
}));
$('#plan').className = 'plan tool-move';

function renderPlan() { view.render(); renderSummary(); showRoomPanel(view.selectedId); }
function renderSummary() {
  const rows = project.rooms.map((r) => `<tr><td>${r.name.replace(/</g, '&lt;')}</td><td style="text-align:right">${roomArea(r).toFixed(2)} m²</td></tr>`).join('');
  $('#plan-summary').innerHTML = project.rooms.length
    ? `<table style="width:100%">${rows}<tr><td><b>Total</b></td><td style="text-align:right"><b>${totalArea(project).toFixed(2)} m²</b></td></tr></table>`
    : 'Captura estancias en la pestaña 3 para ver el plano.';
}
function showRoomPanel(id) {
  const r = project.rooms.find((x) => x.id === id);
  $('#room-panel').hidden = !r;
  if (r) $('#rp-name').value = r.name;
}
$('#rp-name').addEventListener('input', (e) => {
  const r = project.rooms.find((x) => x.id === view.selectedId);
  if (r) { r.name = e.target.value; save(); view.render(); }
});
$$('#room-panel [data-rot]').forEach((b) => b.addEventListener('click', () => {
  const r = project.rooms.find((x) => x.id === view.selectedId);
  if (!r) return;
  r.points = G.rotatePoints(r.points, +b.dataset.rot);
  r.rawWalls = G.wallsFromPoints(r.points);
  r.options = { square: false, autoClose: false };
  r.inset = 0;
  save(); view.render(); renderSummary();
}));
$('#rp-delete').addEventListener('click', () => {
  if (!confirm('¿Eliminar la estancia seleccionada?')) return;
  project.rooms = project.rooms.filter((x) => x.id !== view.selectedId);
  view.selectedId = null; save(); renderPlan();
});

// Exportación
const fileBase = () => (project.name || 'plano').replace(/[^\w\-áéíóúñü ]+/gi, '').trim().replace(/\s+/g, '_') || 'plano';
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const svgBlob = () => new Blob([planSVG(project)], { type: 'image/svg+xml' });
async function pngBlob(width = 2400) {
  const url = URL.createObjectURL(svgBlob());
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
  const vb = new DOMParser().parseFromString(planSVG(project), 'image/svg+xml').documentElement.getAttribute('viewBox').split(' ').map(Number);
  const c = document.createElement('canvas');
  c.width = width; c.height = Math.round((width * vb[3]) / vb[2]);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
$('#btn-exp-svg').addEventListener('click', () => download(svgBlob(), `${fileBase()}.svg`));
$('#btn-exp-png').addEventListener('click', async () => download(await pngBlob(), `${fileBase()}.png`));
$('#btn-exp-json').addEventListener('click', () => download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${fileBase()}.json`));
$('#inp-json').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!Array.isArray(p.rooms)) throw new Error();
    project = { ...defaults(), ...p }; save();
    $('#project-name').value = project.name;
    renderLocation(); renderFacade(); renderPlan();
    toast('Proyecto cargado.');
  } catch { toast('Archivo no válido.'); }
});
$('#btn-print').addEventListener('click', () => { showTab('plano'); setTimeout(() => window.print(), 100); });
$('#btn-share').addEventListener('click', async () => {
  try {
    const file = new File([await pngBlob()], `${fileBase()}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: project.name });
    else download(file, file.name);
  } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir.'); }
});

// ---------- Inicio ----------
renderLocation();
renderFacade();
renderRooms();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (!window.isSecureContext) toast('Abre la app por HTTPS: la cámara, la ubicación y la brújula lo requieren.', 6000);
