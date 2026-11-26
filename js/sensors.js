// Brújula (orientación absoluta), podómetro y geolocalización.
import { cameraHeading, norm360 } from './geometry.js';

const listeners = new Set();
export const sensors = {
  heading: null,       // rumbo de la cámara trasera (°, ya corregido)
  headingSource: '',
  tilt: null,          // beta
  steps: 0,
  correction: 0,       // corrección manual / declinación (°)
  orientationOn: false,
  motionOn: false,
};
const emit = () => listeners.forEach((fn) => fn(sensors));
export const onSensors = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** Debe llamarse desde un gesto del usuario (iOS pide permiso explícito). */
export async function enableSensors() {
  // iOS: ambas peticiones deben lanzarse en el mismo gesto, sin await intermedio.
  const reqs = [window.DeviceOrientationEvent, window.DeviceMotionEvent]
    .filter((Ev) => Ev && typeof Ev.requestPermission === 'function')
    .map((Ev) => Ev.requestPermission().catch(() => 'denied'));
  const results = await Promise.all(reqs);
  if (results[0] === 'denied') {
    throw new Error('Permiso de brújula denegado. En iPhone: cierra Safari del todo y vuelve a abrir la página para que lo pida otra vez.');
  }
  startOrientation();
  startMotion();
  return sensors;
}

function handleOrientation(ev, absolute) {
  let h = null;
  if (typeof ev.webkitCompassHeading === 'number' && !Number.isNaN(ev.webkitCompassHeading)) {
    h = ev.webkitCompassHeading; // iOS: ya es rumbo magnético
    sensors.headingSource = 'iOS (webkitCompassHeading)';
  } else if ((absolute || ev.absolute) && ev.alpha != null) {
    h = cameraHeading(ev.alpha, ev.beta ?? 90, ev.gamma ?? 0);
    sensors.headingSource = 'Orientación absoluta';
  } else {
    return;
  }
  sensors.heading = norm360(h + sensors.correction);
  sensors.tilt = ev.beta;
  emit();
}

function startOrientation() {
  if (sensors.orientationOn) return;
  sensors.orientationOn = true;
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', (e) => handleOrientation(e, true));
  } else {
    window.addEventListener('deviceorientation', (e) => handleOrientation(e, false));
  }
}

// --- Podómetro sencillo: picos en la magnitud de la aceleración ---
let fast = 9.81, slow = 9.81, above = false, lastStep = 0;
function startMotion() {
  if (sensors.motionOn) return;
  sensors.motionOn = true;
  window.addEventListener('devicemotion', (ev) => {
    const a = ev.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const m = Math.hypot(a.x, a.y, a.z);
    fast += 0.35 * (m - fast);
    slow += 0.02 * (m - slow);
    const now = performance.now();
    if (!above && fast - slow > 1.1 && now - lastStep > 320) {
      above = true;
      lastStep = now;
      sensors.steps++;
      emit();
    } else if (above && fast - slow < 0.3) {
      above = false;
    }
  });
}

/** Simula lecturas (útil en escritorio / pruebas). */
export function setManualHeading(h) {
  sensors.heading = norm360(h);
  sensors.headingSource = 'Manual';
  emit();
}
export function addSimulatedStep() { sensors.steps++; emit(); }

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocalización no disponible en este navegador.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude, lon: p.coords.longitude,
        accuracy: p.coords.accuracy, altitude: p.coords.altitude,
        time: new Date(p.timestamp).toISOString(),
      }),
      (e) => reject(new Error(e.message || 'No se pudo obtener la ubicación.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

export async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=es`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Servicio de direcciones no disponible.');
  const j = await r.json();
  return j.display_name || '';
}
