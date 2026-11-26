// Modo AR (WebXR + hit-test): se marcan las esquinas sobre el suelo con medida real.
// Disponible en Chrome para Android con ARCore. La orientación al Norte se obtiene
// comparando el rumbo de la brújula con el rumbo de la cámara en el espacio XR.
import { xrToPlan, xrHeading, circularMean, angleDiff } from './geometry.js';
import { sensors } from './sensors.js';

export async function arSupported() {
  try { return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'))); }
  catch { return false; }
}

const VS = 'attribute vec3 p;uniform mat4 P,V;void main(){gl_Position=P*V*vec4(p,1.);gl_PointSize=14.;}';
const FS = 'precision mediump float;uniform vec4 c;void main(){gl_FragColor=c;}';

function program(gl) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  return pr;
}

/**
 * @param {{overlay: HTMLElement, info: HTMLElement, btnMark: HTMLElement,
 *          btnUndo: HTMLElement, btnDone: HTMLElement, btnCancel: HTMLElement}} ui
 * @returns {Promise<null|{points:{x:number,y:number}[], offset:number, compass:boolean}>}
 */
export async function captureAR(ui) {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'local-floor'],
    domOverlay: { root: ui.overlay },
  });
  ui.overlay.hidden = false;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
  await gl.makeXRCompatible?.();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
  let ref;
  try { ref = await session.requestReferenceSpace('local-floor'); }
  catch { ref = await session.requestReferenceSpace('local'); }
  const viewer = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource({ space: viewer });

  const pr = program(gl);
  const buf = gl.createBuffer();
  const loc = { p: gl.getAttribLocation(pr, 'p'), P: gl.getUniformLocation(pr, 'P'), V: gl.getUniformLocation(pr, 'V'), c: gl.getUniformLocation(pr, 'c') };

  const pts = [];         // puntos XR {x,y,z}
  const offsets = [];     // muestras de desfase brújula-XR
  let reticle = null, fwdHeading = null, result = null;

  const draw = (arr, mode, color) => {
    if (!arr.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr.flatMap((p) => [p.x, p.y, p.z])), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.p);
    gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(loc.c, color);
    gl.drawArrays(mode, 0, arr.length);
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  const updateInfo = () => {
    let t = `${pts.length} esquina(s)`;
    if (!reticle) t += ' · Apunta al suelo y mueve el móvil despacio…';
    else if (pts.length) {
      t += ` · tramo: ${dist(pts[pts.length - 1], reticle).toFixed(2)} m`;
      if (pts.length >= 3 && dist(pts[0], reticle) < 0.25) t += ' · ✔ junto al inicio: pulsa Terminar';
    }
    if (sensors.heading == null) t += ' · ⚠ sin brújula (podrás girar la estancia luego)';
    ui.info.textContent = t;
  };

  const onFrame = (time, frame) => {
    session.requestAnimationFrame(onFrame);
    const pose = frame.getViewerPose(ref);
    const hits = frame.getHitTestResults(hitSource);
    reticle = null;
    if (hits.length) {
      const p = hits[0].getPose(ref);
      if (p) reticle = { x: p.transform.position.x, y: p.transform.position.y, z: p.transform.position.z };
    }
    if (pose) {
      const m = pose.transform.matrix;
      let fx = -m[8], fz = -m[10];
      if (Math.hypot(fx, fz) < 0.35) { fx = m[4]; fz = m[6]; } // apuntando al suelo: borde superior
      fwdHeading = xrHeading(fx, fz);
    }
    const layer = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!pose) return;
    gl.useProgram(pr);
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.uniformMatrix4fv(loc.P, false, view.projectionMatrix);
      gl.uniformMatrix4fv(loc.V, false, view.transform.inverse.matrix);
      draw(pts, gl.LINE_STRIP, [0.1, 0.7, 1, 1]);
      draw(pts, gl.POINTS, [1, 0.8, 0.1, 1]);
      if (reticle) {
        const s = 0.08, r = reticle;
        draw([{ x: r.x - s, y: r.y, z: r.z }, { x: r.x + s, y: r.y, z: r.z }, { x: r.x, y: r.y, z: r.z - s }, { x: r.x, y: r.y, z: r.z + s }], gl.LINES, [1, 1, 1, 1]);
        if (pts.length) draw([pts[pts.length - 1], r], gl.LINES, [1, 0.8, 0.1, 1]);
      }
    }
    updateInfo();
  };
  session.requestAnimationFrame(onFrame);

  const mark = () => {
    if (!reticle) return;
    pts.push({ ...reticle });
    if (sensors.heading != null && fwdHeading != null) offsets.push(sensors.heading - fwdHeading);
    navigator.vibrate?.(30);
  };
  const undo = () => { pts.pop(); offsets.pop(); };
  const done = () => {
    let off = circularMean(offsets);
    const compass = off != null;
    if (!compass) off = 0;
    const plan = pts.map((p) => xrToPlan(p.x, p.z, off));
    // Si la última esquina coincide con la primera, quitarla.
    if (plan.length > 3 && Math.hypot(plan[0].x - plan.at(-1).x, plan[0].y - plan.at(-1).y) < 0.25) plan.pop();
    const o = plan[0] || { x: 0, y: 0 };
    result = { points: plan.map((p) => ({ x: p.x - o.x, y: p.y - o.y })), offset: off, compass,
      offsetSpread: offsets.length > 1 ? Math.max(...offsets.map((d) => Math.abs(angleDiff(d, off)))) : 0 };
    session.end();
  };
  const handlers = [[ui.btnMark, mark], [ui.btnUndo, undo], [ui.btnDone, done], [ui.btnCancel, () => session.end()]];
  const block = (e) => e.preventDefault(); // evitar que el toque en botones dispare "select"
  handlers.forEach(([el, fn]) => { el.onclick = fn; el.addEventListener('beforexrselect', block); });

  return new Promise((resolve) => {
    session.addEventListener('end', () => {
      ui.overlay.hidden = true;
      hitSource.cancel?.();
      handlers.forEach(([el]) => { el.onclick = null; el.removeEventListener('beforexrselect', block); });
      resolve(result);
    });
  });
}
