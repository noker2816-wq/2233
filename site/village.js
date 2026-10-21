// 서무마을 (대구 중구): 중구청과 광장 대형 전광판, 업무유형별 상점, 12개 동 행정복지센터,
// 신천·주요 도로·달성공원·서문시장·경상감영공원·동성로, 걸어다니는 동물 주민.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { decryptJSON } from './crypto.js';
import { store, fetchEnvelope, PW_KEY, makeDemo } from './shared.js';
import { summarize, eventsOf, ddayLabel, dateLabel, level, kstToday, kstDay, kstTime, longDate, shortDate } from './logic.js';
import { Signboard, MAIN_W, MAIN_H } from './signboard.js';
import { makeVillager, toon, toonGradientMap, SPECIES_NAMES, bakeGroup } from './villagers.js';
import { Traffic, Monorail } from './traffic.js';

const REFRESH_MS = 3 * 60 * 1000;
const STALE_MIN = 40;
const params = new URLSearchParams(location.search);
const isDemo = params.has('demo');
const LITE = params.has('lite');
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ====================== 지도 좌표 ======================
   기준점: 중구청(대략 35.8693, 128.6061). 1km ≈ 100 단위, 동쪽 +x, 북쪽 -z.
   행정복지센터 위치는 각 동의 대략적인 위치이며, 건물이 도로와 겹치지 않게 조금씩 옮겼다. */
const ORIGIN = { lat: 35.8693, lng: 128.6061 };
const geo = (lat, lng) => ({ x: (lng - ORIGIN.lng) * 9025, z: -(lat - ORIGIN.lat) * 11095 });

// 행정복지센터: 도로명 주소를 OpenStreetMap에서 좌표로 바꾸고 네이버지도 화면과 대조한 위치.
// 아래에서 도로·광장과 겹치지 않는 가장 가까운 길가 자리로 조금씩 옮기고, 가까운 길을 바라보게 세운다.
const DONGS = [
  { name: '동인동', addr: '국채보상로142길 19-5', lat: 35.867899, lng: 128.609136 },
  { name: '삼덕동', addr: '달구벌대로447길 72-11', lat: 35.865494, lng: 128.608976 },
  { name: '성내1동', addr: '동성로2길 7', lat: 35.866585, lng: 128.595922 },
  { name: '성내2동', addr: '달구벌대로415길 48', lat: 35.868384, lng: 128.590385 },
  { name: '성내3동', addr: '달성로 111', lat: 35.87258, lng: 128.58572 },
  { name: '대신동', addr: '달구벌대로389길 50', lat: 35.86553, lng: 128.576331 },
  { name: '남산1동', addr: '2·28길 18-15', lat: 35.859306, lng: 128.590442 },
  { name: '남산2동', addr: '명륜로 27-1', lat: 35.864041, lng: 128.589556 },
  { name: '남산3동', addr: '남산로4길 70', lat: 35.859896, lng: 128.585554 },
  { name: '남산4동', addr: '남산로1길 42', lat: 35.858168, lng: 128.580569 },
  { name: '대봉1동', addr: '달구벌대로440길 27', lat: 35.861561, lng: 128.604472 },
  { name: '대봉2동', addr: '대봉로47길 31', lat: 35.858900, lng: 128.599900, approx: true },
].map((d) => ({ ...d, ...geo(d.lat, d.lng) }));

const ROADS = [
  { name: '공평로', x: 22, z0: -95, z1: 180, w: 10 },
  { name: '중앙대로', x: -104, z0: -95, z1: 180, w: 12 },
  { name: '달구벌대로', z: 59, x0: -295, x1: 95, w: 12 },
  { name: '국채보상로', z: -50, x0: -295, x1: 95, w: 11 },
];
const RIVER = { x: 78, w: 16, z0: -110, z1: 190 };
// 중구청은 남향, 그 앞 광장 한가운데 전광판(역시 남향), 광장 좌우로 업무유형 상점
const PLAZA = { x0: -52, x1: 4, z0: -12, z1: 26 };
const BOARD_X = -24;
const BOARD_Z = 8;
const HALL = { x: -24, z: -30 };

/* ====================== 렌더러·카메라 ====================== */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: !LITE });
} catch {
  location.replace(`board.html${location.search}`);
  throw new Error('WebGL 미지원');
}
renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ff);
scene.fog = new THREE.Fog(0x9fd8ff, 260, 760);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 1500);
const VIEWS = {
  overview: { pos: V(-60, 200, 290), target: V(-80, 0, 30) },
  plaza: { pos: V(-24, 22, 60), target: V(-24, 6, 4) },
  board: { pos: V(BOARD_X, 11, BOARD_Z + 31), target: V(BOARD_X, 11, BOARD_Z) },
  hall: { pos: V(14, 24, -2), target: V(HALL.x, 10, HALL.z) },
};
camera.position.copy(VIEWS.overview.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(VIEWS.overview.target);
controls.enableDamping = true;
controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
controls.minDistance = 8;
controls.maxDistance = 600;
controls.autoRotateSpeed = 0.35;

/* ====================== 빛 ====================== */
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x6b8f4e, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
sun.position.set(30, 120, 80);
sun.target.position.set(-30, 0, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 400 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

/* ====================== 공통 도우미 ====================== */
const pickables = [];
function add(obj, parent = scene) { parent.add(obj); return obj; }
function mesh(geo, mat, x, y, z, { cast = true, receive = false, parent = scene } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}
function flat(w, d, color, x, z, y = 0.02) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toon(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
function textCanvas(text, { w = 1024, h = 256, bg = null, color = '#fff', font = 900, size = 0.5, radius = 40, stroke = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, radius);
    g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 10; g.stroke(); }
  }
  g.font = `${font} ${Math.round(h * size)}px "Noto Sans KR", sans-serif`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = Math.round(h * size);
  while (g.measureText(text).width > w - 60 && fs > 10) { fs -= 4; g.font = `${font} ${fs}px "Noto Sans KR", sans-serif`; }
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const labels = [];
// 이름표: 멀리서도 같은 크기로 보이게(sizeAttenuation 끔). width는 화면 높이 대비 비율 기준
function labelSprite(text, x, y, z, width, opts) {
  const tex = textCanvas(text, opts);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, sizeAttenuation: false }));
  const h = 0.034 * (width / 14);
  s.scale.set(h * (tex.image.width / tex.image.height), h, 1);
  s.renderOrder = 5;
  labels.push(s);
  s.position.set(x, y, z);
  scene.add(s);
  return s;
}
function plate(text, w, h, opts) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textCanvas(text, opts), transparent: true }));
}

// 창문 격자 텍스처 (밤에는 같은 텍스처로 불 켜짐)
function windowTexture(cols, rows, wall = '#efe6d6', glass = '#9fc9e8') {
  const c = document.createElement('canvas');
  c.width = cols * 64;
  c.height = rows * 64;
  const g = c.getContext('2d');
  g.fillStyle = wall;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    g.fillStyle = glass;
    g.fillRect(i * 64 + 12, j * 64 + 14, 40, 36);
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillRect(i * 64 + 14, j * 64 + 16, 12, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function emissiveMask(cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols * 64;
  c.height = rows * 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (Math.random() < 0.72) { g.fillStyle = '#ffd27a'; g.fillRect(i * 64 + 12, j * 64 + 14, 40, 36); }
  }
  return new THREE.CanvasTexture(c);
}
const litMaterials = []; // 밤에 켜지는 재질 모음
function facadeMat(cols, rows, wall, glass) {
  const m = new THREE.MeshToonMaterial({ map: windowTexture(cols, rows, wall, glass), emissive: 0xffffff, emissiveMap: emissiveMask(cols, rows), emissiveIntensity: 0, gradientMap: toonGradientMap() });
  litMaterials.push(m);
  return m;
}
function facadeBox(w, h, d, cols, rows, wall, glass, sideCols) {
  const f = facadeMat(cols, rows, wall, glass);
  const s = facadeMat(sideCols || Math.max(2, Math.round((cols * d) / w)), rows, wall, glass);
  const top = toon(new THREE.Color(wall).multiplyScalar(0.88).getHex());
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [s, s, top, top, f, f]);
}

/* ====================== 땅·도로·강 ====================== */
flat(470, 350, 0xaee39a, -100, 45, 0); // 파스텔 잔디
ROADS.forEach((r) => {
  if (r.x != null) {
    flat(r.w, r.z1 - r.z0, 0x7f8699, r.x, (r.z0 + r.z1) / 2, 0.04);
    for (let z = r.z0 + 4; z < r.z1; z += 9) flat(0.4, 4, 0xf5f0dc, r.x, z, 0.06);
    flat(1.6, r.z1 - r.z0, 0xf6dcc0, r.x - r.w / 2 - 0.8, (r.z0 + r.z1) / 2, 0.05);
    flat(1.6, r.z1 - r.z0, 0xf6dcc0, r.x + r.w / 2 + 0.8, (r.z0 + r.z1) / 2, 0.05);
  } else {
    flat(r.x1 - r.x0, r.w, 0x7f8699, (r.x0 + r.x1) / 2, r.z, 0.045);
    for (let x = r.x0 + 4; x < r.x1; x += 9) flat(4, 0.4, 0xf5f0dc, x, r.z, 0.065);
    flat(r.x1 - r.x0, 1.6, 0xf6dcc0, (r.x0 + r.x1) / 2, r.z - r.w / 2 - 0.8, 0.055);
    flat(r.x1 - r.x0, 1.6, 0xf6dcc0, (r.x0 + r.x1) / 2, r.z + r.w / 2 + 0.8, 0.055);
  }
});
// 도로 이름 (바닥에 쓴 글씨)
function roadName(text, x, z, rotY = 0) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(24, 4.4), new THREE.MeshBasicMaterial({ map: textCanvas(text, { color: '#ffffff', size: 0.62 }), transparent: true, depthWrite: false }));
  p.rotation.set(-Math.PI / 2, 0, rotY);
  p.position.set(x, 0.08, z);
  scene.add(p);
}
roadName('공평로', 22, 95, Math.PI / 2);
roadName('중앙대로', -104, 20, Math.PI / 2);
roadName('중앙대로', -104, 130, Math.PI / 2);
roadName('달구벌대로', -40, 59);
roadName('달구벌대로', -190, 59);
roadName('국채보상로', -60, -50);
roadName('국채보상로', -190, -50);

// 신천
flat(RIVER.w + 14, RIVER.z1 - RIVER.z0, 0x7fbf6a, RIVER.x, (RIVER.z0 + RIVER.z1) / 2, 0.03);
const water = flat(RIVER.w, RIVER.z1 - RIVER.z0, 0x6cb8e0, RIVER.x, (RIVER.z0 + RIVER.z1) / 2, 0.05);
[59, -50].forEach((z) => {
  mesh(new THREE.BoxGeometry(RIVER.w + 16, 0.6, 12), toon(0xb9b2a4), RIVER.x, 0.4, z, { receive: true });
  [-1, 1].forEach((s) => mesh(new THREE.BoxGeometry(RIVER.w + 16, 1, 0.4), toon(0xe8e2d6), RIVER.x, 1.1, z + s * 5.8));
});
labelSprite('신천', RIVER.x, 6, 10, 18, { color: '#1d5f8a', bg: 'rgba(255,255,255,.85)', size: 0.55 });

/* ====================== 광장 + 대형 전광판 ====================== */
{
  const cx = (PLAZA.x0 + PLAZA.x1) / 2;
  const w = PLAZA.x1 - PLAZA.x0 + 26;
  const z0 = HALL.z + 12;
  const d = PLAZA.z1 + 4 - z0;
  flat(w + 4, d + 4, 0xd8c08f, cx, z0 + d / 2, 0.03);
  flat(w, d, 0xeedcb3, cx, z0 + d / 2, 0.035);
  for (let x = cx - w / 2 + 5; x < cx + w / 2; x += 5) flat(0.15, d, 0xe0caa0, x, z0 + d / 2, 0.038);
}

const sign = new Signboard();
const SCREEN_W = 28;
const MAIN_PH = SCREEN_W * (MAIN_H / MAIN_W);
const TICK_PH = SCREEN_W * (96 / 2048);
const SCREEN_BOTTOM = 4.2;
const boardGroup = add(new THREE.Group());
boardGroup.position.set(BOARD_X, 0, BOARD_Z);
const frameH = MAIN_PH + TICK_PH + 1.4;
const frameY = SCREEN_BOTTOM - 0.6 + frameH / 2;
const PILLAR_DX = SCREEN_W / 2 + 1.4;
[-1, 1].forEach((s) => {
  mesh(new THREE.CylinderGeometry(0.55, 0.7, frameY + frameH / 2 + 0.6, 16), toon(0x7fd8c4), s * PILLAR_DX, (frameY + frameH / 2 + 0.6) / 2, 0, { parent: boardGroup });
  mesh(new THREE.CylinderGeometry(1.6, 1.4, 0.9, 18), toon(0xc98b5a), s * PILLAR_DX, 0.45, 0, { parent: boardGroup });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    mesh(new THREE.SphereGeometry(0.3, 10, 8), toon([0xff7a8a, 0xffd34d, 0xffffff, 0xb48cf2][i % 4]), s * PILLAR_DX + Math.cos(a) * 1.05, 1.05, Math.sin(a) * 1.05, { parent: boardGroup });
  }
});
const boardFrame = mesh(new THREE.BoxGeometry(SCREEN_W + 1.6, frameH, 0.9), toon(0x2b3478), 0, frameY, 0, { parent: boardGroup });
// 전광판 위 고양이 귀
[-1, 1].forEach((s) => {
  const ear = mesh(new THREE.ConeGeometry(2.2, 3.4, 4), toon(0x2b3478), s * (SCREEN_W / 2 - 2.4), frameY + frameH / 2 + 1.6, 0, { parent: boardGroup });
  ear.rotation.y = Math.PI / 4; ear.scale.z = 0.35;
  const inner = mesh(new THREE.ConeGeometry(1.2, 2, 4), toon(0xff8fab), s * (SCREEN_W / 2 - 2.4), frameY + frameH / 2 + 1.3, 0.5, { parent: boardGroup });
  inner.rotation.y = Math.PI / 4; inner.scale.z = 0.2;
});
mesh(new THREE.BoxGeometry(SCREEN_W + 2.6, 0.5, 1.6), toon(0xff8fab), 0, frameY + frameH / 2 + 0.25, 0, { parent: boardGroup });
const boardTitle = plate('★ 서무 전광판 ★', 8, 1.2, { bg: '#ff8fab', color: '#ffffff', size: 0.56, radius: 40 });
boardTitle.position.set(0, frameY + frameH / 2 + 1.25, 0.2);
boardGroup.add(boardTitle);

const screens = [];
function screenSide(z, rotY) {
  const g = new THREE.Group();
  g.position.z = z;
  g.rotation.y = rotY;
  const basic = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const main = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, MAIN_PH), basic(sign.main.tex));
  main.position.y = SCREEN_BOTTOM + TICK_PH + MAIN_PH / 2;
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, TICK_PH), basic(sign.tick.tex));
  tick.position.y = SCREEN_BOTTOM + TICK_PH / 2;
  const cw = SCREEN_W * (1024 / MAIN_W);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(cw, cw * (220 / 1024)), basic(sign.clock.tex));
  clock.position.set(SCREEN_W / 2 - cw / 2, SCREEN_BOTTOM + TICK_PH + MAIN_PH - (cw * (220 / 1024)) / 2, 0.02);
  g.add(main, tick, clock);
  boardGroup.add(g);
  screens.push(main, tick, clock);
}
screenSide(0.46, 0);
screenSide(-0.46, Math.PI);
const screenGlow = new THREE.PointLight(0xffb36b, 0, 40, 2);
screenGlow.position.set(0, 10, 6);
boardGroup.add(screenGlow);
[boardFrame, ...screens].forEach((m) => { m.userData.pick = { kind: 'board' }; pickables.push(m); });

/* ====================== 업무유형별 상점 (광장 양옆) ====================== */
const SHOP_W_X = PLAZA.x0 - 9; // 서쪽 줄 (동쪽을 봄)
const SHOP_E_X = PLAZA.x1 + 7; // 동쪽 줄 (서쪽을 봄)
const SHOPS = [
  { type: '수합·제출', name: '수합 우체국', wall: 0xfbe3c0, roof: 0x4c9bd6, z: -7, side: 'e' },
  { type: '지출·회계', name: '회계 은행', wall: 0xe6f0d6, roof: 0x5fb86b, z: 3, side: 'e' },
  { type: '급여·인사', name: '인사 관청', wall: 0xece3f6, roof: 0x9b6fd1, z: 13, side: 'e' },
  { type: '정보공개', name: '정보공개 도서관', wall: 0xf8e1dc, roof: 0xe5534b, z: 23, side: 'e' },
  { type: '감사·점검', name: '감사 사무소', wall: 0xfbe9cf, roof: 0xf29b38, z: -2, side: 'w' },
  { type: '행사·차출', name: '행사 공연장', wall: 0xfde3ee, roof: 0xf06fa4, z: 10, side: 'w' },
  { type: '공람·참고', name: '공람 게시판', wall: 0xeeeeea, roof: 0x8a8f99, z: 22, side: 'w' },
].map((b) => ({ ...b, x: b.side === 'w' ? SHOP_W_X : SHOP_E_X }));
function badgeTexture(n, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `900 ${n > 9 ? 56 : 68}px "Orbitron", "Noto Sans KR", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const shopDoors = [];
const shopObjs = SHOPS.map((b) => {
  const g = add(new THREE.Group());
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.side === 'w' ? Math.PI / 2 : -Math.PI / 2;
  const w = 8.8;
  const h = 5;
  const d = 8;
  mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), toon(0xb9a484), 0, 0.2, 0, { parent: g, receive: true });
  mesh(new THREE.BoxGeometry(w, h, d), toon(b.wall), 0, h / 2, 0, { parent: g, receive: true });
  const roofGeo = new THREE.ConeGeometry(Math.SQRT2, 3, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roof = mesh(roofGeo, toon(b.roof), 0, h + 1.5, 0, { parent: g });
  roof.scale.set(w / 2 + 0.6, 1, d / 2 + 0.6);
  mesh(new THREE.BoxGeometry(1.5, 2.5, 0.15), toon(0x7a4a2a), 0, 1.45, d / 2 + 0.05, { parent: g });
  [-1, 1].forEach((s) => {
    mesh(new THREE.BoxGeometry(1.8, 1.4, 0.12), facadeMat(1, 1, '#9fc9e8', '#9fc9e8'), s * 3, 2.6, d / 2 + 0.05, { parent: g });
  });
  // 차양
  const awn = mesh(new THREE.BoxGeometry(w - 1, 0.18, 1.6), toon(b.roof), 0, 3.4, d / 2 + 0.75, { parent: g });
  awn.rotation.x = 0.25;
  const lab = plate(b.name, 5.4, 1.2, { bg: '#8b5a2b', color: '#fff3d6', stroke: '#6b4220', size: 0.5 });
  lab.position.set(0, h - 0.6, d / 2 + 0.1);
  g.add(lab);
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(0, '#aaa'), depthWrite: false }));
  badge.scale.set(2.4, 2.4, 1);
  badge.position.set(0, h + 4.4, 0);
  g.add(badge);
  g.traverse((o) => { if (o.isMesh) { o.userData.pick = { kind: 'shop', shop: b }; pickables.push(o); } });
  const doorX = b.side === 'w' ? b.x + d / 2 + 1.6 : b.x - d / 2 - 1.6;
  shopDoors.push({ pos: V(doorX, 0, b.z), id: `shop:${b.type}` });
  return { def: b, badge, lastBadge: '' };
});

/* ====================== 중구청 ====================== */
const hall = add(new THREE.Group());
hall.position.set(HALL.x, 0, HALL.z);
hall.rotation.y = 0; // 남향: 정면이 광장과 전광판을 본다
{
  const wall = '#efe6d6';
  mesh(new THREE.BoxGeometry(40, 0.8, 22), toon(0xc9bda6), 0, 0.4, 0, { parent: hall, receive: true });
  const main = facadeBox(36, 14, 16, 18, 5, wall, '#8fb8d8', 8);
  main.position.set(0, 7.8, 0);
  main.castShadow = main.receiveShadow = true;
  hall.add(main);
  const tower = facadeBox(11, 24, 12, 5, 9, '#f6f0e4', '#7fa8cc', 5);
  tower.position.set(0, 12.8, 1.5);
  tower.castShadow = true;
  hall.add(tower);
  mesh(new THREE.BoxGeometry(12, 0.8, 13), toon(0x2c5aa0), 0, 25.2, 1.5, { parent: hall });
  mesh(new THREE.BoxGeometry(37, 0.6, 17), toon(0xd8ccb6), 0, 15.1, 0, { parent: hall });
  // 현관 캐노피와 기둥
  mesh(new THREE.BoxGeometry(14, 0.7, 6), toon(0xdcd2c0), 0, 5.4, 10.5, { parent: hall });
  [-6, -2, 2, 6].forEach((x) => mesh(new THREE.CylinderGeometry(0.4, 0.4, 5, 12), toon(0xffffff), x, 2.9, 12.8, { parent: hall }));
  mesh(new THREE.BoxGeometry(5, 4, 0.3), toon(0x3a5f86), 0, 2.8, 8.1, { parent: hall });
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(16 - i, 0.3, 1.2), toon(0xd8ccb6), 0, 0.95 + i * 0.3, 14.4 - i * 1.1, { parent: hall, receive: true });
  const nameplate = plate('대구광역시 중구청', 10, 1.9, { bg: '#2c5aa0', color: '#ffffff', size: 0.5, radius: 24 });
  nameplate.position.set(0, 21.5, 7.56);
  hall.add(nameplate);
  // 국기 게양대 3개
  [[-8, 0xffffff], [-5, 0x2c5aa0], [-2, 0x5fb86b]].forEach(([x, col]) => {
    mesh(new THREE.CylinderGeometry(0.12, 0.15, 11, 8), toon(0xcfd3d8), x - 6, 5.5, 18, { parent: hall });
    const flag = mesh(new THREE.BoxGeometry(2.4, 1.5, 0.05), toon(col), x - 4.8, 10, 18, { parent: hall });
    flag.userData.flag = true;
  });
  hall.traverse((o) => { if (o.isMesh) { o.userData.pick = { kind: 'hall' }; pickables.push(o); } });
}
labelSprite('대구 중구청', HALL.x, 33, HALL.z, 22, { bg: '#2c5aa0', color: '#fff', size: 0.5 });
const hallDoor = { pos: V(HALL.x, 0, HALL.z + 16), id: 'hall' };

/* ====================== 행정복지센터 12곳 ====================== */
// 길가 자리 찾기: 도로(인도 포함) 가장자리에서 11 이상 떨어지고, 광장·동성로·시장·공원·다른 센터와 겹치지 않는 곳
function roadEdge(x, z) {
  let c = Infinity;
  let road = null;
  ROADS.forEach((r) => {
    const inSpan = r.x != null ? z > r.z0 - 6 && z < r.z1 + 6 : x > r.x0 - 6 && x < r.x1 + 6;
    if (!inSpan) return;
    const e = (r.x != null ? Math.abs(x - r.x) : Math.abs(z - r.z)) - r.w / 2 - 2.4;
    if (e < c) { c = e; road = r; }
  });
  return { c, road };
}
const NO_GO = [
  { x0: SHOP_W_X - 18, x1: SHOP_E_X + 18, z0: HALL.z - 24, z1: PLAZA.z1 + 16 },
  { x0: -96, x1: -68, z0: -18, z1: 52 }, // 동성로
  { x0: -246, x1: -198, z0: -32, z1: 8 }, // 서문시장
];
const NO_GO_CIRCLE = [{ x: -215, z: -64, r: 30 }, { x: -120, z: -30, r: 20 }];
const placed = [];
function siteOK(x, z) {
  if (roadEdge(x, z).c < 11) return false;
  if (Math.abs(x - RIVER.x) < RIVER.w / 2 + 20) return false;
  if (x < -285 || x > 90 || z < -100 || z > 175) return false;
  if (NO_GO.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) return false;
  if (NO_GO_CIRCLE.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return false;
  return placed.every((p) => Math.hypot(x - p.x, z - p.z) > 28);
}
DONGS.forEach((d) => {
  let best = null;
  for (let r = 0; r <= 70 && !best; r += 3) {
    for (let k = 0; k < (r ? 24 : 1) && !best; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = d.x + Math.cos(a) * r;
      const z = d.z + Math.sin(a) * r;
      if (siteOK(x, z)) best = { x, z };
    }
  }
  if (best) { d.x = best.x; d.z = best.z; }
  placed.push({ x: d.x, z: d.z });
  // 가장 가까운 길(40 이내)을 바라본다. 없으면 남향
  const { c, road } = roadEdge(d.x, d.z);
  if (road && c < 40) d.face = road.x != null ? (road.x > d.x ? Math.PI / 2 : -Math.PI / 2) : (road.z > d.z ? 0 : Math.PI);
  else d.face = 0;
});

const dongObjs = DONGS.map((d, i) => {
  const g = add(new THREE.Group());
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.face;
  const w = 13;
  const h = 9;
  const dep = 9;
  mesh(new THREE.BoxGeometry(w + 6, 0.4, dep + 10), toon(0xd8cdb2), 0, 0.2, 2, { parent: g, receive: true });
  const PASTEL = ['#fde2e4', '#e2f0cb', '#dbe7fb', '#fff1c1', '#e9dcfb', '#ffe5cc'];
  const body = facadeBox(w, h, dep, 7, 3, PASTEL[i % 6], '#8fb8d8', 5);
  body.position.y = h / 2 + 0.4;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  mesh(new THREE.BoxGeometry(w + 0.6, 0.6, dep + 0.6), toon([0xff8fab, 0x7fd8c4, 0x74a9ff, 0xffc94d, 0xb48cf2, 0xff9f6b][i % 6]), 0, h + 0.7, 0, { parent: g });
  // 정문 양옆 화분과 앞마당 생울타리
  [-1, 1].forEach((sd) => {
    mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.8, 12), toon(0xf6b78c), sd * 3.4, 0.4, dep / 2 + 1.4, { parent: g });
    [0, 1, 2].forEach((k) => mesh(new THREE.SphereGeometry(0.32, 8, 6), toon([0xff7a8a, 0xffd34d, 0xffffff][k]), sd * 3.4 + (k - 1) * 0.35, 0.95, dep / 2 + 1.4 + (k % 2) * 0.2, { parent: g }));
    const hedge = mesh(new THREE.BoxGeometry(1.1, 1.1, 8), toon(0x6cc070), sd * (w / 2 + 2.2), 0.55, dep / 2 + 4.5, { parent: g });
    hedge.scale.y = 1;
  });
  mesh(new THREE.BoxGeometry(5, 0.4, 3), toon(0xffffff), 0, 3.4, dep / 2 + 1.5, { parent: g });
  [-2, 2].forEach((x) => mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), toon(0xffffff), x, 1.9, dep / 2 + 2.8, { parent: g }));
  mesh(new THREE.BoxGeometry(3, 2.8, 0.2), toon(0x3a5f86), 0, 1.8, dep / 2 + 0.05, { parent: g });
  const p = plate(`${d.name} 행정복지센터`, 9, 1.3, { bg: '#1f3f6e', color: '#ffffff', size: 0.46, radius: 20 });
  p.position.set(0, h - 1.2, dep / 2 + 0.06);
  g.add(p);
  mesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 8), toon(0xcfd3d8), w / 2 + 1.5, 3.5, dep / 2 + 3, { parent: g });
  mesh(new THREE.BoxGeometry(1.8, 1.1, 0.05), toon(0xffffff), w / 2 + 2.4, 6.3, dep / 2 + 3, { parent: g });
  g.traverse((o) => { if (o.isMesh) { o.userData.pick = { kind: 'dong', dong: d }; pickables.push(o); } });
  labelSprite(d.name, d.x, h + 6, d.z, 14, { bg: 'rgba(255,248,232,.92)', color: '#3b2f22', size: 0.56, stroke: '#e7d6ae' });
  // 앞마당: 건물 정면(길 쪽) 앞
  const fx = Math.round(Math.sin(d.face));
  const fz = Math.round(Math.cos(d.face));
  const yc = [d.x + fx * (dep / 2 + 6), d.z + fz * (dep / 2 + 6)];
  const yard = fx !== 0 ? { x0: yc[0] - 3, x1: yc[0] + 3, z0: yc[1] - 7, z1: yc[1] + 7 } : { x0: yc[0] - 7, x1: yc[0] + 7, z0: yc[1] - 3, z1: yc[1] + 3 };
  return { def: d, yard };
});

/* ====================== 명소 ====================== */
function park(name, x, z, r, trees) {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(r, 40), toon(0x79c26a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(x, 0.035, z);
  ground.receiveShadow = true;
  scene.add(ground);
  const fence = new THREE.Mesh(new THREE.TorusGeometry(r, 0.15, 6, 60), toon(0x8b5a2b));
  fence.rotation.x = Math.PI / 2;
  fence.position.set(x, 0.8, z);
  scene.add(fence);
  labelSprite(name, x, 12, z, 18, { bg: 'rgba(95,184,107,.95)', color: '#fff', size: 0.5 });
  for (let i = 0; i < trees; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * (r - 2);
    treeSpots.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr, rand(1, 1.5)]);
  }
}
const treeSpots = [];
park('달성공원', -215, -64, 17, 34);
park('경상감영공원', -120, -30, 8, 10);

// 서문시장: 천막 가게 줄
{
  const cx = -222;
  const cz = -16;
  const colors = [0xe5534b, 0x4c9bd6, 0xf2d24b, 0x5fb86b, 0xf06fa4, 0xf29b38];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const x = cx - 15 + c * 6;
    const z = cz - 6 + r * 6;
    mesh(new THREE.BoxGeometry(4.6, 2.2, 3.6), toon(0xf1e4cf), x, 1.1, z);
    const roof = mesh(new THREE.ConeGeometry(3.6, 1.6, 4), toon(colors[(r * 6 + c) % colors.length]), x, 3, z);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(0.9, 1, 0.7);
  }
  labelSprite('서문시장', cx, 10, cz, 16, { bg: 'rgba(229,83,75,.95)', color: '#fff', size: 0.5 });
}

// 동성로: 알록달록 상가 두 줄
const DONGSEONG = { x: -82, z0: -12, z1: 44 };
{
  const colors = [0xf8c3c3, 0xc3e0f8, 0xfbe3a6, 0xcdeccd, 0xe2d4f4, 0xffd8b5];
  for (let z = DONGSEONG.z0; z < DONGSEONG.z1; z += 7) {
    [-1, 1].forEach((s, k) => {
      const hgt = rand(4, 8);
      const b = mesh(new THREE.BoxGeometry(6, hgt, 6), toon(colors[Math.floor(Math.random() * colors.length)]), DONGSEONG.x + s * 7, hgt / 2, z + 3);
      b.receiveShadow = true;
      mesh(new THREE.BoxGeometry(0.2, 1, 4), toon(colors[(k + 2) % colors.length]), DONGSEONG.x + s * 3.9, 3, z + 3);
    });
  }
  flat(7, DONGSEONG.z1 - DONGSEONG.z0 + 4, 0xe8c9a0, DONGSEONG.x, (DONGSEONG.z0 + DONGSEONG.z1) / 2, 0.04);
  labelSprite('동성로', DONGSEONG.x, 13, DONGSEONG.z0 - 2, 14, { bg: 'rgba(240,111,164,.95)', color: '#fff', size: 0.52 });
}
labelSprite('반월당', -104, 7, 59, 12, { bg: 'rgba(44,90,160,.92)', color: '#fff', size: 0.5 });

/* ====================== 나무·꽃·가로등 (인스턴스) ====================== */
const blockedRects = [
  { x0: SHOP_W_X - 8, x1: SHOP_E_X + 8, z0: HALL.z - 14, z1: PLAZA.z1 + 6 },
  { x0: -235, x1: -205, z0: -28, z1: 2 },
  { x0: DONGSEONG.x - 12, x1: DONGSEONG.x + 12, z0: DONGSEONG.z0 - 4, z1: DONGSEONG.z1 + 6 },
  ...DONGS.map((d) => ({ x0: d.x - 14, x1: d.x + 14, z0: d.z - 14, z1: d.z + 14 })),
];
function blocked(x, z) {
  if (x < -265 || x > 105 || z < -120 || z > 210) return true;
  if (Math.abs(x - RIVER.x) < RIVER.w / 2 + 3) return true;
  if (ROADS.some((r) => (r.x != null ? Math.abs(x - r.x) < r.w / 2 + 3 && z > r.z0 && z < r.z1 : Math.abs(z - r.z) < r.w / 2 + 3 && x > r.x0 && x < r.x1))) return true;
  if (Math.hypot(x + 215, z + 64) < 18 || Math.hypot(x + 120, z + 30) < 9) return true;
  return blockedRects.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
}
for (let i = 0; i < 4000 && treeSpots.length < (LITE ? 260 : 520); i++) {
  const x = rand(-262, 102);
  const z = rand(-115, 205);
  if (!blocked(x, z)) treeSpots.push([x, z, rand(0.9, 1.5)]);
}
// 가로수: 큰길 따라
ROADS.forEach((r) => {
  for (let t = 6; t < (r.x != null ? r.z1 - r.z0 : r.x1 - r.x0); t += 14) {
    [-1, 1].forEach((s) => {
      const x = r.x != null ? r.x + s * (r.w / 2 + 3.2) : r.x0 + t;
      const z = r.x != null ? r.z0 + t : r.z + s * (r.w / 2 + 3.2);
      if (!blockedRects.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) && Math.abs(x - RIVER.x) > RIVER.w) treeSpots.push([x, z, 0.85]);
    });
  }
});
{
  const n = treeSpots.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), toon(0x8b5a2b), n);
  const round = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 1), toon(0xffffff), n);
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.4, 7), toon(0xffffff), n);
  // 가을 대구: 초록 + 노란 은행나무 + 단풍 + 분홍 꽃나무
  const greens = [0x6fcf7f, 0x86d98a, 0x5fbf73, 0xffd54f, 0xffc23d, 0xff9f6b, 0xf7b6c8];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  let ri = 0;
  let ci = 0;
  treeSpots.forEach(([x, z, s], i) => {
    m.compose(V(x, 0.8 * s, z), q, sc.set(s, s, s));
    trunk.setMatrixAt(i, m);
    const rnd = Math.random();
    col.setHex(greens[rnd < 0.5 ? Math.floor(Math.random() * 3) : rnd < 0.78 ? 3 + Math.floor(Math.random() * 2) : rnd < 0.92 ? 5 : 6]);
    if (Math.random() < 0.8) { // 동글동글한 나무 위주
      m.compose(V(x, 2.6 * s, z), q, sc.set(s, s * rand(0.9, 1.2), s));
      round.setMatrixAt(ri, m);
      round.setColorAt(ri++, col);
    } else {
      m.compose(V(x, 3 * s, z), q, sc.set(s, s, s));
      cone.setMatrixAt(ci, m);
      cone.setColorAt(ci++, col);
    }
  });
  round.count = ri;
  cone.count = ci;
  [trunk, round, cone].forEach((im) => { im.castShadow = true; scene.add(im); });
}
{
  const flowerColors = [0xff7a8a, 0xffd34d, 0xffffff, 0xb48cf2, 0xff9f43];
  const geo = new THREE.SphereGeometry(0.18, 6, 5);
  flowerColors.forEach((c) => {
    const im = new THREE.InstancedMesh(geo, toon(c), 300);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 3000 && n < 300; i++) {
      const x = rand(-260, 100);
      const z = rand(-110, 200);
      if (blocked(x, z)) continue;
      m.makeTranslation(x, 0.18, z);
      im.setMatrixAt(n++, m);
    }
    im.count = n;
    scene.add(im);
  });
}
// 가로등: 광장 둘레 + 큰길 일부 (밤에 켜짐)
const bulbMat = new THREE.MeshToonMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 0.2, gradientMap: toonGradientMap() });
const lampLights = [];
{
  const spots = [];
  for (let x = PLAZA.x0; x <= PLAZA.x1; x += 8) spots.push([x, PLAZA.z1 + 2]);
  ROADS.forEach((r) => {
    for (let t = 0; t < (r.x != null ? r.z1 - r.z0 : r.x1 - r.x0); t += 28) spots.push(r.x != null ? [r.x + r.w / 2 + 1.2, r.z0 + t] : [r.x0 + t, r.z + r.w / 2 + 1.2]);
  });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 6), toon(0x3d3d45), spots.length);
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8), bulbMat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    pole.setMatrixAt(i, m.makeTranslation(x, 2.2, z));
    bulb.setMatrixAt(i, m.makeTranslation(x, 4.55, z));
  });
  scene.add(pole, bulb);
  [[PLAZA.x0, PLAZA.z1 + 2], [PLAZA.x1, PLAZA.z1 + 2], [PLAZA.x0 + 8, PLAZA.z0 + 2], [PLAZA.x1 - 8, PLAZA.z0 + 2]].forEach(([x, z]) => {
    const l = new THREE.PointLight(0xffc77a, 0, 30, 2);
    l.position.set(x, 4.4, z);
    scene.add(l);
    lampLights.push(l);
  });
}

// 구름
const clouds = [];
for (let i = 0; i < 14; i++) {
  const g = add(new THREE.Group());
  for (let k = 0; k < 5; k++) {
    mesh(new THREE.IcosahedronGeometry(rand(4, 7), 1), toon(0xffffff), k * 5 - 10, rand(-1, 1.5), rand(-2, 2), { cast: false, parent: g });
  }
  g.position.set(rand(-420, 260), rand(60, 110), rand(-420, -200)); // 북쪽 하늘에만 (내려다볼 때 가리지 않게)
  g.userData.speed = rand(1, 2.4);
  clouds.push(g);
}

/* ====================== 교통: 차량·신호등·버스정류장·도시철도 ====================== */
const traffic = new Traffic(scene, ROADS, { density: LITE ? 0.4 : 0.75 });
const busStops = [
  // [도로 index, 방향, 위치(s), 정류장 x, z]
  [2, 1, -160, -160, 59 + 7.9], [2, 1, -50, -50, 59 + 7.9], [2, -1, -140, -140, 59 - 7.9], [2, -1, -30, -30, 59 - 7.9],
  [1, 1, 20, -104 - 7.9, 20], [1, 1, 100, -104 - 7.9, 100], [1, -1, 30, -104 + 7.9, 30], [1, -1, 110, -104 + 7.9, 110],
  [0, 1, 100, 22 - 6.9, 100], [3, -1, -120, -120, -50 - 7.4],
];
const busWaitAreas = [];
busStops.forEach(([ri, dir, sPos, x, z]) => {
  traffic.addBusStop(ri, dir, sPos);
  const g = add(new THREE.Group());
  g.position.set(x, 0, z);
  const ew = ROADS[ri].x == null;
  g.rotation.y = ew ? (z > ROADS[ri].z ? Math.PI : 0) : (x > ROADS[ri].x ? -Math.PI / 2 : Math.PI / 2);
  mesh(new THREE.BoxGeometry(5, 0.2, 1.8), toon(0x2c5aa0), 0, 2.8, 0, { parent: g });
  mesh(new THREE.BoxGeometry(5, 2.6, 0.1), toon(0xbfe6ff), 0, 1.5, -0.85, { parent: g });
  mesh(new THREE.BoxGeometry(3.6, 0.15, 0.6), toon(0x8b5a2b), 0, 0.6, -0.5, { parent: g });
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), toon(0x6b6f76), 2.9, 1.6, 0.5, { parent: g });
  mesh(new THREE.BoxGeometry(0.7, 0.9, 0.08), toon(0x2c5aa0), 2.9, 3, 0.5, { parent: g });
  busWaitAreas.push(ew ? { x0: x - 2.5, x1: x + 2.5, z0: z - 0.6, z1: z + 0.6 } : { x0: x - 0.6, x1: x + 0.6, z0: z - 2.5, z1: z + 2.5 });
});
// 1호선 지하철 출입구
[['1호선 중앙로역', -96, -22], ['1호선 반월당역', -112, 50], ['1호선 명덕역', -96, 134]].forEach(([name, x, z]) => {
  const g = add(new THREE.Group());
  g.position.set(x, 0, z);
  mesh(new THREE.BoxGeometry(3.4, 2.6, 4.4), toon(0x9fc9e8), 0, 1.3, 0, { parent: g });
  mesh(new THREE.BoxGeometry(3.8, 0.3, 4.8), toon(0x6b6f76), 0, 2.75, 0, { parent: g });
  mesh(new THREE.BoxGeometry(1.4, 1.4, 0.15), toon(0xd9383a), 0, 3.8, 2.2, { parent: g });
  labelSprite(name, x, 9, z, 13, { bg: 'rgba(217,56,58,.95)', color: '#fff', size: 0.48 });
});
// 3호선 모노레일: 마을 둘레를 한 바퀴 도는 순환선 (실제 3호선 역 위치 + 북·동쪽은 가상 구간)
const roadHit = (x, z, pad = 2) => ROADS.some((r) => (r.x != null ? Math.abs(x - r.x) < r.w / 2 + pad && z > r.z0 && z < r.z1 : Math.abs(z - r.z) < r.w / 2 + pad && x > r.x0 && x < r.x1));
const monorail = new Monorail(scene, [
  [-214, -70, '달성공원'], [-213, -5, '서문시장'], [-212, 50, '청라언덕'], [-200, 118], [-170, 140, '남산'],
  [-130, 150, '명덕'], [-57, 156, '건들바위'], [5, 160, '대봉교'], [52, 140], [56, 95, '경대병원'], [56, 30, '삼덕'],
  [54, -30, '동인'], [40, -76], [-20, -82, '대구역'], [-90, -84, '중앙로'], [-150, -86, '북성로'], [-200, -86],
], {
  height: 12,
  loop: true,
  trains: 2,
  skip: (x, z) => roadHit(x, z) || DONGS.some((d) => Math.abs(x - d.x) < 9 && Math.abs(z - d.z) < 9) || (x > -240 && x < -204 && z > -25 && z < -6),
  label: (text, x, y, z) => labelSprite(text, x, y, z, 12, { bg: 'rgba(255,176,0,.95)', color: '#3b2f22', size: 0.46 }),
});

/* ====================== 아기자기 장식 ====================== */
const animated = [];
const PASTELS = [0xff8fab, 0xffd34d, 0x7fd8c4, 0x74a9ff, 0xb48cf2, 0xff9f6b, 0xffffff];
// 가랜드(삼각 깃발 줄)
function bunting(a, b, n = 14, sag = 1.4) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 3, 0.05, 4), toon(0xffffff));
  g.add(line);
  for (let i = 1; i < n; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 3), toon(PASTELS[i % PASTELS.length]));
    f.rotation.x = Math.PI;
    f.position.copy(pts[i]).add(V(0, -0.5, 0));
    g.add(f);
  }
  bakeGroup(g, { cast: false });
  scene.add(g);
}
// 광장 위 가랜드
[PLAZA.z1 - 1, PLAZA.z0 + 4].forEach((z) => bunting(V(PLAZA.x0, 6.5, z), V(PLAZA.x1, 6.5, z), 22, 1.6));
bunting(V(BOARD_X - PILLAR_DX, 13, BOARD_Z), V(PLAZA.x0, 6.5, PLAZA.z1 - 1), 12, 1.2);
bunting(V(BOARD_X + PILLAR_DX, 13, BOARD_Z), V(PLAZA.x1, 6.5, PLAZA.z1 - 1), 12, 1.2);
// 동성로 지그재그 가랜드
for (let z = DONGSEONG.z0; z < DONGSEONG.z1; z += 9) bunting(V(DONGSEONG.x - 4, 6, z), V(DONGSEONG.x + 4, 6, z + 4.5), 7, 0.6);

// 광장 벤치 + 파라솔
function bench(x, z, rot, withUmbrella) {
  const g = new THREE.Group();
  const wood = toon(0xc98b5a);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, 0.9), wood); seat.position.y = 0.6; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 0.14), wood); back.position.set(0, 1, -0.4); g.add(back);
  [-1.3, 1.3].forEach((dx) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.8), toon(0x6b5a48)); l.position.set(dx, 0.3, 0); g.add(l); });
  if (withUmbrella) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), toon(0xffffff)); pole.position.set(0, 1.6, 0.9); g.add(pole);
    const cover = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 8), toon(PASTELS[Math.floor(Math.random() * 6)])); cover.position.set(0, 3.3, 0.9); g.add(cover);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  bakeGroup(g);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
}
[[PLAZA.x0 + 5, PLAZA.z1 - 4, 0], [PLAZA.x0 + 14, PLAZA.z1 - 4, 0], [PLAZA.x1 - 5, PLAZA.z1 - 4, 0], [PLAZA.x1 - 14, PLAZA.z1 - 4, 0],
  [PLAZA.x0 + 4, PLAZA.z0 + 7, Math.PI / 2], [PLAZA.x1 - 4, PLAZA.z0 + 7, -Math.PI / 2]].forEach(([x, z, r], i) => bench(x, z, r + Math.PI, i % 2 === 0));

// 전광판 옆 풍선 다발 (둥실둥실)
[-1, 1].forEach((sd) => {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 12), toon(PASTELS[(i + (sd > 0 ? 3 : 0)) % 6]));
    b.scale.y = 1.15;
    g.add(b);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), toon(0xffffff)); str.position.y = -2.6; g.add(str);
    const bx = BOARD_X + sd * (PILLAR_DX + 1.8) + (i % 3 - 1) * 0.9;
    const bz = BOARD_Z + 1.2 + Math.floor(i / 3) * 0.9;
    const by = 5.5 + (i % 3) * 0.7 + Math.floor(i / 3) * 0.5;
    g.position.set(bx, by, bz);
    scene.add(g);
    animated.push((t) => { g.position.y = by + Math.sin(t * 1.3 + i) * 0.25; g.rotation.z = Math.sin(t * 0.9 + i) * 0.08; });
  }
});

// 서무 고양이 동상 (마스코트)
{
  const cat = makeVillager({ kind: 'yard', area: { x0: 0, x1: 0, z0: 0, z1: 0 } }, 0);
  const mx = PLAZA.x0 + 7;
  const mz = PLAZA.z1 - 9;
  cat.group.position.set(mx, 1.2, mz);
  cat.group.scale.setScalar(2.6);
  cat.group.rotation.y = 0.5;
  scene.add(cat.group);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 1.2, 20), toon(0xfff3c4)); ped.position.set(mx, 0.6, mz); ped.castShadow = true; scene.add(ped);
  const tag = plate('서무냥', 3.2, 0.9, { bg: '#ff8fab', color: '#ffffff', size: 0.6, radius: 40 });
  tag.position.set(mx, 0.7, mz + 2.55);
  scene.add(tag);
  animated.push((t) => { cat.head.rotation.z = Math.sin(t * 1.5) * 0.12; cat.arms[1].rotation.x = -1.6 + Math.sin(t * 6) * 0.35; });
}

// 나비 (공원·광장 위를 팔랑팔랑)
{
  const spots = [[BOARD_X, BOARD_Z + 12], [-215, -64], [-120, -30], [PLAZA.x0 + 8, PLAZA.z1 - 6], [DONGSEONG.x, 20], [RIVER.x - 14, 20], [RIVER.x - 14, 110]];
  const wingGeo = new THREE.CircleGeometry(0.32, 10);
  for (let i = 0; i < (LITE ? 10 : 26); i++) {
    const [cx, cz] = spots[i % spots.length];
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: PASTELS[i % 6], side: THREE.DoubleSide });
    const wl = new THREE.Mesh(wingGeo, mat); wl.position.x = -0.28; g.add(wl);
    const wr = new THREE.Mesh(wingGeo, mat); wr.position.x = 0.28; g.add(wr);
    const pl = new THREE.Group(); pl.add(wl); const pr = new THREE.Group(); pr.add(wr); g.add(pl, pr);
    scene.add(g);
    const r = rand(3, 9); const sp = rand(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1); const ph = Math.random() * 6; const hy = rand(1.4, 3.2);
    animated.push((t) => {
      const a = t * sp + ph;
      g.position.set(cx + Math.cos(a) * r, hy + Math.sin(t * 2 + ph) * 0.4, cz + Math.sin(a * 1.3) * r * 0.7);
      g.rotation.y = -a;
      const f = Math.sin(t * 18 + ph) * 1.1;
      pl.rotation.y = f; pr.rotation.y = -f;
    });
  }
}

/* ====================== 실시간 대구 날씨 (Open-Meteo, 키 없음) ====================== */
const WX = { code: null, temp: null };
const WX_NAME = (c) => (c === 0 ? '맑음' : c <= 2 ? '구름 조금' : c === 3 ? '흐림' : c <= 48 ? '안개' : c <= 67 ? '비' : c <= 77 ? '눈' : c <= 82 ? '소나기' : c <= 86 ? '눈' : '뇌우');
const WX_ICON = (c) => (c === 0 ? '☀' : c <= 3 ? '⛅' : c <= 48 ? '🌫' : c <= 67 || (c >= 80 && c <= 82) || c >= 95 ? '☔' : '❄');
let rain = null;
function makePrecip(snow) {
  const n = LITE ? 700 : 1800;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = rand(-90, 90); pos[i * 3 + 1] = rand(0, 60); pos[i * 3 + 2] = rand(-90, 90); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: snow ? 0xffffff : 0xbfe3ff, size: snow ? 0.45 : 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
  pts.userData.snow = snow;
  scene.add(pts);
  return pts;
}
function weatherFx(dt) {
  if (!rain) return;
  rain.position.set(controls.target.x, 0, controls.target.z);
  const a = rain.geometry.attributes.position;
  const v = rain.userData.snow ? 4 : 38;
  for (let i = 0; i < a.count; i++) {
    let y = a.getY(i) - v * dt;
    if (y < 0) y += 60;
    a.setY(i, y);
    if (rain.userData.snow) a.setX(i, a.getX(i) + Math.sin(y + i) * dt * 0.6);
  }
  a.needsUpdate = true;
}
async function loadWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.8694&longitude=128.6062&current=temperature_2m,weather_code&timezone=Asia%2FSeoul');
    const d = await r.json();
    WX.code = d.current.weather_code;
    WX.temp = Math.round(d.current.temperature_2m);
    $('hudWeather').textContent = `${WX_ICON(WX.code)} 대구 ${WX_NAME(WX.code)} ${WX.temp}°`;
    const wet = (WX.code >= 51 && WX.code <= 67) || (WX.code >= 80 && WX.code <= 82) || WX.code >= 95;
    const snow = (WX.code >= 71 && WX.code <= 77) || WX.code === 85 || WX.code === 86;
    const forced = params.get('weather');
    const wantRain = forced ? forced === 'rain' : wet;
    const wantSnow = forced ? forced === 'snow' : snow;
    if (rain) { scene.remove(rain); rain.geometry.dispose(); rain = null; }
    if (wantRain || wantSnow) rain = makePrecip(wantSnow);
  } catch { $('hudWeather').textContent = ''; }
}
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);

/* ====================== 주민 ====================== */
const villagers = [];
const plazaBehavior = {
  kind: 'plaza',
  area: { x0: PLAZA.x0 + 2, x1: PLAZA.x1 - 2, z0: PLAZA.z0 + 2, z1: PLAZA.z1 - 2 },
  watch: { x0: BOARD_X - 12, x1: BOARD_X + 12, z0: BOARD_Z + 5, z1: BOARD_Z + 16 },
  doors: [...shopDoors, hallDoor],
  pillars: [V(BOARD_X - PILLAR_DX, 0, BOARD_Z), V(BOARD_X + PILLAR_DX, 0, BOARD_Z)],
  board: V(BOARD_X, 0, BOARD_Z),
};
const scale = LITE ? 0.5 : 1;
let si = Math.floor(Math.random() * 16);
for (let i = 0; i < Math.round(24 * scale); i++) villagers.push(makeVillager(plazaBehavior, si++));
// 동성로·서문시장 인파, 버스정류장 대기
const crowd = (area, n, id) => { for (let i = 0; i < Math.round(n * scale); i++) villagers.push(makeVillager({ kind: 'yard', area, id }, si++)); };
crowd({ x0: DONGSEONG.x - 2.6, x1: DONGSEONG.x + 2.6, z0: DONGSEONG.z0, z1: DONGSEONG.z1 + 2 }, 16, 'street:동성로');
crowd({ x0: -238, x1: -206, z0: -6, z1: 1 }, 9, 'street:서문시장');
busWaitAreas.forEach((a) => crowd(a, 2, 'bus'));
dongObjs.forEach((d) => {
  for (let i = 0; i < 2; i++) villagers.push(makeVillager({ kind: 'yard', area: d.yard, id: `dong:${d.def.name}` }, si++));
});
const walks = [
  [V(-240, 0, 59 + 7.6), V(60, 0, 59 + 7.6)], [V(60, 0, 59 - 7.6), V(-240, 0, 59 - 7.6)],
  [V(-104 + 7.6, 0, -80), V(-104 + 7.6, 0, 170)], [V(-104 - 7.6, 0, 160), V(-104 - 7.6, 0, -80)],
  [V(22 - 6.6, 0, 30), V(22 - 6.6, 0, 170)], [V(22 + 6.6, 0, -80), V(22 + 6.6, 0, 170)],
  [V(-230, 0, -50 + 7.1), V(50, 0, -50 + 7.1)], [V(50, 0, -50 - 7.1), V(-230, 0, -50 - 7.1)],
  [V(DONGSEONG.x, 0, DONGSEONG.z0), V(DONGSEONG.x, 0, DONGSEONG.z1)], [V(DONGSEONG.x + 1.5, 0, DONGSEONG.z1), V(DONGSEONG.x + 1.5, 0, DONGSEONG.z0)],
  [V(-238, 0, -20), V(-206, 0, -20)],
];
walks.forEach(([a, b], i) => {
  const n = LITE ? 1 : (i < 4 ? 3 : 2);
  for (let k = 0; k < n; k++) villagers.push(makeVillager({ kind: 'road', a, b }, si++));
});
villagers.forEach((v) => scene.add(v.group));

/* ====================== 낮·밤 ====================== */
const SKY = {
  day: { sky: 0x9fd8ff, hemi: 1.15, sun: 1.9, win: 0, bulb: 0.2, lamp: 0, glow: 0 },
  dusk: { sky: 0xf6b48a, hemi: 0.8, sun: 1.0, win: 0.7, bulb: 0.9, lamp: 10, glow: 8 },
  night: { sky: 0x1b2747, hemi: 0.5, sun: 0.35, win: 1.1, bulb: 1.5, lamp: 22, glow: 18 },
};
function applyTime(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(now));
  const forced = params.get('sky');
  const mode = SKY[forced] ? forced : h >= 6 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night';
  const s = SKY[mode];
  scene.background.setHex(s.sky);
  scene.fog.color.setHex(s.sky);
  hemi.intensity = s.hemi;
  sun.intensity = s.sun;
  sun.color.setHex(mode === 'night' ? 0x9db4ff : 0xfff1d6);
  litMaterials.forEach((m) => { m.emissiveIntensity = s.win; });
  bulbMat.emissiveIntensity = s.bulb;
  lampLights.forEach((l) => { l.intensity = s.lamp; });
  screenGlow.intensity = s.glow;
  document.body.style.background = `#${s.sky.toString(16).padStart(6, '0')}`;
}

/* ====================== 데이터 ====================== */
const state = { tasks: [], generatedAt: null, password: null, lastJson: '', summary: null, panel: null };

function syncLabel() {
  if (isDemo) return '예시 데이터 (노션 아님)';
  if (!state.generatedAt) return '동기화 -';
  const day = kstDay(state.generatedAt);
  const label = `${day === kstToday() ? '' : `${shortDate(day)} `}${kstTime(state.generatedAt)}`;
  const age = (Date.now() - new Date(state.generatedAt).getTime()) / 60000;
  return age > STALE_MIN ? `동기화 지연 · 마지막 ${label}` : `노션 동기화 ${label}`;
}
const openTasks = () => state.tasks.filter((t) => !t.done);
const tasksOfType = (type) => openTasks().filter((t) => t.type === type);
const tasksOfDong = (name) => openTasks().filter((t) => `${t.title} ${t.pending || ''}`.includes(name));

function recompute() {
  state.summary = summarize(state.tasks);
  const label = syncLabel();
  sign.setData(state.summary, state.tasks, label);
  $('hudSync').textContent = label;
  $('hudSync').classList.toggle('stale', label.startsWith('동기화 지연'));
  shopObjs.forEach((b) => {
    const open = tasksOfType(b.def.type);
    const evs = open.flatMap((t) => eventsOf(t));
    const over = evs.some((e) => e.diff < 0 || e.timePassed);
    const today = evs.some((e) => e.diff === 0);
    const color = open.length === 0 ? '#b8ad98' : over ? '#e5534b' : today ? '#f29b38' : '#4c9bd6';
    const key = `${open.length}-${color}`;
    if (key === b.lastBadge) return;
    b.lastBadge = key;
    b.badge.material.map.dispose();
    b.badge.material.map = badgeTexture(open.length, color);
    b.badge.material.needsUpdate = true;
  });
  if (state.panel) openPanel(state.panel);
}

function apply(data) {
  const json = JSON.stringify(data);
  if (json === state.lastJson && state.summary) return;
  state.lastJson = json;
  state.tasks = data.tasks || [];
  state.generatedAt = data.generatedAt || null;
  recompute();
}
async function loadWith(password) { apply(await decryptJSON(await fetchEnvelope(), password)); }

/* ====================== 말풍선 대사 ====================== */
const IDLE = ['오늘도 수고 많아요!', '수합 끝나면 체크 잊지 말기', '전광판 확인하고 가요', '커피 한 잔 하고 합시다', '마감 전에 한 번 더 확인!', '공문 번호 확인했나요?', '점심 뭐 먹지…'];
const DONG_IDLE = ['민원 처리 중이에요', '오늘도 친절하게!', '주민센터 앞 산책 중', '동장님 회의 가셨대요', '복지 상담 왔어요'];
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
function taskLine(e) {
  const k = e.kind === 'collect' ? '수합' : '제출';
  if (e.diff < 0) return `${e.task.title} 날짜 지났는데 처리됐나요?`;
  if (e.diff === 0) return `오늘 ${k}! ${e.task.title}`;
  return `${k} ${ddayLabel(e)} · ${e.task.title}`;
}
function talk(v) {
  const s = state.summary;
  if (!s) return null;
  const place = v.place || '';
  if (place.startsWith('shop:')) {
    const type = place.slice(5);
    const shop = SHOPS.find((b) => b.type === type);
    const evs = tasksOfType(type).flatMap((t) => eventsOf(t)).sort((a, b) => a.sortKey - b.sortKey);
    return evs.length ? `${shop.name}: ${evs[0].task.title} ${ddayLabel(evs[0])}` : `${shop.name}은 오늘 한가해요`;
  }
  if (place === 'street:동성로') return pickOne(['동성로 사람 진짜 많다', '약속 있어서 동성로 왔어요', '반월당에서 만나요!', '공문 마감 전에 커피 한 잔', ...(s.events.length ? [taskLine(pickOne(s.events.slice(0, 6)))] : [])]);
  if (place === 'street:서문시장') return pickOne(['서문시장 납작만두 최고', '야시장 언제 열리지?', '시장 구경 왔어요', '칼국수 먹으러 왔어요']);
  if (place === 'bus') return pickOne(['버스 언제 와…', '급행 타야 하는데', '다음 정류장 반월당']);
  if (place === 'hall') return `중구청 남은 일 ${s.stats.open}건, 오늘 기한 ${s.stats.today}건!`;
  if (place.startsWith('dong:')) {
    const name = place.slice(5);
    const ts = tasksOfDong(name);
    if (ts.length && Math.random() < 0.6) return `${name} 관련: ${pickOne(ts).title}`;
    return Math.random() < 0.5 ? `${name} 행정복지센터예요` : pickOne(DONG_IDLE);
  }
  const urgent = s.events.filter((e) => e.diff <= 1);
  const pool = urgent.length ? urgent : s.events.slice(0, 8);
  if (pool.length && Math.random() < (v.behavior.kind === 'plaza' ? 0.75 : 0.4)) return taskLine(pickOne(pool));
  return pickOne(IDLE);
}

/* ====================== 패널 ====================== */
function openPanel(spec) {
  state.panel = spec;
  let title;
  let sub;
  let tasks;
  let empty = '남은 업무가 없어요';
  if (spec.kind === 'shop') { tasks = tasksOfType(spec.shop.type); title = spec.shop.name; sub = `${spec.shop.type} · 남은 일 ${tasks.length}건`; }
  if (spec.kind === 'hall') { tasks = openTasks(); title = '대구광역시 중구청'; sub = `경제진흥팀 서무 · 전체 남은 일 ${tasks.length}건`; }
  if (spec.kind === 'dong') {
    tasks = tasksOfDong(spec.dong.name);
    title = `${spec.dong.name} 행정복지센터`;
    sub = `${spec.dong.addr ? `중구 ${spec.dong.addr} · ` : ''}'${spec.dong.name}'이 들어간 업무 ${tasks.length}건`;
    empty = `'${spec.dong.name}'이 들어간 업무가 없어요`;
  }
  $('panelTitle').textContent = title;
  $('panelSub').textContent = sub;
  const rows = tasks.map((t) => {
    const evs = eventsOf(t).sort((a, b) => a.sortKey - b.sortKey);
    return { t, evs, first: evs[0], key: evs[0] ? evs[0].sortKey : Infinity };
  }).sort((a, z) => a.key - z.key);
  const ul = $('panelList');
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = empty;
    ul.replaceChildren(li);
  } else {
    ul.replaceChildren(...rows.map(({ t, evs, first }) => {
      const li = document.createElement('li');
      const dd = document.createElement('span');
      dd.className = `dd ${first ? level(first) : ''}`;
      dd.textContent = first ? ddayLabel(first) : '미정';
      const ti = document.createElement('span');
      ti.className = 't';
      ti.textContent = t.title;
      const meta = document.createElement('span');
      meta.className = 'm';
      const parts = evs.map((e) => `${e.kind === 'collect' ? '수합' : '제출'} ${dateLabel(e)}${e.time ? ` ${e.time}` : ''}`);
      if (t.collectDone) parts.unshift('수합 완료');
      if (spec.kind !== 'shop' && t.type) parts.push(t.type);
      if (t.methods?.length) parts.push(t.methods.join('·'));
      if (t.pending) parts.push(`미제출: ${t.pending}`);
      meta.textContent = parts.join(' · ') || '날짜 미정';
      li.append(dd, ti, meta);
      return li;
    }));
  }
  $('panel').hidden = false;
}
$('panelClose').addEventListener('click', () => { $('panel').hidden = true; state.panel = null; });

/* ====================== 카메라 이동·둘러보기 ====================== */
let fly = null;
function flyTo(pos, target, dur = 2) {
  fly = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos: pos.clone(), target: target.clone(), t: 0, dur };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const pause = () => { tour.pausedUntil = performance.now() + 60000; };
const tour = { on: true, i: 0, until: 0, pausedUntil: 0 };
const TOUR = [['overview', 30000, true], ['board', 22000, false], ['plaza', 25000, true], ['hall', 14000, false]];
function setTour(on) {
  tour.on = on;
  $('btnTour').setAttribute('aria-pressed', String(on));
  controls.autoRotate = false;
  if (on) startTour(0);
}
function startTour(i) {
  tour.i = i % TOUR.length;
  const [name, ms] = TOUR[tour.i];
  tour.until = performance.now() + ms;
  flyTo(VIEWS[name].pos, VIEWS[name].target, 3);
  controls.autoRotate = false;
}
controls.addEventListener('start', () => { fly = null; controls.autoRotate = false; pause(); });

function focus(spec) {
  if (spec.kind === 'board') return flyTo(VIEWS.board.pos, VIEWS.board.target);
  if (spec.kind === 'hall') return flyTo(VIEWS.hall.pos, VIEWS.hall.target);
  if (spec.kind === 'shop') {
    const s = spec.shop;
    const dir = s.side === 'w' ? 1 : -1;
    return flyTo(V(s.x + dir * 22, 9, s.z + 6), V(s.x, 3, s.z));
  }
  if (spec.kind === 'dong') { const d = spec.dong; return flyTo(V(d.x + Math.sin(d.face) * 34 + 6, 18, d.z + Math.cos(d.face) * 34 + 6), V(d.x, 4, d.z)); }
  return null;
}
$('btnBoard').addEventListener('click', () => { focus({ kind: 'board' }); pause(); });
$('btnOverview').addEventListener('click', () => { flyTo(VIEWS.overview.pos, VIEWS.overview.target); pause(); });
$('btnTour').addEventListener('click', () => setTour(!tour.on));
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('btnFs').addEventListener('click', toggleFullscreen);
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'b' || e.key === 'B') $('btnBoard').click();
  if ((e.key === 'l' || e.key === 'L') && !isDemo) { store.del(PW_KEY); location.reload(); }
});

/* ====================== 클릭 ====================== */
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
function hit(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  return ray.intersectObjects(pickables, false)[0];
}
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  const h = hit(e);
  if (!h) return;
  const spec = h.object.userData.pick;
  if (spec.kind !== 'board') openPanel(spec);
  focus(spec);
  pause();
});
let hoverAt = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - hoverAt < 100) return;
  hoverAt = now;
  renderer.domElement.style.cursor = hit(e) ? 'pointer' : '';
});

/* ====================== 루프 ====================== */
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
let lastMinute = '';
let last = performance.now();
const flags = [];
hall.traverse((o) => { if (o.userData.flag) flags.push(o); });
function frame(nowMs) {
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  const now = new Date();
  const minute = clockFmt.format(now);
  if (minute !== lastMinute) {
    lastMinute = minute;
    $('hudClock').textContent = minute;
    $('hudDate').textContent = longDate(kstToday(now));
    applyTime(now);
    if (state.summary) recompute();
  }

  if (fly) {
    fly.t += dt / fly.dur;
    const k = ease(Math.min(1, fly.t));
    camera.position.lerpVectors(fly.fromPos, fly.pos, k);
    controls.target.lerpVectors(fly.fromTarget, fly.target, k);
    if (fly.t >= 1) {
      fly = null;
      if (tour.on && TOUR[tour.i][2] && nowMs > tour.pausedUntil) controls.autoRotate = true;
    }
  } else if (tour.on && nowMs > tour.pausedUntil) {
    if (nowMs > tour.until) startTour(tour.i + 1);
    else if (TOUR[tour.i][2]) controls.autoRotate = true;
  }
  controls.update();

  sign.update(now, dt);
  villagers.forEach((v) => v.update(dt, talk));
  traffic.update(dt);
  monorail.update(dt);
  clouds.forEach((c) => { c.position.x += c.userData.speed * dt; if (c.position.x > 280) c.position.x = -440; });
  // 이름표는 멀리서 볼 때만 (가까이서는 화면을 가리지 않게)
  const camDist = camera.position.distanceTo(controls.target);
  const labelAlpha = THREE.MathUtils.clamp((camDist - 70) / 50, 0, 1);
  labels.forEach((l) => { l.material.opacity = labelAlpha; l.visible = labelAlpha > 0.02; });
  flags.forEach((f, i) => { f.rotation.y = Math.sin(nowMs / 600 + i) * 0.25; });
  animated.forEach((f) => f(nowMs / 1000));
  weatherFx(dt);
  water.material.color.setHSL(0.56, 0.6, 0.64 + Math.sin(nowMs / 1500) * 0.015);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ====================== 잠금·시작 ====================== */
function showLock(msg = '') {
  $('lock').hidden = false;
  $('lockMsg').textContent = msg;
  $('pw').value = '';
  $('pw').focus();
}
$('lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('pw').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  $('lockMsg').textContent = '';
  try {
    await loadWith(pw);
    state.password = pw;
    if ($('remember').checked) store.set(PW_KEY, pw); else store.del(PW_KEY);
    $('lock').hidden = true;
    startRefresh();
  } catch (err) {
    $('lockMsg').textContent = err.code === 'no-data'
      ? '아직 동기화된 데이터가 없습니다. GitHub 시크릿과 Actions 실행을 확인하세요.'
      : err.name === 'OperationError' ? '비밀번호가 맞지 않습니다.' : err.message;
  } finally {
    btn.disabled = false;
  }
});
let refreshTimer = null;
function startRefresh() {
  if (isDemo || refreshTimer) return;
  refreshTimer = setInterval(async () => {
    try { await loadWith(state.password); } catch (err) {
      if (err.name === 'OperationError') { store.del(PW_KEY); showLock('비밀번호가 바뀌었습니다. 다시 입력하세요.'); } else $('hudSync').textContent = syncLabel();
    }
  }, REFRESH_MS);
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.password && !isDemo) {
    try { await loadWith(state.password); } catch { /* 다음 주기에 다시 */ }
  }
});

async function boot() {
  await Promise.race([
    Promise.all(['900 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '800 40px "Orbitron"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
  applyTime();
  requestAnimationFrame(frame);
  const v = VIEWS[params.get('view')];
  if (v) {
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    tour.pausedUntil = performance.now() + 3600000;
  } else {
    startTour(0);
  }
  $('loading').hidden = true;
  if (isDemo) {
    $('demoBadge').hidden = false;
    $('flatLink').href = 'board.html?demo=1';
    apply(makeDemo());
    return;
  }
  const saved = store.get(PW_KEY);
  if (!saved) { showLock(); return; }
  try {
    await loadWith(saved);
    state.password = saved;
    startRefresh();
  } catch (err) {
    if (err.name === 'OperationError') store.del(PW_KEY);
    showLock(err.code === 'no-data' ? '아직 동기화된 데이터가 없습니다.' : '');
  }
}
boot();
console.info(`서무마을: 주민 ${villagers.length}명 (${SPECIES_NAMES.length}종), 차량 ${traffic.vehicles.length}대, 나무 ${treeSpots.length}그루`);
