// Cámara trasera, grabación de vídeo y capturas.
let stream = null;
let recorder = null;
let chunks = [];

export async function openCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara (¿HTTPS?).');
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  }
  videoEl.srcObject = stream;
  videoEl.muted = true;
  videoEl.playsInline = true;
  await videoEl.play().catch(() => {});
  return stream;
}

export function stopCamera() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
export const cameraOpen = () => !!stream;

function pickMime() {
  const opts = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

export function startRecording() {
  if (!stream || !window.MediaRecorder) return false;
  chunks = [];
  const mimeType = pickMime();
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(1000);
  return true;
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === 'inactive') return resolve(null);
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      resolve(new Blob(chunks, { type }));
      recorder = null;
    };
    recorder.stop();
  });
}

export function snapshot(videoEl, maxW = 640, quality = 0.7) {
  if (!videoEl.videoWidth) return null;
  const s = Math.min(1, maxW / videoEl.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(videoEl.videoWidth * s);
  c.height = Math.round(videoEl.videoHeight * s);
  c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
