// 도로 교통(승용차·택시·시내버스·배달 오토바이, 교차로 신호등)과 도시철도 3호선 모노레일.
// 우측통행: 남쪽(+z)으로 가는 차는 도로 서쪽, 동쪽(+x)으로 가는 차는 도로 남쪽 차선.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, bakeGroup } from './villagers.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- 차량 모델 ---------- */
function box(g, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function wheel(g, x, z, r = 0.38) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 10), toon(0x1f1f22));
  m.rotation.z = Math.PI / 2;
  m.position.set(x, r, z);
  g.add(m);
}
const CAR_COLORS = [0xffffff, 0xf2f2f2, 0x1f1f22, 0x9aa0a8, 0x5b6370, 0x2c5aa0, 0xc0392b, 0xe8e2d6, 0x3b4a5a];
// 모든 차량은 +z 방향이 앞
export function makeVehicle(kind) {
  const g = new THREE.Group();
  let len;
  if (kind === 'bus') {
    len = 11;
    const body = pick([0x2e9b5c, 0x2c6fb7, 0xd9383a]);
    box(g, 2.5, 2.4, len, body, 0, 1.75, 0);
    box(g, 2.56, 0.9, len - 1.6, 0x23313f, 0, 2.15, -0.2);
    box(g, 2.3, 0.9, 0.1, 0x23313f, 0, 2.2, len / 2 + 0.01);
    box(g, 2.56, 0.18, len, 0xffffff, 0, 1.25, 0);
    box(g, 2.3, 0.25, len - 1, 0xe8e8e8, 0, 3.05, 0);
    [-1, 1].forEach((s) => { wheel(g, s * 1.2, len / 2 - 2, 0.55); wheel(g, s * 1.2, -len / 2 + 2, 0.55); });
    [-0.8, 0.8].forEach((x) => box(g, 0.4, 0.25, 0.08, 0xfff2b0, x, 0.95, len / 2 + 0.02));
  } else if (kind === 'scooter') {
    len = 1.9;
    box(g, 0.5, 0.5, 1.5, pick([0xe5534b, 0xffffff, 0x4c9bd6]), 0, 0.65, 0);
    box(g, 0.75, 0.6, 0.65, pick([0xe5534b, 0xf29b38, 0x2c5aa0]), 0, 1.25, -0.55); // 배달통
    box(g, 0.5, 0.75, 0.45, 0x2f3b4f, 0, 1.3, 0.05); // 운전자 몸
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(pick([0xffffff, 0xf2d24b, 0x1f1f22])));
    helmet.position.set(0, 1.9, 0.1);
    g.add(helmet);
    wheel(g, 0, 0.65, 0.3);
    wheel(g, 0, -0.65, 0.3);
  } else {
    len = 4.4;
    const taxi = kind === 'taxi';
    const body = taxi ? 0xf2a83a : pick(CAR_COLORS);
    box(g, 2, 0.75, len, body, 0, 0.7, 0);
    box(g, 1.8, 0.68, len * 0.52, 0x2a3442, 0, 1.38, -0.25);
    box(g, 1.84, 0.12, len * 0.5, body, 0, 1.76, -0.25);
    [-0.65, 0.65].forEach((x) => { box(g, 0.35, 0.2, 0.06, 0xfff2b0, x, 0.8, len / 2 + 0.01); box(g, 0.35, 0.2, 0.06, 0xe5534b, x, 0.8, -len / 2 - 0.01); });
    if (taxi) box(g, 0.8, 0.32, 0.4, 0xffffff, 0, 1.98, -0.25);
    [-1, 1].forEach((s) => { wheel(g, s * 0.95, 1.3); wheel(g, s * 0.95, -1.3); });
  }
  bakeGroup(g);
  return { group: g, len };
}

/* ---------- 신호등 ---------- */
const lampMats = {};
function lampMat(axis, color) {
  const key = `${axis}-${color}`;
  if (!lampMats[key]) lampMats[key] = new THREE.MeshToonMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0.05 });
  return lampMats[key];
}
// 신호등: 기둥에서 팔이 뻗고(armDir: 1이면 local +x, -1이면 -x), 불빛은 local +z 쪽을 본다
function trafficLight(scene, x, z, rotY, axis, armLen, armDir = 1) {
  const g = new THREE.Group();
  const grey = toon(0x6b6f76);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 6, 8), grey);
  pole.position.y = 3;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.15, 0.15), grey);
  arm.position.set((armDir * armLen) / 2, 5.8, 0);
  g.add(arm);
  const hx = armDir * (armLen - 1);
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.6), toon(0x2a2a2e));
  head.position.set(hx, 5.6, 0);
  g.add(head);
  [[0xff3b30, -0.7], [0xffb000, 0], [0x3dff7a, 0.7]].forEach(([c, dx]) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lampMat(axis, c));
    l.position.set(hx + dx * armDir, 5.6, 0.32);
    g.add(l);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
}

/* ---------- 폴리라인 도로 ---------- */
export class RoadLine {
  constructor(pts, w, name) {
    this.name = name;
    this.w = w;
    this.p = pts.map(([x, z]) => new THREE.Vector2(x, z));
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.lanes = [w * 0.15, w * 0.36];
  }
  seg(s) {
    const c = this.cum;
    s = THREE.MathUtils.clamp(s, 0, this.length);
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    return i;
  }
  at(s) {
    const i = this.seg(s);
    const a = this.p[i - 1];
    const b = this.p[i];
    const t = (THREE.MathUtils.clamp(s, 0, this.length) - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
    return new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  tangent(s) {
    const i = this.seg(s);
    return new THREE.Vector2().subVectors(this.p[i], this.p[i - 1]).normalize();
  }
  // 진행 방향 기준 오른쪽으로 off만큼 떨어진 점 (x=동, y=남)
  offsetAt(s, dir, off) {
    const p = this.at(s);
    const t = this.tangent(s).multiplyScalar(dir);
    return new THREE.Vector2(p.x - t.y * off, p.y + t.x * off);
  }
}

function segIntersect(a, b, c, d) {
  const r = new THREE.Vector2().subVectors(b, a);
  const q = new THREE.Vector2().subVectors(d, c);
  const den = r.x * q.y - r.y * q.x;
  if (Math.abs(den) < 1e-9) return null;
  const ac = new THREE.Vector2().subVectors(c, a);
  const t = (ac.x * q.y - ac.y * q.x) / den;
  const u = (ac.x * r.y - ac.y * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/* ---------- 도로 교통 ---------- */
export class Traffic {
  // roads: RoadLine[]
  constructor(scene, roads, { density = 1 } = {}) {
    this.scene = scene;
    this.roads = roads;
    this.time = 0;
    this.cycle = 34;
    this.junctions = [];
    for (let i = 0; i < roads.length; i++) for (let k = i + 1; k < roads.length; k++) {
      const A = roads[i];
      const B = roads[k];
      for (let a = 1; a < A.p.length; a++) for (let b = 1; b < B.p.length; b++) {
        const h = segIntersect(A.p[a - 1], A.p[a], B.p[b - 1], B.p[b]);
        if (!h) continue;
        const sA = A.cum[a - 1] + h.t * (A.cum[a] - A.cum[a - 1]);
        const sB = B.cum[b - 1] + h.u * (B.cum[b] - B.cum[b - 1]);
        const pt = A.at(sA);
        if (this.junctions.some((j) => j.pt.distanceTo(pt) < 8)) continue;
        this.junctions.push({ pt, legs: [{ road: A, s: sA, phase: 0, cross: B.w }, { road: B, s: sB, phase: 1, cross: A.w }], offset: Math.random() * 8 });
      }
    }
    this.junctions.forEach((j) => this.buildJunction(j));
    this.vehicles = [];
    this.busStops = [];
    roads.forEach((r) => {
      [1, -1].forEach((dir) => [0, 1].forEach((lane) => {
        const n = Math.max(1, Math.round((r.length / 34) * density));
        for (let k = 0; k < n; k++) {
          const roll = Math.random();
          const kind = lane === 1 && roll < 0.13 ? 'bus' : roll < 0.3 ? 'taxi' : roll < 0.42 ? 'scooter' : 'car';
          this.spawn(r, dir, lane, kind, (k + 0.2 + Math.random() * 0.5) / n);
        }
      }));
    });
  }

  addBusStop(road, dir, s) { this.busStops.push({ road, dir, s }); }

  spawn(road, dir, lane, kind, frac) {
    const { group, len } = makeVehicle(kind);
    const v = {
      road, dir, lane, kind, len, group,
      s: road.length * frac,
      v: 0,
      vmax: kind === 'bus' ? rand(7, 8.5) : kind === 'scooter' ? rand(11, 14) : rand(9, 12.5),
      dwell: 0,
      lastStop: -1e9,
    };
    this.scene.add(group);
    this.vehicles.push(v);
    this.place(v);
  }

  place(v) {
    const p = v.road.offsetAt(v.s, v.dir, v.road.lanes[v.lane]);
    const t = v.road.tangent(v.s).multiplyScalar(v.dir);
    v.group.position.set(p.x, 0.02, p.y);
    v.group.rotation.y = Math.atan2(t.x, t.y);
  }

  buildJunction(j) {
    const stripeGeo = [];
    j.legs.forEach((leg) => {
      const r = leg.road;
      const t = r.tangent(leg.s);
      const half = leg.cross / 2 + 1.8;
      [-1, 1].forEach((side) => {
        // 횡단보도: 도로를 가로지르는 흰 줄
        const c = r.at(leg.s + side * half);
        const n = new THREE.Vector2(-t.y, t.x);
        for (let k = -r.w / 2 + 0.6; k < r.w / 2; k += 1.4) {
          const g = new THREE.PlaneGeometry(0.7, 3);
          g.rotateX(-Math.PI / 2);
          g.rotateY(Math.atan2(t.x, t.y));
          g.translate(c.x + n.x * k, 0.08, c.y + n.y * k);
          stripeGeo.push(g);
        }
        // 신호등: 정지선 앞 오른쪽 길가
        const dir = -side; // side=-1 쪽에서 들어오는 차는 +방향
        const h = t.clone().multiplyScalar(dir);
        const pole = r.offsetAt(leg.s + side * (half + 2.2), dir, r.w / 2 + 1.4);
        trafficLight(this.scene, pole.x, pole.y, Math.atan2(-h.x, -h.y), leg.phase === 0 ? 'ns' : 'ew', r.w / 2 + 1.5, -1);
      });
    });
    if (stripeGeo.length) {
      const merged = mergeGeometries(stripeGeo);
      this.scene.add(new THREE.Mesh(merged, toon(0xf5f0dc)));
    }
  }

  // 신호: phase0 초록 14초 → 노랑 3초 → phase1 초록 14초 → 노랑 3초
  signal(j, phase) {
    const t = (this.time + j.offset) % this.cycle;
    const a = t < 14 ? 'green' : t < 17 ? 'yellow' : 'red';
    const b = t < 17 ? 'red' : t < 31 ? 'green' : 'yellow';
    return phase === 0 ? a : b;
  }

  update(dt) {
    this.time += dt;
    const j0 = this.junctions[0];
    if (j0) {
      [['ns', 0], ['ew', 1]].forEach(([axis, ph]) => {
        const st = this.signal({ offset: 0 }, ph);
        lampMat(axis, 0xff3b30).emissiveIntensity = st === 'red' ? 2 : 0.05;
        lampMat(axis, 0xffb000).emissiveIntensity = st === 'yellow' ? 2 : 0.05;
        lampMat(axis, 0x3dff7a).emissiveIntensity = st === 'green' ? 2 : 0.05;
      });
    }
    const lanes = new Map();
    this.vehicles.forEach((v) => {
      const k = `${v.road.name}:${v.road.cum.length}:${v.dir}:${v.lane}`;
      if (!lanes.has(k)) lanes.set(k, []);
      lanes.get(k).push(v);
    });
    lanes.forEach((list) => {
      list.sort((a, b) => (b.s - a.s) * a.dir);
      list.forEach((v, i) => {
        const r = v.road;
        const front = v.s + (v.dir * v.len) / 2;
        let limit = Infinity;
        const lead = list[i - 1];
        if (lead) {
          const gap = (lead.s - (lead.dir * lead.len) / 2 - front) * v.dir;
          if (gap > -2) limit = Math.min(limit, gap - 2.5);
        }
        this.junctions.forEach((j) => {
          j.legs.forEach((leg) => {
            if (leg.road !== r) return;
            const stopAt = leg.s - v.dir * (leg.cross / 2 + 3.6);
            const d = (stopAt - front) * v.dir;
            if (d < -0.5 || d > 60) return;
            const st = this.signal(j, leg.phase);
            if (st === 'red' || (st === 'yellow' && d > (v.v * v.v) / 12)) limit = Math.min(limit, d);
          });
        });
        if (v.kind === 'bus') {
          if (v.dwell > 0) { v.dwell -= dt; limit = 0; } else {
            this.busStops.forEach((b) => {
              if (b.road !== r || b.dir !== v.dir) return;
              const d = (b.s - v.s) * v.dir;
              if (d > -0.3 && d < 40 && this.time - v.lastStop > 20) {
                limit = Math.min(limit, d);
                if (d < 0.4 && v.v < 0.6) { v.dwell = 5; v.lastStop = this.time; }
              }
            });
          }
        }
        const target = Number.isFinite(limit) ? Math.min(v.vmax, Math.sqrt(2 * 7 * Math.max(0, limit))) : v.vmax;
        v.v = Math.max(0, v.v + THREE.MathUtils.clamp(target - v.v, -14 * dt, 4 * dt));
        v.s += v.v * v.dir * dt;
        const end = v.dir > 0 ? r.length : 0;
        const start = v.dir > 0 ? 0 : r.length;
        if ((v.s - end) * v.dir > 0) {
          const blocked = list.some((o) => o !== v && Math.abs(o.s - start) < 10);
          if (!blocked) { v.s = start; v.v = v.vmax * 0.6; } else { v.s = end; v.v = 0; }
        }
        this.place(v);
      });
    });
  }
}

/* ---------- 도시철도 3호선 (고가 모노레일) ---------- */
export class Monorail {
  // points: [[x,z,stationName?], ...]
  constructor(scene, points, { height = 12, skip = () => false, label } = {}) {
    this.scene = scene;
    this.h = height;
    this.curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, height, z)), false, 'catmullrom', 0.2);
    this.length = this.curve.getLength();
    const beamMat = toon(0xd8d4cc);
    // 궤도 빔
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 240, 0.9, 6, false), beamMat);
    tube.scale.set(1, 1, 1);
    tube.castShadow = true;
    scene.add(tube);
    // 기둥
    const pillarGeo = new THREE.CylinderGeometry(0.7, 0.9, height, 8);
    for (let d = 0; d < this.length; d += 13) {
      const p = this.curve.getPointAt(d / this.length);
      if (skip(p.x, p.z)) continue;
      const m = new THREE.Mesh(pillarGeo, beamMat);
      m.position.set(p.x, height / 2 - 0.5, p.z);
      m.castShadow = true;
      scene.add(m);
    }
    // 역
    this.stations = [];
    const samples = 800;
    points.forEach(([x, z, name]) => {
      if (!name) return;
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i <= samples; i++) {
        const p = this.curve.getPointAt(i / samples);
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dd < bd) { bd = dd; best = i / samples; }
      }
      const s = best * this.length;
      this.stations.push({ name, s });
      const p = this.curve.getPointAt(best);
      const t = this.curve.getTangentAt(best);
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = Math.atan2(t.x, t.z);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 18), toon(0xbfb8aa));
      deck.position.y = -1.2;
      g.add(deck);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 18.6), toon(0xffb000));
      roof.position.y = 3.6;
      g.add(roof);
      [-3.4, 3.4].forEach((sx) => [-8, 0, 8].forEach((sz) => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.8, 6), toon(0xffffff));
        c.position.set(sx, 1.2, sz);
        g.add(c);
      }));
      const stair = new THREE.Mesh(new THREE.BoxGeometry(3, height, 3), toon(0xe8e2d6));
      stair.position.set(5.5, -height / 2, 6);
      g.add(stair);
      bakeGroup(g);
      scene.add(g);
      if (label) label(`3호선 ${name}역`, p.x, height + 8, p.z);
    });
    // 열차 3량
    this.cars = [0, 1, 2].map(() => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 4.4, 4, 10), toon(0xffffff));
      b.rotation.x = Math.PI / 2;
      b.scale.set(1, 1, 0.95);
      b.position.y = 1.6;
      g.add(b);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.4, 5.6), toon(0xffb000));
      stripe.position.y = 1.0;
      g.add(stripe);
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.7, 4.8), toon(0x2a3442));
      win.position.y = 2.1;
      g.add(win);
      bakeGroup(g);
      scene.add(g);
      return g;
    });
    this.s = this.stations[0] ? this.stations[0].s : 0;
    this.dir = 1;
    this.v = 0;
    this.dwell = 3;
    this.nextIndex = 1;
  }

  update(dt) {
    if (this.dwell > 0) { this.dwell -= dt; } else {
      const st = this.stations[this.nextIndex];
      const targetS = st ? st.s : this.dir > 0 ? this.length - 6 : 6;
      const d = (targetS - this.s) * this.dir;
      const vt = Math.min(14, Math.sqrt(2 * 2.5 * Math.max(0, d)));
      this.v += THREE.MathUtils.clamp(vt - this.v, -5 * dt, 2.5 * dt);
      this.s += this.v * this.dir * dt;
      if (d < 0.3 && this.v < 0.5) {
        this.v = 0;
        this.dwell = st ? 5 : 2;
        this.nextIndex += this.dir;
        if (this.nextIndex < 0 || this.nextIndex >= this.stations.length) {
          this.dir *= -1;
          this.nextIndex = THREE.MathUtils.clamp(this.nextIndex + this.dir * 2, 0, this.stations.length - 1);
        }
      }
    }
    this.cars.forEach((g, i) => {
      const s = THREE.MathUtils.clamp(this.s - this.dir * i * 6.4, 1, this.length - 1);
      const u = s / this.length;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      g.position.set(p.x, p.y - 0.3, p.z);
      g.rotation.y = Math.atan2(t.x, t.z);
    });
  }
}
