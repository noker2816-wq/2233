// 실제 지도 데이터(map-data.json, © OpenStreetMap contributors)로 대구 중구를 짓는다.
// 땅·동 경계·도로·신천·채움 건물·명소. 주민·교통·전광판은 village.js에서 붙인다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, toonGradientMap, bakeGroup } from './villagers.js';

const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- 기하 도우미 ---------------- */
export function pointInRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), cx, cz, tx: dx / Math.sqrt(l2), tz: dz / Math.sqrt(l2) };
}
function bbox(ring) {
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
export function ringCentroid(ring) {
  let a = 0; let cx = 0; let cz = 0;
  ring.forEach(([x1, z1], i) => {
    const [x2, z2] = ring[(i + 1) % ring.length];
    const c = x1 * z2 - x2 * z1;
    a += c; cx += (x1 + x2) * c; cz += (z1 + z2) * c;
  });
  return Math.abs(a) < 1e-6 ? ring[0] : [cx / (3 * a), cz / (3 * a)];
}

// 폴리라인 → 바닥 띠 (y 고정)
function ribbonGeo(pts, w, y, closed = false) {
  const n = pts.length;
  if (n < 2) return null;
  const pos = [];
  const idx = [];
  const P = closed ? [...pts, pts[0]] : pts;
  const m = P.length;
  for (let i = 0; i < m; i++) {
    const prev = P[Math.max(0, i - 1)];
    const next = P[Math.min(m - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    let scale = 1;
    if (i > 0 && i < m - 1) {
      const ax = P[i][0] - prev[0]; const az = P[i][1] - prev[1];
      const al = Math.hypot(ax, az) || 1;
      const cos = (ax / al) * tx + (az / al) * tz;
      scale = Math.min(2, 1 / Math.max(0.5, cos));
    }
    const nx = -tz * (w / 2) * scale;
    const nz = tx * (w / 2) * scale;
    pos.push(P[i][0] + nx, y, P[i][1] + nz, P[i][0] - nx, y, P[i][1] - nz);
    if (i < m - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 위를 보게 (감긴 방향이 반대면 노멀 뒤집기)
  if (g.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}
function shapeGeo(ring, y) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
function extrudeRing(ring, h, color, y = 0) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const m = new THREE.Mesh(g, toon(color));
  m.castShadow = m.receiveShadow = true;
  return m;
}
function addMerged(scene, geos, mat, { receive = true, cast = false } = {}) {
  const list = geos.filter(Boolean).map((g) => (g.index ? g : g));
  if (!list.length) return null;
  const clean = list.map((g) => { const c = g.index ? g : g; Object.keys(c.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal') c.deleteAttribute(k); }); return c; });
  const m = new THREE.Mesh(mergeGeometries(clean), mat);
  m.receiveShadow = receive;
  m.castShadow = cast;
  scene.add(m);
  return m;
}

/* ---------------- 글자 텍스처 ---------------- */
export function textCanvas(text, { w = 1024, h = 256, bg = null, color = '#fff', font = 900, size = 0.5, radius = 40, stroke = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, radius);
    g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 10; g.stroke(); }
  }
  let fs = Math.round(h * size);
  g.font = `${font} ${fs}px "Noto Sans KR", sans-serif`;
  while (g.measureText(text).width > w - 60 && fs > 10) { fs -= 4; g.font = `${font} ${fs}px "Noto Sans KR", sans-serif`; }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function plate(text, w, h, opts) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textCanvas(text, opts), transparent: true }));
}

/* ---------------- 창문 재질 (밤에 불 켜짐) ---------------- */
export const litMaterials = [];
function windowTex(cols, rows, wall, glass, lit) {
  const c = document.createElement('canvas');
  c.width = cols * 32; c.height = rows * 32;
  const g = c.getContext('2d');
  g.fillStyle = lit ? '#000' : wall;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (lit && Math.random() > 0.65) continue;
    g.fillStyle = lit ? '#ffd27a' : glass;
    g.fillRect(i * 32 + 6, j * 32 + 7, 20, 18);
  }
  const t = new THREE.CanvasTexture(c);
  if (!lit) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function facadeMat(cols, rows, wall = '#ffffff', glass = '#8fb8d8') {
  const m = new THREE.MeshToonMaterial({ map: windowTex(cols, rows, wall, glass), emissive: 0xffffff, emissiveMap: windowTex(cols, rows, wall, glass, true), emissiveIntensity: 0, gradientMap: toonGradientMap() });
  litMaterials.push(m);
  return m;
}
export function facadeBox(w, h, d, cols, rows, wall, glass, sideCols) {
  const f = facadeMat(cols, rows, wall, glass);
  const s = facadeMat(sideCols || Math.max(2, Math.round((cols * d) / w)), rows, wall, glass);
  const top = toon(new THREE.Color(wall).multiplyScalar(0.85).getHex());
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [s, s, top, top, f, f]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/* ================================================================ */
export function buildWorld(scene, MAP, { lite = false, labelSprite, reserve = [] } = {}) {
  const [BX0, BX1, BZ0, BZ1] = MAP.bbox;
  const majors = MAP.majors;
  const minors = MAP.minors;
  const out = { pickables: [], dongs: [], places: {}, treeSpots: [], animated: [], walkPaths: [], crowdAreas: [] };

  // 도로 선분 목록 (거리 계산용)
  const segs = [];
  majors.forEach((m) => m.pts.forEach((p, i) => { if (i) segs.push({ a: m.pts[i - 1], b: p, w: m.w, major: true, name: m.name }); }));
  minors.forEach((m) => m.pts.forEach((p, i) => { if (i) segs.push({ a: m.pts[i - 1], b: p, w: m.w, major: false, name: m.name, kind: m.kind }); }));
  const riverPts = MAP.river ? MAP.river.pts : [];
  out.nearestRoad = (x, z, majorOnly = false) => {
    let best = { clear: Infinity };
    segs.forEach((s) => {
      if (majorOnly && !s.major) return;
      const r = segDist(x, z, s.a[0], s.a[1], s.b[0], s.b[1]);
      const clear = r.d - s.w / 2;
      if (clear < best.clear) best = { clear, ...r, seg: s };
    });
    return best;
  };
  const riverDist = (x, z) => {
    let d = Infinity;
    for (let i = 1; i < riverPts.length; i++) d = Math.min(d, segDist(x, z, riverPts[i - 1][0], riverPts[i - 1][1], riverPts[i][0], riverPts[i][1]).d);
    return d;
  };
  out.riverDist = riverDist;

  /* ---- 땅 ---- */
  const cx = (BX0 + BX1) / 2;
  const cz = (BZ0 + BZ1) / 2;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(BX1 - BX0 + 500, BZ1 - BZ0 + 500), toon(0x8fcf6c));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, -0.05, cz);
  grass.receiveShadow = true;
  scene.add(grass);
  const city = new THREE.Mesh(new THREE.PlaneGeometry(BX1 - BX0 + 40, BZ1 - BZ0 + 40), toon(0xd6cfbf));
  city.rotation.x = -Math.PI / 2;
  city.position.set(cx, 0, cz);
  city.receiveShadow = true;
  scene.add(city);
  // 중구 안쪽은 조금 밝게
  const jung = new THREE.Mesh(shapeGeo(MAP.jung, 0.01), toon(0xe6dfcf));
  jung.receiveShadow = true;
  scene.add(jung);

  /* ---- 신천 ---- */
  if (riverPts.length) {
    addMerged(scene, [ribbonGeo(riverPts, MAP.river.w + 34, 0.015)], toon(0x86c46c));
    const water = addMerged(scene, [ribbonGeo(riverPts, MAP.river.w, 0.03)], toon(0x6cb8e0));
    out.water = water;
    // 둔치 나무
    for (let i = 1; i < riverPts.length; i++) {
      const [ax, az] = riverPts[i - 1];
      const [bx, bz] = riverPts[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 11) {
        const k = t / len;
        const x = ax + (bx - ax) * k;
        const z = az + (bz - az) * k;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        [-1, 1].forEach((s) => {
          const px = x + nx * s * (MAP.river.w / 2 + 9);
          const pz = z + nz * s * (MAP.river.w / 2 + 9);
          if (out.nearestRoad(px, pz).clear > 3) out.treeSpots.push([px, pz, rand(0.9, 1.3)]);
        });
      }
    }
  }

  /* ---- 도로 ---- */
  const sidewalk = [];
  const asphalt = [];
  const marks = [];
  const minorG = [];
  const pedG = [];
  majors.forEach((m) => {
    sidewalk.push(ribbonGeo(m.pts, m.w + 4.4, 0.035));
    asphalt.push(ribbonGeo(m.pts, m.w, 0.05));
    marks.push(ribbonGeo(m.pts, 0.45, 0.07));
    // 차선 점선
    [-1, 1].forEach((side) => {
      for (let i = 1; i < m.pts.length; i++) {
        const [ax, az] = m.pts[i - 1];
        const [bx, bz] = m.pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / len; const tz = (bz - az) / len;
        for (let t = 2; t < len - 2; t += 7) {
          const x = ax + tx * t - tz * side * m.w * 0.25;
          const z = az + tz * t + tx * side * m.w * 0.25;
          const g = new THREE.PlaneGeometry(0.3, 3);
          g.rotateX(-Math.PI / 2);
          g.rotateY(Math.atan2(tx, tz));
          g.translate(x, 0.07, z);
          marks.push(g);
        }
      }
    });
  });
  minors.forEach((m) => {
    if (m.kind === 'pedestrian') pedG.push(ribbonGeo(m.pts, m.w + 1.5, 0.045));
    else minorG.push(ribbonGeo(m.pts, m.w, 0.04));
  });
  addMerged(scene, sidewalk, toon(0xc9bfa8));
  addMerged(scene, minorG, toon(0x9a9ea6));
  addMerged(scene, pedG, toon(0xd9a77c));
  addMerged(scene, asphalt, toon(0x5f636b));
  addMerged(scene, marks, toon(0xf3eedc));

  /* ---- 동 경계 + 이름 ---- */
  const lines = [];
  MAP.dongs.forEach((d) => lines.push(ribbonGeo(d.ring, 0.7, 0.09, true)));
  addMerged(scene, lines, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  addMerged(scene, [ribbonGeo(MAP.jung, 2.2, 0.095, true)], new THREE.MeshBasicMaterial({ color: 0x2c5aa0, transparent: true, opacity: 0.6 }));
  MAP.dongs.forEach((d) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(34, 8.5), new THREE.MeshBasicMaterial({ map: textCanvas(d.name, { color: 'rgba(44,90,160,.55)', size: 0.7 }), transparent: true, depthWrite: false }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(d.label[0], 0.12, d.label[1]);
    scene.add(p);
  });

  /* ---- 예약 영역 (채움 건물·나무 금지) ---- */
  const reserved = [...reserve];
  const reserveRing = (ring, pad = 2) => { const b = bbox(ring); reserved.push({ ring, pad, ...b }); };
  const isReserved = (x, z, pad = 0) => reserved.some((r) => {
    if (r.ring) return x > r.x0 - r.pad - pad && x < r.x1 + r.pad + pad && z > r.z0 - r.pad - pad && z < r.z1 + r.pad + pad && (pointInRing([x, z], r.ring) || ringNear(x, z, r.ring, r.pad + pad));
    if (r.r != null) return Math.hypot(x - r.x, z - r.z) < r.r + pad;
    return x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  });
  function ringNear(x, z, ring, pad) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]; const b = ring[(i + 1) % ring.length];
      if (segDist(x, z, a[0], a[1], b[0], b[1]).d < pad) return true;
    }
    return false;
  }
  out.isReserved = isReserved;
  out.addReserve = (r) => reserved.push(r);

  /* ---- 명소 ---- */
  const place = Object.fromEntries(MAP.places.map((p) => [p.name, p]));
  out.places = place;
  const pick = (obj, spec) => obj.traverse((o) => { if (o.isMesh) { o.userData.pick = spec; out.pickables.push(o); } });
  const label = (text, x, y, z, w, opts) => labelSprite && labelSprite(text, x, y, z, w, opts);
  const parkTrees = (ring, n, avoid = () => false) => {
    const b = bbox(ring);
    for (let i = 0, k = 0; i < n * 30 && k < n; i++) {
      const x = rand(b.x0, b.x1); const z = rand(b.z0, b.z1);
      if (!pointInRing([x, z], ring) || avoid(x, z)) continue;
      out.treeSpots.push([x, z, rand(0.9, 1.4)]); k++;
    }
  };
  const greenRing = (ring, color = 0x79c26a) => { const m = new THREE.Mesh(shapeGeo(ring, 0.06), toon(color)); m.receiveShadow = true; scene.add(m); return m; };
  const circleRing = (x, z, r, n = 28) => Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, z + Math.sin((i / n) * Math.PI * 2) * r]);

  // 한옥 지붕 건물
  function hanok(w, d, h, wallColor = 0xf3ead6, roofColor = 0x4a4f57) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), toon(0xc9bda6)); base.position.y = 0.3; g.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(wallColor)); body.position.y = 0.6 + h / 2; g.add(body);
    [-1, 1].forEach((s) => { for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 4) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, h, 8), toon(0x8b3a2a)); c.position.set(x, 0.6 + h / 2, s * (d / 2 + 0.05)); g.add(c); } });
    const roofGeo = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, toon(roofColor));
    roof.scale.set((w + 3) * 0.72, h * 0.7, (d + 3) * 0.72);
    roof.position.y = 0.6 + h + (h * 0.7) / 2;
    g.add(roof);
    [-1, 1].forEach((s) => { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 6), toon(roofColor)); tip.position.set(s * (w / 2 + 1.4), 0.6 + h + 0.2, 0); tip.rotation.z = s * -1.1; g.add(tip); });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  out.hanok = hanok;

  // 국채보상운동기념공원 (광장·전광판 자리, 달구벌대종)
  const gukchae = place['국채보상운동기념공원'];
  if (gukchae?.ring) {
    greenRing(gukchae.ring);
    reserveRing(gukchae.ring, 3);
    out.parkGukchae = gukchae;
  }
  // 2.28기념중앙공원
  const p228 = place['2.28기념중앙공원'];
  if (p228?.ring) {
    greenRing(p228.ring);
    reserveRing(p228.ring, 2);
    const [fx, fz] = ringCentroid(p228.ring);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.8, 24), toon(0xd8d4cc)); f.position.set(fx, 0.4, fz); scene.add(f);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 24), toon(0x7cc7e8)); w.position.set(fx, 0.85, fz); scene.add(w);
    parkTrees(p228.ring, 22, (x, z) => Math.hypot(x - fx, z - fz) < 5);
    label('2·28기념중앙공원', fx, 10, fz, 13, { bg: 'rgba(95,184,107,.95)', color: '#fff', size: 0.46 });
  }
  // 경상감영공원 (선화당)
  const gy = place['경상감영공원'];
  if (gy?.ring) {
    greenRing(gy.ring);
    reserveRing(gy.ring, 2);
    const [hx, hz] = ringCentroid(gy.ring);
    const h = hanok(10, 6, 3.4); h.position.set(hx, 0, hz); scene.add(h);
    parkTrees(gy.ring, 22, (x, z) => Math.hypot(x - hx, z - hz) < 9);
    label('경상감영공원', hx, 12, hz, 13, { bg: 'rgba(95,184,107,.95)', color: '#fff', size: 0.46 });
  }
  // 달성공원 (대략 위치·크기)
  const ds = place['달성공원'];
  if (ds) {
    const r = circleRing(ds.x, ds.z, 20);
    greenRing(r, 0x6fbf62);
    reserved.push({ x: ds.x, z: ds.z, r: 22 });
    const gate = hanok(7, 4, 3, 0xe9dcc0, 0x3d4148); gate.position.set(ds.x, 0, ds.z + 14); scene.add(gate);
    parkTrees(r, 60, (x, z) => Math.hypot(x - ds.x, z - (ds.z + 14)) < 6);
    label('달성공원', ds.x, 12, ds.z, 13, { bg: 'rgba(95,184,107,.95)', color: '#fff', size: 0.5 });
  }
  // 청라언덕 (언덕 + 선교사 주택)
  const cr = place['청라언덕'];
  if (cr) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x7cc46a));
    hill.scale.set(1, 0.35, 1);
    hill.position.set(cr.x + 6, 0, cr.z - 6);
    hill.receiveShadow = true;
    scene.add(hill);
    reserved.push({ x: cr.x + 6, z: cr.z - 6, r: 14 });
    for (let i = 0; i < 3; i++) {
      const hs = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3.4), toon(0xb5523b)); b.position.y = 1.5; hs.add(b);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), toon(0x4a4f57)); rf.rotation.y = Math.PI / 4; rf.position.y = 3.8; hs.add(rf);
      hs.position.set(cr.x + 6 + (i - 1) * 6, 3.6, cr.z - 6 + (i % 2) * 3);
      hs.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(hs);
    }
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; const rr = rand(4, 12); out.treeSpots.push([cr.x + 6 + Math.cos(a) * rr, cr.z - 6 + Math.sin(a) * rr, 0.9]); }
    label('청라언덕', cr.x + 6, 14, cr.z - 6, 12, { bg: 'rgba(95,184,107,.95)', color: '#fff', size: 0.5 });
  }

  // 링이 있는 건물들
  function ringBuilding(name, h, color, extra) {
    const p = place[name];
    if (!p?.ring) return null;
    const m = extrudeRing(p.ring, h, color, 0);
    scene.add(m);
    reserveRing(p.ring, 1.5);
    const [x, z] = ringCentroid(p.ring);
    extra?.(x, z, p, m);
    pick(m, { kind: 'place', name });
    return { x, z, m };
  }
  // 스파크랜드: 옥상 관람차
  ringBuilding('스파크랜드', 24, 0xe8e0f2, (x, z) => {
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.25, 8, 40), toon(0xf06fa4));
    wheel.add(rim);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 12, 0.12), toon(0xffffff));
      sp.rotation.z = a;
      wheel.add(sp);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), toon([0xffd34d, 0x4c9bd6, 0xe5534b, 0x5fb86b][i % 4]));
      cab.position.set(Math.cos(a) * 6, Math.sin(a) * 6, 0);
      cab.userData.cabin = true;
      wheel.add(cab);
    }
    wheel.position.set(x, 24 + 7, z);
    scene.add(wheel);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 7, 8), toon(0xffffff)); stand.position.set(x, 27.5, z); scene.add(stand);
    out.animated.push((t) => { wheel.rotation.z = t * 0.12; wheel.children.forEach((c) => { if (c.userData.cabin) c.rotation.z = -wheel.rotation.z; }); });
    label('스파크랜드 관람차', x, 42, z, 14, { bg: 'rgba(240,111,164,.95)', color: '#fff', size: 0.46 });
  });
  ringBuilding('계산성당', 9, 0xb5523b, (x, z, p) => {
    const b = bbox(p.ring);
    [-1, 1].forEach((s) => {
      const tx = x + s * Math.min(3, (b.x1 - b.x0) / 3);
      const tz = b.z1 - 1;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 15, 2.4), toon(0xa3472f)); tower.position.set(tx, 7.5, tz); tower.castShadow = true; scene.add(tower);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6, 4), toon(0x3d4148)); sp.rotation.y = Math.PI / 4; sp.position.set(tx, 18, tz); scene.add(sp);
    });
    label('계산성당', x, 24, z, 11, { bg: 'rgba(163,71,47,.95)', color: '#fff', size: 0.5 });
  });
  ringBuilding('대구제일교회', 8, 0xc99a7a, (x, z) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 3), toon(0xb07a5a)); t.position.set(x, 9, z); t.castShadow = true; scene.add(t);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 4), toon(0x5a6370)); sp.rotation.y = Math.PI / 4; sp.position.set(x, 21.5, z); scene.add(sp);
    label('대구제일교회', x, 28, z, 11, { bg: 'rgba(176,122,90,.95)', color: '#fff', size: 0.46 });
  });
  ringBuilding('대구근대역사관', 9, 0xf1e6cc, (x, z) => label('대구근대역사관', x, 16, z, 12, { bg: 'rgba(139,90,43,.95)', color: '#fff', size: 0.46 }));
  ringBuilding('경북대학교병원', 20, 0xf4f4f0, (x, z) => {
    const c = plate('✚ 경북대학교병원', 14, 2.4, { bg: '#ffffff', color: '#c0392b', size: 0.5 });
    c.position.set(x, 21, z); c.rotation.x = -Math.PI / 2; scene.add(c);
    label('경북대학교병원', x, 28, z, 13, { bg: 'rgba(192,57,43,.95)', color: '#fff', size: 0.46 });
  });

  // 점만 있는 큰 건물
  function tower(name, w, d, h, wall, signText, signBg) {
    const p = place[name];
    if (!p) return;
    const nr = out.nearestRoad(p.x, p.z);
    const ang = Math.atan2(nr.tx, nr.tz);
    const b = facadeBox(w, h, d, Math.round(w / 2), Math.round(h / 3), wall, '#7fa8cc');
    b.position.set(p.x, h / 2, p.z);
    b.rotation.y = ang;
    scene.add(b);
    reserved.push({ x: p.x, z: p.z, r: Math.max(w, d) / 2 + 2 });
    if (signText) {
      const s = plate(signText, w * 0.8, 2, { bg: signBg, color: '#fff', size: 0.5 });
      s.position.set(p.x, h + 1.5, p.z);
      s.rotation.y = ang + Math.PI / 2;
      scene.add(s);
    }
    pick(b, { kind: 'place', name });
    label(name, p.x, h + 7, p.z, 12, { bg: signBg ? `${signBg}f0` : 'rgba(60,60,70,.9)', color: '#fff', size: 0.46 });
  }
  tower('대구백화점', 20, 16, 28, '#e9e4dc', '대구백화점', '#1f6f5c');
  tower('현대백화점 대구점', 22, 18, 30, '#e3e3e3', 'THE HYUNDAI', '#2f3b4f');
  tower('CGV 대구한일', 12, 12, 22, '#dcd6f0', 'CGV', '#e5534b');
  // 대구역 (북쪽 끝)
  const st = place['대구역'];
  if (st) {
    const b = facadeBox(46, 12, 16, 20, 3, '#eef2f4', '#6f9fc8', 6);
    b.position.set(st.x, 6, st.z - 4);
    scene.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(48, 0.8, 18), toon(0x2c5aa0)); roof.position.set(st.x, 12.4, st.z - 4); scene.add(roof);
    reserved.push({ x0: st.x - 26, x1: st.x + 26, z0: st.z - 14, z1: st.z + 6 });
    pick(b, { kind: 'place', name: '대구역' });
    label('대구역', st.x, 20, st.z - 4, 12, { bg: 'rgba(44,90,160,.95)', color: '#fff', size: 0.5 });
  }

  // 시장: 지붕 덮인 상가동 + 천막 노점 (도로 피해서 칸마다 배치)
  function market(name, radius, opts = {}) {
    const p = place[name];
    if (!p) return;
    const roofCols = [0x2c6fb7, 0x3fbfb0, 0xe5534b, 0xf29b38, 0x5fb86b, 0xf2d24b];
    const cells = [];
    for (let x = -radius; x <= radius; x += 7) for (let z = -radius * 0.7; z <= radius * 0.7; z += 7) {
      const wx = p.x + x; const wz = p.z + z;
      if (out.nearestRoad(wx, wz).clear < 4.5 || isReserved(wx, wz)) continue;
      cells.push([wx, wz]);
    }
    const g = new THREE.Group();
    cells.forEach(([x, z], i) => {
      const big = opts.halls && i % 3 !== 2;
      if (big) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.5, 6.4), toon(0xf1e4cf)); b.position.set(x, 2.25, z); g.add(b);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 6.4, 12, 1, false, 0, Math.PI), toon(roofCols[i % 2])); r.rotation.z = Math.PI / 2; r.position.set(x, 4.5, z); g.add(r);
      } else {
        const b = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.2, 4.4), toon(0xf6ead2)); b.position.set(x, 1.1, z); g.add(b);
        const r = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), toon(roofCols[(i * 7) % roofCols.length])); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.8); r.position.set(x, 3, z); g.add(r);
      }
    });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bakeGroup(g);
    scene.add(g);
    pick(g, { kind: 'place', name });
    reserved.push({ x: p.x, z: p.z, r: radius + 2 });
    out.crowdAreas.push({ name, x0: p.x - radius, x1: p.x + radius, z0: p.z - radius * 0.7, z1: p.z + radius * 0.7, cells });
    label(name, p.x, 12, p.z, 12, { bg: 'rgba(229,83,75,.95)', color: '#fff', size: 0.5 });
  }
  market('서문시장', 26, { halls: true });
  market('교동시장', 12);
  market('방천시장', 10);

  // 길가에 늘어선 가게 줄 (가장 가까운 길과 나란히)
  function streetRow(name, n, builder, labelOpts) {
    const p = place[name];
    if (!p) return;
    const nr = out.nearestRoad(p.x, p.z);
    const tx = nr.tx; const tz = nr.tz;
    const nx = -tz; const nz = tx;
    const side = ((p.x - nr.cx) * nx + (p.z - nr.cz) * nz) >= 0 ? 1 : -1;
    const off = nr.seg.w / 2 + 4;
    for (let i = 0; i < n; i++) {
      const k = (i - (n - 1) / 2) * 6.5;
      const x = nr.cx + tx * k + nx * side * off;
      const z = nr.cz + tz * k + nz * side * off;
      const o = builder(i);
      o.position.set(x, 0, z);
      o.rotation.y = Math.atan2(-nx * side, -nz * side);
      scene.add(o);
      reserved.push({ x, z, r: 4 });
    }
    label(...labelOpts(p));
  }
  streetRow('약령시', 7, () => hanok(5, 4, 2.6, 0xf1e1c0, 0x5a4a3a), (p) => ['약령시 한방거리', p.x, 11, p.z, 13, { bg: 'rgba(139,90,43,.95)', color: '#fff', size: 0.46 }]);
  streetRow('김광석다시그리기길', 6, (i) => {
    const g = new THREE.Group();
    const cols = [0xf06fa4, 0x4c9bd6, 0xf2d24b, 0x5fb86b, 0x9b6fd1, 0xf29b38];
    const w = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 0.6), toon(cols[i % cols.length])); w.position.y = 1.7; g.add(w);
    if (i === 2) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.4, 10), toon(0x8b5a2b)); s.position.set(0, 1.2, 2); g.add(s); const gt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.2), toon(0xc98b5a)); gt.position.set(0.6, 1.4, 2.4); gt.rotation.z = 0.6; g.add(gt); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }, (p) => ['김광석다시그리기길', p.x, 9, p.z, 14, { bg: 'rgba(155,111,209,.95)', color: '#fff', size: 0.44 }]);

  out.reserved = reserved;
  out.segs = segs;
  return out;
}

/* ---------------- 채움 건물 (인스턴스) ---------------- */
export function fillCity(scene, MAP, world, { lite = false } = {}) {
  const [BX0, BX1, BZ0, BZ1] = MAP.bbox;
  const step = lite ? 8.5 : 6.6;
  const spots = { low: [], high: [] };
  const dongseong = MAP.minors.filter((m) => m.name === '동성로');
  for (let x = BX0; x < BX1; x += step) for (let z = BZ0; z < BZ1; z += step) {
    const px = x + rand(-0.8, 0.8);
    const pz = z + rand(-0.8, 0.8);
    const inJung = pointInRing([px, pz], MAP.jung);
    if (!inJung && Math.random() < 0.45) continue;
    if (Math.random() < 0.12) continue; // 주차장·골목 빈터
    const size = rand(4.2, 5.6);
    const nr = world.nearestRoad(px, pz);
    const need = nr.seg.major ? 3 + size / 2 : 1.4 + size / 2;
    if (nr.clear < need) continue;
    if (world.riverDist(px, pz) < MAP.river.w / 2 + 14) continue;
    if (world.isReserved(px, pz, size / 2 + 1)) continue;
    const nearMajor = world.nearestRoad(px, pz, true).clear;
    let near동성로 = false;
    dongseong.forEach((m) => m.pts.forEach((p) => { if (Math.hypot(p[0] - px, p[1] - pz) < 16) near동성로 = true; }));
    let h;
    if (nearMajor < 13) h = rand(9, 24);
    else if (Math.random() < 0.06) h = rand(22, 38); // 아파트
    else h = rand(3.2, 8.5);
    if (near동성로) h = rand(6, 14);
    const ang = Math.atan2(nr.tx, nr.tz);
    (h > 12 ? spots.high : spots.low).push({ x: px, z: pz, w: size, d: size * rand(0.8, 1.15), h, ang, shop: near동성로 });
  }
  const palette = [0xf3efe6, 0xe9e2d6, 0xdcd6cc, 0xf2e3cf, 0xe2e8ec, 0xf6e7e1, 0xd9e6d3, 0xece0f0, 0xfdf3d9, 0xc9d3dc];
  const shopPal = [0xf8c3c3, 0xc3e0f8, 0xfbe3a6, 0xcdeccd, 0xe2d4f4, 0xffd8b5, 0xffb3c7];
  const make = (list, cols, rows) => {
    if (!list.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const f = facadeMat(cols, rows, '#ffffff', '#93b4cf');
    const top = toon(0xffffff);
    const im = new THREE.InstancedMesh(geo, [f, f, top, top, f, f], list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ang);
      m.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.setHex((b.shop ? shopPal : palette)[Math.floor(Math.random() * (b.shop ? shopPal : palette).length)]));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  };
  make(spots.low, 2, 2);
  make(spots.high, 3, 7);
  return spots.low.length + spots.high.length;
}
