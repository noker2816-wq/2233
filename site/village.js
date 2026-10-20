// 서무마을: 광장 한가운데 3D 전광판, 업무유형별 건물, 걸어다니는 동물 주민.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { decryptJSON } from './crypto.js';
import { store, fetchEnvelope, PW_KEY, makeDemo } from './shared.js';
import { summarize, eventsOf, ddayLabel, dateLabel, level, kstToday, kstDay, kstTime, longDate, shortDate } from './logic.js';
import { Signboard } from './signboard.js';
import { makeVillagers, toon } from './villagers.js';

const REFRESH_MS = 3 * 60 * 1000;
const STALE_MIN = 40;
const params = new URLSearchParams(location.search);
const isDemo = params.has('demo');
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const deg = (d) => (d * Math.PI) / 180;

/* ====================== 렌더러·카메라 ====================== */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true });
} catch {
  location.replace(`board.html${location.search}`); // WebGL 안 되면 평면 전광판으로
  throw new Error('WebGL 미지원');
}
// ?lite=1 : 그림자 끄고 해상도 낮춤 (사무실 저사양 PC용)
const LITE = params.has('lite');
renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ff);
scene.fog = new THREE.Fog(0x9fd8ff, 60, 140);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 300);
const VIEWS = {
  overview: { pos: new THREE.Vector3(0, 26, 40), target: new THREE.Vector3(0, 2, -2) },
  plaza: { pos: new THREE.Vector3(9, 6, 15), target: new THREE.Vector3(0, 2.5, 0) },
  board: { pos: new THREE.Vector3(0, 5.6, 14.5), target: new THREE.Vector3(0, 5.6, 0) },
};
camera.position.copy(VIEWS.overview.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(VIEWS.overview.target);
controls.enableDamping = true;
controls.maxPolarAngle = deg(82);
controls.minDistance = 6;
controls.maxDistance = 85;
controls.autoRotateSpeed = 0.45;

/* ====================== 빛 ====================== */
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x6b8f4e, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
sun.position.set(26, 42, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
scene.add(sun);

/* ====================== 땅·길 ====================== */
function flat(geo, color, y, x = 0, z = 0) {
  const m = new THREE.Mesh(geo, toon(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
flat(new THREE.CircleGeometry(80, 64), 0x8fd16a, 0);
flat(new THREE.CircleGeometry(11.6, 64), 0xd8c08f, 0.02);
flat(new THREE.CircleGeometry(10.9, 64), 0xeedcb3, 0.03);
// 광장 바닥 무늬
for (let r = 3; r < 10.5; r += 2.5) flat(new THREE.RingGeometry(r, r + 0.12, 64), 0xe0caa0, 0.04);
// 앞마당 큰길
const road = flat(new THREE.PlaneGeometry(4, 36), 0xeedcb3, 0.025, 0, 28);
road.scale.y = 1;

/* ====================== 광장 전광판 ====================== */
const sign = new Signboard();
const boardGroup = new THREE.Group();
scene.add(boardGroup);
const metal = toon(0x5b4636);
const frameMat = toon(0x2d2d33);
const PILLAR_X = 4.9;
[-1, 1].forEach((s) => {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 8.6, 16), metal);
  p.position.set(s * PILLAR_X, 4.3, 0);
  p.castShadow = true;
  boardGroup.add(p);
  // 기둥 아래 화단
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.8, 0.6, 16), toon(0xc98b5a));
  pot.position.set(s * PILLAR_X, 0.3, 0);
  pot.castShadow = true;
  boardGroup.add(pot);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon([0xff7a8a, 0xffd34d, 0xffffff, 0xb48cf2][i % 4]));
    f.position.set(s * PILLAR_X + Math.cos(a) * 0.55, 0.72, Math.sin(a) * 0.55);
    boardGroup.add(f);
  }
});
const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(10.4, 5.6, 0.6), frameMat);
boardFrame.position.set(0, 5.7, 0);
boardFrame.castShadow = true;
boardGroup.add(boardFrame);
const cap = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.35, 1.1), toon(0xf29b38));
cap.position.set(0, 8.65, 0);
cap.castShadow = true;
boardGroup.add(cap);
const screenMat = new THREE.MeshBasicMaterial({ map: sign.texture, toneMapped: false });
const SCREEN_W = 9.8;
const SCREEN_H = 4.9;
const screenFront = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
screenFront.position.set(0, 5.7, 0.31);
boardGroup.add(screenFront);
const screenBack = screenFront.clone();
screenBack.position.z = -0.31;
screenBack.rotation.y = Math.PI;
boardGroup.add(screenBack);
const screenGlow = new THREE.PointLight(0xffb36b, 0, 14, 2);
screenGlow.position.set(0, 5.5, 2.5);
boardGroup.add(screenGlow);

/* ====================== 건물 (업무유형별) ====================== */
const BUILDINGS = [
  { type: '수합·제출', name: '수합 우체국', wall: 0xfbe3c0, roof: 0x4c9bd6, angle: 70, w: 5.6, h: 3.6 },
  { type: '지출·회계', name: '회계 은행', wall: 0xe6f0d6, roof: 0x5fb86b, angle: 110, w: 5.2, h: 4.2 },
  { type: '급여·인사', name: '인사 관청', wall: 0xece3f6, roof: 0x9b6fd1, angle: 148, w: 5.4, h: 3.8 },
  { type: '정보공개', name: '정보공개 도서관', wall: 0xf8e1dc, roof: 0xe5534b, angle: 180, w: 6.2, h: 4.4 },
  { type: '감사·점검', name: '감사 사무소', wall: 0xfbe9cf, roof: 0xf29b38, angle: 212, w: 5.2, h: 3.6 },
  { type: '행사·차출', name: '행사 공연장', wall: 0xfde3ee, roof: 0xf06fa4, angle: 250, w: 5.8, h: 3.9 },
  { type: '공람·참고', name: '공람 게시판', wall: 0xeeeeea, roof: 0x8a8f99, angle: 290, w: 4.8, h: 3.4 },
];
const RING = 21;
const DOOR_R = RING - 3.4;
const windowMat = new THREE.MeshToonMaterial({ color: 0xbfe6ff, emissive: 0xffd27a, emissiveIntensity: 0, gradientMap: toon(0xffffff).gradientMap });
const pickables = [];

function labelTexture(text, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#8b5a2b';
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, 26);
  g.fill();
  g.strokeStyle = '#6b4220';
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = '#fff3d6';
  g.font = `900 ${Math.round(h * 0.42)}px "Noto Sans KR", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

const doors = [];
const buildingObjs = BUILDINGS.map((b) => {
  const a = deg(b.angle);
  const g = new THREE.Group();
  g.position.set(Math.sin(a) * RING, 0, Math.cos(a) * RING);
  g.rotation.y = a + Math.PI; // 정면이 광장을 보게
  const d = 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, d), toon(b.wall));
  body.position.y = b.h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.3, d + 0.3), toon(0xb9a484));
  base.position.y = 0.15;
  base.receiveShadow = true;
  g.add(base);
  // 4각뿔 지붕: 모서리가 ±1에 오도록 돌린 뒤 건물 크기만큼 늘린다
  const roofGeo = new THREE.ConeGeometry(Math.SQRT2, 2.4, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, toon(b.roof));
  roof.position.y = b.h + 1.2;
  roof.scale.set(b.w / 2 + 0.45, 1, d / 2 + 0.45);
  roof.castShadow = true;
  g.add(roof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), toon(0xb46b4a));
  chimney.position.set(b.w * 0.28, b.h + 1.5, -0.6);
  chimney.castShadow = true;
  g.add(chimney);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), toon(0x7a4a2a));
  door.position.set(0, 1.25, d / 2 + 0.05);
  g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xf2d24b));
  knob.position.set(0.35, 1.2, d / 2 + 0.13);
  g.add(knob);
  [-1, 1].forEach((s) => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.1), windowMat);
    win.position.set(s * (b.w * 0.3), b.h * 0.58, d / 2 + 0.04);
    g.add(win);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.25), toon(0xffffff));
    sill.position.set(s * (b.w * 0.3), b.h * 0.58 - 0.5, d / 2 + 0.1);
    g.add(sill);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: labelTexture(b.name), transparent: true }));
  label.position.set(0, b.h - 0.35, d / 2 + 0.07);
  g.add(label);
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(0, '#aaa'), depthWrite: false }));
  badge.scale.set(1.5, 1.5, 1);
  badge.position.set(0, b.h + 3.1, 0);
  g.add(badge);
  g.traverse((o) => { if (o.isMesh) { o.userData.building = b; pickables.push(o); } });
  scene.add(g);
  doors.push(new THREE.Vector3(Math.sin(a) * DOOR_R, 0, Math.cos(a) * DOOR_R));
  // 문에서 광장까지 오솔길
  const path = flat(new THREE.PlaneGeometry(2, RING - 13), 0xeedcb3, 0.022, Math.sin(a) * (RING + 9) / 2 * 0.95, Math.cos(a) * (RING + 9) / 2 * 0.95);
  path.rotation.z = a;
  return { def: b, group: g, badge, lastBadge: '' };
});
pickables.push(boardFrame, screenFront, screenBack);
[boardFrame, screenFront, screenBack].forEach((m) => { m.userData.board = true; });

/* ====================== 나무·꽃·가로등·연못·구름 ====================== */
function tree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8), toon(0x8b5a2b));
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  g.add(trunk);
  const green = toon([0x5fb86b, 0x4fa65c, 0x73c46e][Math.floor(Math.random() * 3)]);
  if (Math.random() < 0.5) {
    [[0, 2.3, 1.3], [0.5, 2.9, 0.9], [-0.4, 3.1, 0.85]].forEach(([dx, y, r]) => {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), green);
      leaf.position.set(dx, y, dx * 0.4);
      leaf.castShadow = true;
      g.add(leaf);
    });
  } else {
    [[2.2, 1.6], [3.1, 1.25], [3.9, 0.85]].forEach(([y, r]) => {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(r, 1.6, 8), green);
      leaf.position.y = y;
      leaf.castShadow = true;
      g.add(leaf);
    });
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.rotation.y = Math.random() * 6;
  scene.add(g);
}
const blocked = (x, z) => {
  const r = Math.hypot(x, z);
  if (r < 13) return true;
  if (z > 0 && Math.abs(x) < 4.5) return true; // 앞마당 길
  if (Math.hypot(x + 13, z - 20) < 6) return true; // 연못
  return BUILDINGS.some((b) => {
    const a = deg(b.angle);
    return Math.hypot(x - Math.sin(a) * RING, z - Math.cos(a) * RING) < 6;
  });
};
let placed = 0;
for (let i = 0; i < 400 && placed < 70; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = rand(14, 52);
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  if (blocked(x, z)) continue;
  tree(x, z, rand(0.85, 1.3));
  placed++;
}

// 꽃밭 (인스턴스로 한 번에)
const flowerGeo = new THREE.SphereGeometry(0.16, 8, 6);
const flowerColors = [0xff7a8a, 0xffd34d, 0xffffff, 0xb48cf2, 0xff9f43];
flowerColors.forEach((col) => {
  const inst = new THREE.InstancedMesh(flowerGeo, toon(col), 60);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 300 && n < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(12, 40);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (blocked(x, z) && r > 13) continue;
    if (r < 12.2) continue;
    m.makeTranslation(x, 0.18, z);
    inst.setMatrixAt(n++, m);
  }
  inst.count = n;
  scene.add(inst);
});

// 가로등
const bulbMat = new THREE.MeshToonMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 0.2, gradientMap: windowMat.gradientMap });
const lampLights = [];
[30, 90, 150, 210, 270, 330].forEach((ad, i) => {
  const a = deg(ad);
  const x = Math.sin(a) * 12.2;
  const z = Math.cos(a) * 12.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 8), toon(0x3d3d45));
  pole.position.set(x, 1.8, z);
  pole.castShadow = true;
  scene.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), bulbMat);
  bulb.position.set(x, 3.75, z);
  scene.add(bulb);
  if (i % 2 === 0) {
    const l = new THREE.PointLight(0xffc77a, 0, 16, 2);
    l.position.set(x, 3.6, z);
    scene.add(l);
    lampLights.push(l);
  }
});

// 연못
const pond = flat(new THREE.CircleGeometry(4.2, 40), 0x7cc7e8, 0.03, -13, 20);
pond.scale.set(1.3, 0.9, 1);
const pondRim = flat(new THREE.RingGeometry(4.2, 4.7, 40), 0xc9c2b2, 0.035, -13, 20);
pondRim.scale.set(1.3, 0.9, 1);
for (let i = 0; i < 3; i++) {
  const pad = flat(new THREE.CircleGeometry(0.5, 16), 0x5fb86b, 0.05, -13 + rand(-3, 3), 20 + rand(-2, 2));
  pad.scale.setScalar(rand(0.7, 1.1));
}

// 구름
const clouds = [];
for (let i = 0; i < 7; i++) {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.6, 2.6), 1), toon(0xffffff));
    c.position.set(k * 1.9 - 3, rand(-0.4, 0.6), rand(-0.8, 0.8));
    g.add(c);
  }
  g.position.set(rand(-60, 60), rand(24, 32), rand(-50, 30));
  g.userData.speed = rand(0.6, 1.4);
  scene.add(g);
  clouds.push(g);
}

/* ====================== 주민 ====================== */
const villagers = makeVillagers(12, { doors, boardPos: new THREE.Vector3(0, 0, 0), pillars: [new THREE.Vector3(-PILLAR_X, 0, 0), new THREE.Vector3(PILLAR_X, 0, 0)] });
villagers.forEach((v) => scene.add(v.group));

/* ====================== 낮·밤 ====================== */
const SKY = {
  day: { sky: 0x9fd8ff, hemi: 1.15, sun: 1.9, win: 0, bulb: 0.2, lamp: 0, glow: 0 },
  dusk: { sky: 0xf6b48a, hemi: 0.8, sun: 1.0, win: 0.6, bulb: 0.8, lamp: 6, glow: 4 },
  night: { sky: 0x1b2747, hemi: 0.45, sun: 0.35, win: 1.0, bulb: 1.4, lamp: 14, glow: 10 },
};
function applyTime(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }).format(now));
  const forced = params.get('sky'); // ?sky=day|dusk|night 로 고정 가능
  const mode = SKY[forced] ? forced : h >= 6 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night';
  const s = SKY[mode];
  scene.background.setHex(s.sky);
  scene.fog.color.setHex(s.sky);
  hemi.intensity = s.hemi;
  sun.intensity = s.sun;
  sun.color.setHex(mode === 'night' ? 0x9db4ff : 0xfff1d6);
  windowMat.emissiveIntensity = s.win;
  bulbMat.emissiveIntensity = s.bulb;
  lampLights.forEach((l) => { l.intensity = s.lamp; });
  screenGlow.intensity = s.glow;
  document.body.style.background = `#${s.sky.toString(16).padStart(6, '0')}`;
}

/* ====================== 데이터 ====================== */
const state = { tasks: [], generatedAt: null, password: null, lastJson: '', summary: null, openBuilding: null };

function syncLabel() {
  if (isDemo) return '예시 데이터 (노션 아님)';
  if (!state.generatedAt) return '동기화 -';
  const day = kstDay(state.generatedAt);
  const label = `${day === kstToday() ? '' : `${shortDate(day)} `}${kstTime(state.generatedAt)}`;
  const age = (Date.now() - new Date(state.generatedAt).getTime()) / 60000;
  return age > STALE_MIN ? `동기화 지연 · 마지막 ${label}` : `노션 동기화 ${label}`;
}

function recompute() {
  state.summary = summarize(state.tasks);
  const label = syncLabel();
  sign.setData(state.summary, label);
  $('hudSync').textContent = label;
  $('hudSync').classList.toggle('stale', label.startsWith('동기화 지연'));
  updateBadges();
  if (state.openBuilding) openPanel(state.openBuilding);
}

function tasksOfType(type) {
  return state.tasks.filter((t) => !t.done && t.type === type);
}

function updateBadges() {
  buildingObjs.forEach((b) => {
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
}

function apply(data) {
  const json = JSON.stringify(data);
  if (json === state.lastJson && state.summary) return;
  state.lastJson = json;
  state.tasks = data.tasks || [];
  state.generatedAt = data.generatedAt || null;
  recompute();
}

async function loadWith(password) {
  apply(await decryptJSON(await fetchEnvelope(), password));
}

/* ====================== 말풍선 대사 ====================== */
const IDLE_LINES = ['오늘도 수고 많아요!', '수합 끝나면 체크 잊지 말기', '전광판 확인하고 가요', '커피 한 잔 하고 합시다', '마감 전에 한 번 더 확인!'];
function talk(v) {
  const s = state.summary;
  if (!s) return null;
  if (v.where === 'door' && v.doorIndex != null) {
    const b = BUILDINGS[v.doorIndex];
    const evs = tasksOfType(b.type).flatMap((t) => eventsOf(t)).sort((x, y) => x.sortKey - y.sortKey);
    if (evs.length) return `${b.name}: ${evs[0].task.title} ${ddayLabel(evs[0])}`;
    return `${b.name}은 오늘 한가해요`;
  }
  const urgent = s.events.filter((e) => e.diff <= 1);
  const pool = urgent.length ? urgent : s.events.slice(0, 6);
  if (pool.length && Math.random() < 0.75) {
    const e = pool[Math.floor(Math.random() * pool.length)];
    const k = e.kind === 'collect' ? '수합' : '제출';
    if (e.diff < 0) return `${e.task.title} 날짜 지났는데 처리됐나요?`;
    if (e.diff === 0) return `오늘 ${k}! ${e.task.title}`;
    return `${k} ${ddayLabel(e)} · ${e.task.title}`;
  }
  return IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
}

/* ====================== 건물 패널 ====================== */
function openPanel(b) {
  state.openBuilding = b;
  const open = tasksOfType(b.type);
  $('panelTitle').textContent = b.name;
  $('panelSub').textContent = `${b.type} · 남은 일 ${open.length}건`;
  const rows = open.map((t) => {
    const evs = eventsOf(t);
    const first = evs.slice().sort((x, y) => x.sortKey - y.sortKey)[0];
    return { t, evs, first, key: first ? first.sortKey : Infinity };
  }).sort((a, z) => a.key - z.key);
  const ul = $('panelList');
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '남은 업무가 없어요';
    ul.replaceChildren(li);
  } else {
    ul.replaceChildren(...rows.map(({ t, evs, first }) => {
      const li = document.createElement('li');
      const dd = document.createElement('span');
      dd.className = `dd ${first ? level(first) : ''}`;
      dd.textContent = first ? ddayLabel(first) : '미정';
      const title = document.createElement('span');
      title.className = 't';
      title.textContent = t.title;
      const meta = document.createElement('span');
      meta.className = 'm';
      const parts = evs.map((e) => `${e.kind === 'collect' ? '수합' : '제출'} ${dateLabel(e)}${e.time ? ` ${e.time}` : ''}`);
      if (t.collectDone) parts.unshift('수합 완료');
      if (t.methods?.length) parts.push(t.methods.join('·'));
      if (t.pending) parts.push(`미제출: ${t.pending}`);
      meta.textContent = parts.join(' · ') || '날짜 미정';
      li.append(dd, title, meta);
      return li;
    }));
  }
  $('panel').hidden = false;
}
$('panelClose').addEventListener('click', () => { $('panel').hidden = true; state.openBuilding = null; });

/* ====================== 카메라 이동·둘러보기 ====================== */
let fly = null;
function flyTo(pos, target, dur = 1.8) {
  fly = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos: pos.clone(), target: target.clone(), t: 0, dur };
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const tour = { on: true, phase: 'overview', until: 0, pausedUntil: 0 };
const TOUR = { overview: 40000, board: 18000 };
function setTour(on) {
  tour.on = on;
  $('btnTour').setAttribute('aria-pressed', String(on));
  if (on) startTourPhase('overview');
  else controls.autoRotate = false;
}
function startTourPhase(phase) {
  tour.phase = phase;
  tour.until = performance.now() + TOUR[phase];
  const v = VIEWS[phase];
  flyTo(v.pos, v.target, 2.4);
  controls.autoRotate = false;
}
controls.addEventListener('start', () => {
  fly = null;
  controls.autoRotate = false;
  tour.pausedUntil = performance.now() + 60000; // 직접 움직이면 1분 동안 둘러보기 멈춤
});

function focusBuilding(b) {
  const a = deg(b.angle);
  const front = new THREE.Vector3(Math.sin(a) * (RING - 11), 5.5, Math.cos(a) * (RING - 11));
  const target = new THREE.Vector3(Math.sin(a) * RING, 2.6, Math.cos(a) * RING);
  flyTo(front, target);
  tour.pausedUntil = performance.now() + 60000;
}

$('btnBoard').addEventListener('click', () => { flyTo(VIEWS.board.pos, VIEWS.board.target); tour.pausedUntil = performance.now() + 60000; });
$('btnOverview').addEventListener('click', () => { flyTo(VIEWS.overview.pos, VIEWS.overview.target); tour.pausedUntil = performance.now() + 60000; });
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
  if (h.object.userData.board) { flyTo(VIEWS.board.pos, VIEWS.board.target); tour.pausedUntil = performance.now() + 60000; return; }
  const b = h.object.userData.building;
  if (b) { openPanel(b); focusBuilding(b); }
});
let hoverAt = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - hoverAt < 80) return;
  hoverAt = now;
  renderer.domElement.style.cursor = hit(e) ? 'pointer' : '';
});

/* ====================== 루프 ====================== */
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
let lastMinute = '';
let last = performance.now();
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
    if (state.summary) recompute(); // D-day·시각경과 다시 계산
  }

  if (fly) {
    fly.t += dt / fly.dur;
    const k = ease(Math.min(1, fly.t));
    camera.position.lerpVectors(fly.fromPos, fly.pos, k);
    controls.target.lerpVectors(fly.fromTarget, fly.target, k);
    if (fly.t >= 1) {
      fly = null;
      if (tour.on && tour.phase === 'overview' && nowMs > tour.pausedUntil) controls.autoRotate = true;
    }
  } else if (tour.on && nowMs > tour.pausedUntil) {
    if (nowMs > tour.until) startTourPhase(tour.phase === 'overview' ? 'board' : 'overview');
    else if (tour.phase === 'overview') controls.autoRotate = true;
  }
  controls.update();

  sign.update(now, dt);
  villagers.forEach((v) => v.update(dt, talk));
  clouds.forEach((c) => { c.position.x += c.userData.speed * dt; if (c.position.x > 70) c.position.x = -70; });

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
      if (err.name === 'OperationError') { store.del(PW_KEY); showLock('비밀번호가 바뀌었습니다. 다시 입력하세요.'); }
      else { $('hudSync').textContent = syncLabel(); }
    }
  }, REFRESH_MS);
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.password && !isDemo) {
    try { await loadWith(state.password); } catch { /* 다음 주기에 다시 */ }
  }
});

async function boot() {
  // 캔버스 글꼴이 늦게 오면 글자가 기본 글꼴로 그려지므로 먼저 기다린다 (최대 3초)
  await Promise.race([
    Promise.all(['900 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '800 40px "Orbitron"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
  applyTime();
  requestAnimationFrame(frame);
  if (params.has('view') && VIEWS[params.get('view')]) {
    const v = VIEWS[params.get('view')];
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    tour.pausedUntil = performance.now() + 600000;
  } else {
    startTourPhase('overview');
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
