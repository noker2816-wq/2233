// 브라우저와 Node(20+)에서 같이 쓰는 암호화 모듈.
// PBKDF2-SHA256으로 비밀번호에서 키를 만들고 AES-256-GCM으로 암호화한다.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const DEFAULT_ITERATIONS = 310000;

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(data, password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { v: 1, alg: 'PBKDF2-SHA256/AES-256-GCM', iter: iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

// 비밀번호가 틀리면 AES-GCM 인증 실패로 예외가 난다.
export async function decryptJSON(envelope, password) {
  if (!envelope || envelope.v !== 1) throw new Error('지원하지 않는 데이터 형식');
  const key = await deriveKey(password, fromB64(envelope.salt), envelope.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.ct));
  return JSON.parse(dec.decode(pt));
}
