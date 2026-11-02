import { Capacitor } from '@capacitor/core';

// Câmera nativa (apk 1.6+). Por que não só o <input type=file capture>?
// Abrindo a câmera, o Android às vezes ENCERRA o app em segundo plano pra
// liberar memória. Ao voltar, o app reabria do zero na tela inicial e a
// foto se perdia. Com o plugin de câmera, o Android entrega a foto de
// volta no evento "appRestoredResult" — e aqui guardamos ANTES de abrir a
// câmera onde o usuário estava, pra levar ele de volta com a foto pronta.

const KEY = 'toolpy-pending-photo';

export function hasNativeCamera() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera');
  } catch {
    return false;
  }
}

export function base64ToFile(b64, format = 'jpeg') {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const ext = format || 'jpeg';
  return new File([arr], `foto.${ext}`, { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
}

export function readPending() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Date.now() - v.ts < 15 * 60 * 1000) return v;
  } catch { /* nada guardado */ }
  return null;
}
export function clearPending() {
  try { localStorage.removeItem(KEY); } catch { /* ok */ }
}

export function isCancel(err) {
  return /cancel/i.test(String(err?.message || err || ''));
}

/** Abre a câmera do celular. ctx = onde continuar se o app for encerrado. */
export async function takeNativePhoto(ctx) {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try { localStorage.setItem(KEY, JSON.stringify({ ctx: ctx || null, ts: Date.now() })); } catch { /* ok */ }
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      quality: 85,
      width: 2400, // foto menor = menos memória, sem perder leitura
      correctOrientation: true,
      saveToGallery: false,
    });
    return base64ToFile(photo.base64String, photo.format);
  } finally {
    clearPending();
  }
}
