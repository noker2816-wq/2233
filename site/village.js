// 서무마을 (대구 중구) — 실제 지도(OpenStreetMap) 기반.
// 국채보상운동기념공원 광장의 대형 전광판(남향), 남향 중구청, 12개 동 행정복지센터, 명소, 교통, 주민.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { decryptJSON } from './crypto.js';
import { store, fetchEnvelope, PW_KEY, makeDemo } from './shared.js';
import { summarize, eventsOf, ddayLabel, dateLabel, level, kstToday, kstDay, kstTime, longDate, shortDate } from './logic.js';
import { Signboard, MAIN_W, MAIN_H } from './signboard.js';
import { makeVillager, toon, toonGradientMap, SPECIES_NAMES, PathLine } from './villagers.js';
import { Traffic, Monorail, RoadLine } from './traffic.js';
import { buildWorld, fillCity, plate, textCanvas, facadeBox, litMaterials, ringCentroid, pointInRing } from './world.js';

const REFRESH_MS = 3 * 60 * 1000;
const STALE_MIN = 40;
const params = new URLSearchParams(location.search);
const isDemo = params.has('demo');
const LITE = params.has('lite');
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MAP = await (await fetch('map-data.json')).json();

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
scene.fog = new THREE.Fog(0x9fd8ff, 320, 900);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
controls.minDistance = 8;
controls.maxDistance = 700;
controls.autoRotateSpeed = 0.3;

/* ====================== 빛 ====================== */
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x6b8f4e, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 10, far: 420 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);
const followSun = () => {
  const t = controls.target;
  sun.target.position.set(t.x, 0, t.z);
  sun.position.set(t.x + 60, 150, t.z + 90);
};

/* ====================== 이름표 (멀리서 볼 때만) ====================== */
const labels = [];
// tier 1: 동 이름·중구청 (멀리서도) / tier 2: 명소·역 (중간 거리에서만)
function labelSprite(text, x, y, z, width, opts, tier = 2) {
  const tex = textCanvas(text, opts);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, sizeAttenuation: false }));
  const h = 0.032 * (width / 14);
  s.scale.set(h * (tex.image.width / tex.image.height), h, 1);
  s.position.set(x, y, z);
  s.renderOrder = 5;
  s.userData.tier = tier;
  scene.add(s);
  labels.push(s);
  return s;
}

/* ====================== 배치 계획 ====================== */
// 전광판 광장: 국채보상운동기념공원 / 중구청: OSM 기준점 바로 남쪽(국채보상로 남쪽)에 남향
const park = MAP.places.find((p) => p.name === '국채보상운동기념공원');
const [PCX, PCZ] = park?.ring ? ringCentroid(park.ring) : [-36, 6];
const BOARD = { x: PCX, z: PCZ - 2 };
const HALL = { x: MAP.hall[0] + 6, z: MAP.hall[1] + 14 };
const HALL_RECT = { x0: HALL.x - 13, x1: HALL.x + 13, z0: HALL.z - 7, z1: HALL.z + 12 };

const world = buildWorld(scene, MAP, { lite: LITE, labelSprite, reserve: [HALL_RECT] });
const { pickables } = world;

/* ====================== 대형 전광판 ====================== */
const sign = new Signboard();
const SCREEN_W = 22;
const MAIN_PH = SCREEN_W * (MAIN_H / MAIN_W);
const TICK_PH = SCREEN_W * (96 / 2048);
const SCREEN_BOTTOM = 3.6;
const boardGroup = new THREE.Group();
boardGroup.position.set(BOARD.x, 0, BOARD.z);
scene.add(boardGroup);
const frameH = MAIN_PH + TICK_PH + 1.2;
const frameY = SCREEN_BOTTOM - 0.5 + frameH / 2;
const PILLAR_DX = SCREEN_W / 2 + 1.2;
function bmesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; boardGroup.add(m); return m; }
[-1, 1].forEach((s) => {
  bmesh(new THREE.CylinderGeometry(0.45, 0.6, frameY + frameH / 2 + 0.5, 16), toon(0x4a3a2e), s * PILLAR_DX, (frameY + frameH / 2 + 0.5) / 2, 0);
  bmesh(new THREE.CylinderGeometry(1.4, 1.2, 0.8, 18), toon(0xc98b5a), s * PILLAR_DX, 0.4, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bmesh(new THREE.SphereGeometry(0.28, 10, 8), toon([0xff7a8a, 0xffd34d, 0xffffff, 0xb48cf2][i % 4]), s * PILLAR_DX + Math.cos(a) * 0.9, 0.95, Math.sin(a) * 0.9);
  }
});
const boardFrame = bmesh(new THREE.BoxGeometry(SCREEN_W + 1.4, frameH, 0.8), toon(0x2a2a30), 0, frameY, 0);
bmesh(new THREE.BoxGeometry(SCREEN_W + 2.2, 0.45, 1.4), toon(0xf29b38), 0, frameY + frameH / 2 + 0.22, 0);
const boardTitle = plate('국채보상공원 광장 전광판', 8, 1.1, { bg: '#f29b38', color: '#3b2f22', size: 0.55, radius: 30 });
boardTitle.position.set(0, frameY + frameH / 2 + 1.1, 0.15);
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
  const ch = cw * (220 / 1024);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), basic(sign.clock.tex));
  clock.position.set(SCREEN_W / 2 - cw / 2, SCREEN_BOTTOM + TICK_PH + MAIN_PH - ch / 2, 0.02);
  g.add(main, tick, clock);
  boardGroup.add(g);
  screens.push(main, tick, clock);
}
screenSide(0.41, 0);
screenSide(-0.41, Math.PI);
const screenGlow = new THREE.PointLight(0xffb36b, 0, 32, 2);
screenGlow.position.set(0, 8, 5);
boardGroup.add(screenGlow);
[boardFrame, ...screens].forEach((m) => { m.userData.pick = { kind: 'board' }; pickables.push(m); });

// 달구벌대종 (공원 북서쪽)
if (park?.ring) {
  const bell = world.hanok(5, 5, 3.2, 0xe9dcc0, 0x3d4148);
  const xs = park.ring.map((p) => p[0]);
  const zs = park.ring.map((p) => p[1]);
  const bx = Math.min(...xs) + 7;
  const bz = Math.min(...zs) + 7;
  bell.position.set(bx, 0, bz);
  scene.add(bell);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 2.2, 16), toon(0x6b5a3a));
  b.position.set(bx, 2.3, bz);
  scene.add(b);
  labelSprite('달구벌대종', bx, 10, bz, 10, { bg: 'rgba(107,90,58,.95)', color: '#fff', size: 0.5 });
}

/* ====================== 업무유형 부스 (전광판 앞 반원) ====================== */
const BOOTHS = [
  { type: '수합·제출', name: '수합 우체국', wall: 0xfbe3c0, roof: 0x4c9bd6 },
  { type: '지출·회계', name: '회계 은행', wall: 0xe6f0d6, roof: 0x5fb86b },
  { type: '급여·인사', name: '인사 관청', wall: 0xece3f6, roof: 0x9b6fd1 },
  { type: '정보공개', name: '정보공개 도서관', wall: 0xf8e1dc, roof: 0xe5534b },
  { type: '감사·점검', name: '감사 사무소', wall: 0xfbe9cf, roof: 0xf29b38 },
  { type: '행사·차출', name: '행사 공연장', wall: 0xfde3ee, roof: 0xf06fa4 },
  { type: '공람·참고', name: '공람 게시판', wall: 0xeeeeea, roof: 0x8a8f99 },
];
function badgeTexture(n, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff';
  g.font = `900 ${n > 9 ? 56 : 68}px "Orbitron", "Noto Sans KR", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const boothDoors = [];
const boothObjs = BOOTHS.map((b, i) => {
  const a = THREE.MathUtils.degToRad(-75 + (i * 150) / (BOOTHS.length - 1));
  const R = 17;
  const x = BOARD.x + Math.sin(a) * R;
  const z = BOARD.z + 4 + Math.cos(a) * R * 0.75;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(BOARD.x - x, BOARD.z + 8 - z);
  const w = 4.6; const h = 3.4; const d = 3.8;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(b.wall)); body.position.y = h / 2; g.add(body);
  const roofGeo = new THREE.ConeGeometry(Math.SQRT2, 1.8, 4); roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, toon(b.roof)); roof.scale.set(w / 2 + 0.5, 1, d / 2 + 0.5); roof.position.y = h + 0.9; g.add(roof);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.15, 1.2), toon(b.roof)); awn.position.set(0, 2.5, d / 2 + 0.55); awn.rotation.x = 0.25; g.add(awn);
  const lab = plate(b.name, 3.8, 0.85, { bg: '#8b5a2b', color: '#fff3d6', stroke: '#6b4220', size: 0.5 });
  lab.position.set(0, h - 0.4, d / 2 + 0.05); g.add(lab);
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(0, '#aaa'), depthWrite: false }));
  badge.scale.set(1.8, 1.8, 1); badge.position.set(0, h + 3, 0); g.add(badge);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.pick = { kind: 'shop', shop: b, x, z }; pickables.push(o); } });
  scene.add(g);
  const fx = Math.sin(g.rotation.y); const fz = Math.cos(g.rotation.y);
  boothDoors.push({ pos: V(x + fx * 3.6, 0, z + fz * 3.6), id: `shop:${b.type}` });
  return { def: b, badge, lastBadge: '' };
});

/* ====================== 중구청 (남향) ====================== */
const hall = new THREE.Group();
hall.position.set(HALL.x, 0, HALL.z);
scene.add(hall);
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(28, 0.6, 18), toon(0xc9bda6)); base.position.y = 0.3; base.receiveShadow = true; hall.add(base);
  const main = facadeBox(24, 11, 11, 12, 4, '#efe6d6', '#8fb8d8', 6); main.position.set(0, 6.1, -1.5); hall.add(main);
  const tower = facadeBox(8, 19, 8, 4, 7, '#f6f0e4', '#7fa8cc', 4); tower.position.set(0, 10.1, -0.5); hall.add(tower);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.7, 8.8), toon(0x2c5aa0)); cap.position.set(0, 19.9, -0.5); hall.add(cap);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 4), toon(0xdcd2c0)); canopy.position.set(0, 4.2, 6); hall.add(canopy);
  [-4, -1.3, 1.3, 4].forEach((x) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.8, 10), toon(0xffffff)); c.position.set(x, 2.2, 7.6); hall.add(c); });
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(12 - i, 0.25, 1), toon(0xd8ccb6)); s.position.set(0, 0.7 + i * 0.25, 8.9 - i * 0.9); hall.add(s); }
  const np = plate('대구광역시 중구청', 7, 1.4, { bg: '#2c5aa0', color: '#ffffff', size: 0.5, radius: 24 }); np.position.set(0, 16.5, 3.56); hall.add(np);
  [[-10, 0xffffff], [-8, 0x2c5aa0], [-6, 0x5fb86b]].forEach(([x, col]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 8), toon(0xcfd3d8)); pole.position.set(x, 4.5, 10.5); hall.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 0.05), toon(col)); flag.position.set(x + 1, 8.2, 10.5); flag.userData.flag = true; hall.add(flag);
  });
  hall.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.pick = { kind: 'hall' }; pickables.push(o); } });
}
labelSprite('대구 중구청', HALL.x, 28, HALL.z, 20, { bg: '#2c5aa0', color: '#fff', size: 0.5 }, 1);
const hallDoor = { pos: V(HALL.x, 0, HALL.z + 11), id: 'hall' };

/* ====================== 행정복지센터 12곳 (길을 바라보게) ====================== */
const dongObjs = MAP.dongs.map((d, i) => {
  let [x, z] = d.center;
  for (let k = 0; k < 20; k++) {
    const nr = world.nearestRoad(x, z);
    if (nr.clear >= 7.5) break;
    const dx = x - nr.cx; const dz = z - nr.cz;
    const dl = Math.hypot(dx, dz) || 1;
    x = nr.cx + (dx / dl) * (nr.seg.w / 2 + 7.6);
    z = nr.cz + (dz / dl) * (nr.seg.w / 2 + 7.6);
  }
  const nr = world.nearestRoad(x, z);
  const face = Math.atan2(nr.cx - x, nr.cz - z);
  world.addReserve({ x, z, r: 9 });
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = face;
  const w = 11; const h = 8.4; const dep = 8;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.35, dep + 4), toon(0xd8cdb2)); base.position.set(0, 0.17, 1); base.receiveShadow = true; g.add(base);
  const body = facadeBox(w, h, dep, 6, 3, ['#f4efe4', '#eef2f4', '#f6ecdf'][i % 3], '#8fb8d8', 4); body.position.y = h / 2 + 0.35; g.add(body);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, dep + 0.5), toon([0x2c5aa0, 0x3fbfb0, 0x5fb86b][i % 3])); rim.position.y = h + 0.6; g.add(rim);
  const can = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 2.4), toon(0xffffff)); can.position.set(0, 3, dep / 2 + 1.2); g.add(can);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.5, 0.2), toon(0x3a5f86)); door.position.set(0, 1.6, dep / 2 + 0.05); g.add(door);
  const p = plate(`${d.name} 행정복지센터`, 8, 1.1, { bg: '#1f3f6e', color: '#ffffff', size: 0.46, radius: 20 }); p.position.set(0, h - 1, dep / 2 + 0.06); g.add(p);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 6, 8), toon(0xcfd3d8)); pole.position.set(w / 2 + 1, 3, dep / 2 + 1.6); g.add(pole);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.05), toon(0xffffff)); fl.position.set(w / 2 + 1.8, 5.4, dep / 2 + 1.6); g.add(fl);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.pick = { kind: 'dong', dong: d, x, z, face }; pickables.push(o); } });
  scene.add(g);
  labelSprite(d.name, x, h + 6, z, 13, { bg: 'rgba(255,248,232,.94)', color: '#3b2f22', size: 0.56, stroke: '#e7d6ae' }, 1);
  const fx = Math.sin(face); const fz = Math.cos(face);
  const yc = [x + fx * (dep / 2 + 3.5), z + fz * (dep / 2 + 3.5)];
  return { def: d, x, z, face, yard: { x0: yc[0] - 4, x1: yc[0] + 4, z0: yc[1] - 2.5, z1: yc[1] + 2.5 } };
});

/* ====================== 채움 건물·나무·가로등 ====================== */
const buildingCount = fillCity(scene, MAP, world, { lite: LITE });
MAP.majors.forEach((m) => {
  for (let i = 1; i < m.pts.length; i++) {
    const [ax, az] = m.pts[i - 1]; const [bx, bz] = m.pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / len; const tz = (bz - az) / len;
    for (let t = 4; t < len; t += 13) {
      [-1, 1].forEach((s) => {
        const x = ax + tx * t - tz * s * (m.w / 2 + 1.6);
        const z = az + tz * t + tx * s * (m.w / 2 + 1.6);
        if (world.isReserved(x, z, 1)) return;
        if (world.nearestRoad(x, z).clear < 0.8) return;
        world.treeSpots.push([x, z, 0.75]);
      });
    }
  }
});
if (park?.ring) {
  const xs = park.ring.map((p) => p[0]); const zs = park.ring.map((p) => p[1]);
  for (let i = 0, k = 0; i < 2000 && k < 26; i++) {
    const x = rand(Math.min(...xs), Math.max(...xs)); const z = rand(Math.min(...zs), Math.max(...zs));
    if (!pointInRing([x, z], park.ring)) continue;
    if (Math.abs(x - BOARD.x) < 22 && z > BOARD.z - 4 && z < BOARD.z + 22) continue;
    world.treeSpots.push([x, z, rand(0.9, 1.3)]); k++;
  }
}
{
  const spots = world.treeSpots;
  const n = spots.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), toon(0x8b5a2b), n);
  const round = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 1), toon(0xffffff), n);
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.4, 7), toon(0xffffff), n);
  const greens = [0x5fb86b, 0x4fa65c, 0x73c46e, 0x8acb6a, 0xf2a65a];
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const col = new THREE.Color();
  let ri = 0; let ci = 0;
  spots.forEach(([x, z, s], i) => {
    m.compose(V(x, 0.8 * s, z), q, sc.set(s, s, s)); trunk.setMatrixAt(i, m);
    col.setHex(greens[Math.random() < 0.08 ? 4 : Math.floor(Math.random() * 4)]);
    if (Math.random() < 0.6) { m.compose(V(x, 2.6 * s, z), q, sc.set(s, s * rand(0.9, 1.2), s)); round.setMatrixAt(ri, m); round.setColorAt(ri++, col); } else { m.compose(V(x, 3 * s, z), q, sc.set(s, s, s)); cone.setMatrixAt(ci, m); cone.setColorAt(ci++, col); }
  });
  round.count = ri; cone.count = ci;
  [trunk, round, cone].forEach((im) => { im.castShadow = true; scene.add(im); });
}
const bulbMat = new THREE.MeshToonMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 0.2, gradientMap: toonGradientMap() });
const lampLights = [];
{
  const spots = [];
  MAP.majors.forEach((m) => {
    for (let i = 1; i < m.pts.length; i++) {
      const [ax, az] = m.pts[i - 1]; const [bx, bz] = m.pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 10; t < len; t += 26) spots.push([ax + ((bx - ax) * t) / len - ((bz - az) / len) * (m.w / 2 + 0.6), az + ((bz - az) * t) / len + ((bx - ax) / len) * (m.w / 2 + 0.6)]);
    }
  });
  for (let i = 0; i < 6; i++) spots.push([BOARD.x - 20 + i * 8, BOARD.z + 27]);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 4.6, 6), toon(0x3d3d45), spots.length);
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 10, 8), bulbMat, spots.length);
  const mm = new THREE.Matrix4();
  spots.forEach(([x, z], i) => { pole.setMatrixAt(i, mm.makeTranslation(x, 2.3, z)); bulb.setMatrixAt(i, mm.makeTranslation(x, 4.75, z)); });
  scene.add(pole, bulb);
  [[BOARD.x - 18, BOARD.z + 20], [BOARD.x + 18, BOARD.z + 20], [HALL.x - 10, HALL.z + 14], [HALL.x + 10, HALL.z + 14]].forEach(([x, z]) => {
    const l = new THREE.PointLight(0xffc77a, 0, 30, 2); l.position.set(x, 4.5, z); scene.add(l); lampLights.push(l);
  });
}

/* ====================== 교통·도시철도 ====================== */
const roadLines = MAP.majors.map((m) => new RoadLine(m.pts, m.w, m.name));
const traffic = new Traffic(scene, roadLines, { density: LITE ? 0.35 : 0.7 });
const busWait = [];
roadLines.forEach((r) => {
  for (let s = 30; s < r.length - 20; s += 85) {
    [1, -1].forEach((dir) => {
      const ss = dir > 0 ? s : r.length - s;
      if (traffic.junctions.some((j) => j.pt.distanceTo(r.at(ss)) < 18)) return;
      traffic.addBusStop(r, dir, ss);
      const p = r.offsetAt(ss, dir, r.w / 2 + 1.9);
      const t = r.tangent(ss).multiplyScalar(dir);
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.y);
      g.rotation.y = Math.atan2(t.x, t.y) + Math.PI / 2;
      const add = (geo, color, x, y, z) => { const m = new THREE.Mesh(geo, toon(color)); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
      add(new THREE.BoxGeometry(5, 0.2, 1.8), 0x2c5aa0, 0, 2.8, 0);
      add(new THREE.BoxGeometry(5, 2.6, 0.1), 0xbfe6ff, 0, 1.5, -0.85);
      add(new THREE.BoxGeometry(3.6, 0.15, 0.6), 0x8b5a2b, 0, 0.6, -0.5);
      scene.add(g);
      busWait.push({ x0: p.x - 1.4, x1: p.x + 1.4, z0: p.y - 1.4, z1: p.y + 1.4 });
    });
  }
});
MAP.metro.entrances.forEach((e) => {
  let [x, z] = e.p;
  const nr = world.nearestRoad(x, z);
  if (nr.clear < 1) { const dx = x - nr.cx; const dz = z - nr.cz; const dl = Math.hypot(dx, dz) || 1; x = nr.cx + (dx / dl) * (nr.seg.w / 2 + 2); z = nr.cz + (dz / dl) * (nr.seg.w / 2 + 2); }
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const a = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 4), toon(0x9fc9e8)); a.position.y = 1.2; g.add(a);
  const r = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 4.4), toon(0x6b6f76)); r.position.y = 2.55; g.add(r);
  const s = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.15), toon(0xd9383a)); s.position.set(0, 3.6, 2); g.add(s);
  scene.add(g);
  labelSprite(e.name, x, 9, z, 12, { bg: 'rgba(217,56,58,.95)', color: '#fff', size: 0.46 });
});
const monorail = new Monorail(scene, MAP.metro.line3.map((s) => [s.p[0], s.p[1], s.name]), {
  height: 12,
  skip: (x, z) => world.isReserved(x, z, 1),
  label: (text, x, y, z) => labelSprite(text, x, y, z, 11, { bg: 'rgba(255,176,0,.95)', color: '#3b2f22', size: 0.46 }),
});

/* ====================== 주민 ====================== */
const villagers = [];
const scale = LITE ? 0.45 : 1;
let si = Math.floor(Math.random() * 16);
const spawn = (behavior, n) => { for (let i = 0; i < Math.max(1, Math.round(n * scale)); i++) villagers.push(makeVillager(behavior, si++)); };
const plazaBehavior = {
  kind: 'plaza',
  area: { x0: BOARD.x - 16, x1: BOARD.x + 16, z0: BOARD.z + 3, z1: BOARD.z + 18 },
  watch: { x0: BOARD.x - 9, x1: BOARD.x + 9, z0: BOARD.z + 4, z1: BOARD.z + 12 },
  doors: [...boothDoors, hallDoor],
  pillars: [V(BOARD.x - PILLAR_DX, 0, BOARD.z), V(BOARD.x + PILLAR_DX, 0, BOARD.z)],
  board: V(BOARD.x, 0, BOARD.z),
};
spawn(plazaBehavior, 24);
dongObjs.forEach((d) => spawn({ kind: 'yard', area: d.yard, id: `dong:${d.def.name}` }, 2));
MAP.minors.filter((m) => m.name === '동성로' && m.pts.length >= 2).forEach((m) => {
  const path = new PathLine(m.pts);
  if (path.length < 8) return;
  spawn({ kind: 'path', path, jitter: 1.6, id: 'street:동성로' }, Math.min(10, Math.round(path.length / 7)));
});
world.crowdAreas.forEach((a) => spawn({ kind: 'yard', area: { x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1 }, id: `street:${a.name}` }, a.name === '서문시장' ? 12 : 5));
MAP.majors.forEach((m) => {
  [-1, 1].forEach((side) => {
    const pts = [];
    for (let i = 0; i < m.pts.length; i++) {
      const prev = m.pts[Math.max(0, i - 1)]; const next = m.pts[Math.min(m.pts.length - 1, i + 1)];
      const tx = next[0] - prev[0]; const tz = next[1] - prev[1]; const tl = Math.hypot(tx, tz) || 1;
      pts.push([m.pts[i][0] - (tz / tl) * side * (m.w / 2 + 1.6), m.pts[i][1] + (tx / tl) * side * (m.w / 2 + 1.6)]);
    }
    const path = new PathLine(pts);
    spawn({ kind: 'path', path }, Math.round(path.length / 70));
  });
});
busWait.filter((_, i) => i % 2 === 0).forEach((a) => spawn({ kind: 'yard', area: a, id: 'bus' }, 1));
villagers.forEach((v) => scene.add(v.group));

/* ====================== 카메라 시점 ====================== */
const [BX0, BX1, BZ0, BZ1] = MAP.bbox;
const MID = V((BX0 + BX1) / 2 + 20, 0, (BZ0 + BZ1) / 2 - 10);
const dongseongPath = MAP.minors.filter((m) => m.name === '동성로').sort((a, b) => b.pts.length - a.pts.length)[0];
const DS = dongseongPath ? dongseongPath.pts[Math.floor(dongseongPath.pts.length / 2)] : [-90, 0];
const SM = world.crowdAreas.find((a) => a.name === '서문시장');
const VIEWS = {
  overview: { pos: V(MID.x + 10, 300, MID.z + 330), target: MID },
  // 가까운 시점은 건물(최고 38) 위에서 내려다보게
  board: { pos: V(BOARD.x, 8.2, BOARD.z + 21), target: V(BOARD.x, 8.2, BOARD.z) },
  plaza: { pos: V(BOARD.x + 10, 50, BOARD.z + 48), target: V(BOARD.x, 3, BOARD.z + 6) },
  hall: { pos: V(HALL.x + 16, 44, HALL.z + 46), target: V(HALL.x, 8, HALL.z) },
  dongseong: { pos: V(DS[0] + 26, 46, DS[1] + 40), target: V(DS[0], 2, DS[1]) },
  seomun: SM ? { pos: V((SM.x0 + SM.x1) / 2 + 26, 48, (SM.z0 + SM.z1) / 2 + 44), target: V((SM.x0 + SM.x1) / 2, 2, (SM.z0 + SM.z1) / 2) } : null,
};
camera.position.copy(VIEWS.overview.pos);
controls.target.copy(VIEWS.overview.target);

/* ====================== 낮·밤 ====================== */
const SKY = {
  day: { sky: 0x9fd8ff, hemi: 1.15, sun: 1.9, win: 0, bulb: 0.2, lamp: 0, glow: 0 },
  dusk: { sky: 0xf6b48a, hemi: 0.8, sun: 1.0, win: 0.7, bulb: 0.9, lamp: 10, glow: 8 },
  night: { sky: 0x1b2747, hemi: 0.5, sun: 0.35, win: 1.1, bulb: 1.5, lamp: 22, glow: 16 },
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
const tasksOfName = (name) => openTasks().filter((t) => `${t.title} ${t.pending || ''}`.includes(name));
function recompute() {
  state.summary = summarize(state.tasks);
  const label = syncLabel();
  sign.setData(state.summary, state.tasks, label);
  $('hudSync').textContent = label;
  $('hudSync').classList.toggle('stale', label.startsWith('동기화 지연'));
  boothObjs.forEach((b) => {
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
const STREET_LINES = {
  동성로: ['동성로 사람 진짜 많다', '대백 앞에서 만나요!', '반월당 쪽으로 갈까?', '스파크 관람차 타러 가요'],
  서문시장: ['서문시장 납작만두 최고', '야시장 언제 열리지?', '칼국수 먹으러 왔어요', '이불 사러 왔어요'],
  교동시장: ['교동시장 따로국밥!', '대구역 앞이라 사람 많네'],
  방천시장: ['김광석길 보고 왔어요', '방천시장 구경 중'],
};
function talk(v) {
  const s = state.summary;
  if (!s) return null;
  const place = v.place || '';
  if (place.startsWith('shop:')) {
    const type = place.slice(5);
    const shop = BOOTHS.find((b) => b.type === type);
    const evs = tasksOfType(type).flatMap((t) => eventsOf(t)).sort((a, b) => a.sortKey - b.sortKey);
    return evs.length ? `${shop.name}: ${evs[0].task.title} ${ddayLabel(evs[0])}` : `${shop.name}은 오늘 한가해요`;
  }
  if (place.startsWith('street:')) {
    const lines = STREET_LINES[place.slice(7)] || IDLE;
    if (place === 'street:동성로' && s.events.length && Math.random() < 0.3) return taskLine(pickOne(s.events.slice(0, 6)));
    return pickOne(lines);
  }
  if (place === 'bus') return pickOne(['버스 언제 와…', '급행 타야 하는데', '다음 정류장 반월당', '3호선 탈까?']);
  if (place === 'hall') return `중구청 남은 일 ${s.stats.open}건, 오늘 기한 ${s.stats.today}건!`;
  if (place.startsWith('dong:')) {
    const name = place.slice(5);
    const ts = tasksOfName(name);
    if (ts.length && Math.random() < 0.6) return `${name} 관련: ${pickOne(ts).title}`;
    return Math.random() < 0.5 ? `${name} 행정복지센터예요` : pickOne(DONG_IDLE);
  }
  const urgent = s.events.filter((e) => e.diff <= 1);
  const pool = urgent.length ? urgent : s.events.slice(0, 8);
  if (pool.length && Math.random() < (v.behavior.kind === 'plaza' ? 0.75 : 0.3)) return taskLine(pickOne(pool));
  return v.behavior.kind === 'plaza' ? pickOne(IDLE) : (Math.random() < 0.5 ? pickOne(IDLE) : null);
}

/* ====================== 패널 ====================== */
function openPanel(spec) {
  state.panel = spec;
  let title; let sub; let tasks; let empty = '남은 업무가 없어요';
  if (spec.kind === 'shop') { tasks = tasksOfType(spec.shop.type); title = spec.shop.name; sub = `${spec.shop.type} · 남은 일 ${tasks.length}건`; }
  if (spec.kind === 'hall') { tasks = openTasks(); title = '대구광역시 중구청'; sub = `경제진흥팀 서무 · 전체 남은 일 ${tasks.length}건`; }
  if (spec.kind === 'dong') {
    tasks = tasksOfName(spec.dong.name);
    title = `${spec.dong.name} 행정복지센터`;
    sub = `${spec.dong.approx ? '위치는 동 경계 중심 기준 대략 · ' : ''}'${spec.dong.name}'이 들어간 업무 ${tasks.length}건`;
    empty = `'${spec.dong.name}'이 들어간 업무가 없어요`;
  }
  if (spec.kind === 'place') {
    const key = spec.name.replace(/ .*/, '');
    tasks = tasksOfName(key);
    title = spec.name;
    sub = `'${key}'이 들어간 업무 ${tasks.length}건`;
    empty = '관련 업무가 없어요';
  }
  $('panelTitle').textContent = title;
  $('panelSub').textContent = sub;
  const rows = tasks.map((t) => {
    const evs = eventsOf(t).sort((a, b) => a.sortKey - b.sortKey);
    return { t, evs, first: evs[0], key: evs[0] ? evs[0].sortKey : Infinity };
  }).sort((a, z) => a.key - z.key);
  const ul = $('panelList');
  if (!rows.length) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = empty; ul.replaceChildren(li);
  } else {
    ul.replaceChildren(...rows.map(({ t, evs, first }) => {
      const li = document.createElement('li');
      const dd = document.createElement('span'); dd.className = `dd ${first ? level(first) : ''}`; dd.textContent = first ? ddayLabel(first) : '미정';
      const ti = document.createElement('span'); ti.className = 't'; ti.textContent = t.title;
      const meta = document.createElement('span'); meta.className = 'm';
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
function flyTo(pos, target, dur = 2.2) { fly = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos: pos.clone(), target: target.clone(), t: 0, dur }; }
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const tour = { on: true, i: 0, until: 0, pausedUntil: 0 };
const pause = () => { tour.pausedUntil = performance.now() + 60000; };
const TOUR = [['overview', 26000, true], ['board', 20000, false], ['dongseong', 16000, true], ['plaza', 18000, true], ['seomun', 14000, true], ['hall', 12000, false]].filter(([n]) => VIEWS[n]);
function setTour(on) { tour.on = on; $('btnTour').setAttribute('aria-pressed', String(on)); controls.autoRotate = false; if (on) startTour(0); }
function startTour(i) {
  tour.i = i % TOUR.length;
  const [name, ms] = TOUR[tour.i];
  tour.until = performance.now() + ms;
  flyTo(VIEWS[name].pos, VIEWS[name].target, 3.2);
  controls.autoRotate = false;
}
controls.addEventListener('start', () => { fly = null; controls.autoRotate = false; pause(); });
function focus(spec) {
  if (spec.kind === 'board') return flyTo(VIEWS.board.pos, VIEWS.board.target);
  if (spec.kind === 'hall') return flyTo(VIEWS.hall.pos, VIEWS.hall.target);
  if (spec.kind === 'shop') return flyTo(V(spec.x + (spec.x - BOARD.x) * 0.6, 8, spec.z + 14), V(spec.x, 2.5, spec.z));
  if (spec.kind === 'dong') { const fx = Math.sin(spec.face); const fz = Math.cos(spec.face); return flyTo(V(spec.x + fx * 30 + 8, 42, spec.z + fz * 30 + 8), V(spec.x, 4, spec.z)); }
  if (spec.kind === 'place') { const p = world.places[spec.name]; if (p) return flyTo(V(p.x + 22, 46, p.z + 40), V(p.x, 4, p.z)); }
  return null;
}
$('btnBoard').addEventListener('click', () => { focus({ kind: 'board' }); pause(); });
$('btnOverview').addEventListener('click', () => { flyTo(VIEWS.overview.pos, VIEWS.overview.target); pause(); });
$('btnTour').addEventListener('click', () => setTour(!tour.on));
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
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
  if (now - hoverAt < 120) return;
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
    if (fly.t >= 1) { fly = null; if (tour.on && TOUR[tour.i][2] && nowMs > tour.pausedUntil) controls.autoRotate = true; }
  } else if (tour.on && nowMs > tour.pausedUntil) {
    if (nowMs > tour.until) startTour(tour.i + 1);
    else if (TOUR[tour.i][2]) controls.autoRotate = true;
  }
  controls.update();
  followSun();

  sign.update(now, dt);
  villagers.forEach((v) => v.update(dt, talk));
  traffic.update(dt);
  monorail.update(dt);
  world.animated.forEach((f) => f(nowMs / 1000));
  flags.forEach((f, i) => { f.rotation.y = Math.sin(nowMs / 600 + i) * 0.25; });
  const camDist = camera.position.distanceTo(controls.target);
  const a1 = THREE.MathUtils.clamp((camDist - 70) / 60, 0, 1);
  const a2 = a1 * THREE.MathUtils.clamp((330 - camDist) / 60, 0, 1);
  labels.forEach((l) => { const a = l.userData.tier === 1 ? a1 : a2; l.material.opacity = a; l.visible = a > 0.02; });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

/* ====================== 잠금·시작 ====================== */
function showLock(msg = '') { $('lock').hidden = false; $('lockMsg').textContent = msg; $('pw').value = ''; $('pw').focus(); }
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
    $('lockMsg').textContent = err.code === 'no-data' ? '아직 동기화된 데이터가 없습니다. GitHub 시크릿과 Actions 실행을 확인하세요.' : err.name === 'OperationError' ? '비밀번호가 맞지 않습니다.' : err.message;
  } finally { btn.disabled = false; }
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
  if (document.visibilityState === 'visible' && state.password && !isDemo) { try { await loadWith(state.password); } catch { /* 다음 주기 */ } }
});

async function boot() {
  await Promise.race([
    Promise.all(['900 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '800 40px "Orbitron"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {});
  applyTime();
  requestAnimationFrame(frame);
  const v = VIEWS[params.get('view')];
  if (v) { camera.position.copy(v.pos); controls.target.copy(v.target); tour.pausedUntil = performance.now() + 3600000; } else startTour(0);
  $('loading').hidden = true;
  if (isDemo) { $('demoBadge').hidden = false; $('flatLink').href = 'board.html?demo=1'; apply(makeDemo()); return; }
  const saved = store.get(PW_KEY);
  if (!saved) { showLock(); return; }
  try { await loadWith(saved); state.password = saved; startRefresh(); } catch (err) {
    if (err.name === 'OperationError') store.del(PW_KEY);
    showLock(err.code === 'no-data' ? '아직 동기화된 데이터가 없습니다.' : '');
  }
}
boot();
console.info(`서무마을: 주민 ${villagers.length}명 (${SPECIES_NAMES.length}종), 차량 ${traffic.vehicles.length}대, 교차로 ${traffic.junctions.length}곳, 건물 ${buildingCount}채, 나무 ${world.treeSpots.length}그루`);
