// 도로 교통(승용차·택시·시내버스·배달 오토바이, 교차로 신호등)과 도시철도 3호선 모노레일.
// 우측통행: 남쪽(+z)으로 가는 차는 도로 서쪽, 동쪽(+x)으로 가는 차는 도로 남쪽 차선.
import * as THREE from 'three';
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
// 기둥에서 local +x 방향으로 팔이 뻗고, 신호등 불빛은 local +z 쪽을 본다
function trafficLight(scene, x, z, rotY, axis, armLen) {
  const g = new THREE.Group();
  const grey = toon(0x6b6f76);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 6, 8), grey);
  pole.position.y = 3;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.15, 0.15), grey);
  arm.position.set(armLen / 2, 5.8, 0);
  g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.6), toon(0x2a2a2e));
  head.position.set(armLen - 1, 5.6, 0);
  g.add(head);
  [[0xff3b30, -0.7], [0xffb000, 0], [0x3dff7a, 0.7]].forEach(([c, dx]) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lampMat(axis, c));
    l.position.set(armLen - 1 + dx, 5.6, 0.32);
    g.add(l);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
}

/* ---------- 도로 교통 ---------- */
// roads: [{x,z0,z1,w} 남북 | {z,x0,x1,w} 동서]
export class Traffic {
  constructor(scene, roads, { density = 1 } = {}) {
    this.scene = scene;
    this.roads = roads.map((r) => ({ ...r, axis: r.x != null ? 'ns' : 'ew', lanes: [r.w * 0.14, r.w * 0.36] }));
    this.time = 0;
    this.cycle = 34;
    // 교차로
    this.junctions = [];
    this.roads.filter((a) => a.axis === 'ns').forEach((a) => this.roads.filter((b) => b.axis === 'ew').forEach((b) => {
      if (a.x > b.x0 && a.x < b.x1 && b.z > a.z0 && b.z < a.z1) this.junctions.push({ x: a.x, z: b.z, ns: a, ew: b, offset: rand(0, 8) });
    }));
    this.junctions.forEach((j) => this.buildJunction(j));
    this.vehicles = [];
    this.roads.forEach((r, ri) => {
      const length = r.axis === 'ns' ? r.z1 - r.z0 : r.x1 - r.x0;
      [1, -1].forEach((dir) => [0, 1].forEach((lane) => {
        const n = Math.round((length / 34) * density);
        for (let k = 0; k < n; k++) {
          const roll = Math.random();
          const kind = lane === 1 && roll < 0.12 ? 'bus' : roll < 0.3 ? 'taxi' : roll < 0.4 ? 'scooter' : 'car';
          this.spawn(ri, dir, lane, kind, (k + rand(0.1, 0.6)) / n);
        }
      }));
    });
    this.busStops = [];
  }

  addBusStop(roadIndex, dir, s) { this.busStops.push({ road: roadIndex, dir, s }); }

  spawn(ri, dir, lane, kind, frac) {
    const r = this.roads[ri];
    const { group, len } = makeVehicle(kind);
    const a = r.axis === 'ns' ? r.z0 : r.x0;
    const b = r.axis === 'ns' ? r.z1 : r.x1;
    const v = {
      road: ri, dir, lane, kind, len, group,
      s: a + (b - a) * frac,
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
    const r = this.roads[v.road];
    const off = r.lanes[v.lane];
    if (r.axis === 'ns') {
      v.group.position.set(r.x + (v.dir > 0 ? -off : off), 0, v.s);
      v.group.rotation.y = v.dir > 0 ? 0 : Math.PI;
    } else {
      v.group.position.set(v.s, 0, r.z + (v.dir > 0 ? off : -off));
      v.group.rotation.y = v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  buildJunction(j) {
    const hx = j.ns.w / 2;
    const hz = j.ew.w / 2;
    // 횡단보도
    const stripe = toon(0xf5f0dc);
    const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripe); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); this.scene.add(m); };
    [-1, 1].forEach((s) => {
      for (let x = -hx + 0.6; x < hx; x += 1.4) add(0.7, 3, j.x + x, j.z + s * (hz + 2));
      for (let z = -hz + 0.6; z < hz; z += 1.4) add(3, 0.7, j.x + s * (hx + 2), j.z + z);
    });
    // 신호등 4개 (각 진입 방향 앞 오른쪽 모퉁이)
    trafficLight(this.scene, j.x + hx + 1.5, j.z - hz - 3, Math.PI, 'ns', hx + 2); // 남행 차량용
    trafficLight(this.scene, j.x - hx - 1.5, j.z + hz + 3, 0, 'ns', hx + 2); // 북행
    trafficLight(this.scene, j.x - hx - 3, j.z - hz - 1.5, -Math.PI / 2, 'ew', hz + 2); // 동행
    trafficLight(this.scene, j.x + hx + 3, j.z + hz + 1.5, Math.PI / 2, 'ew', hz + 2); // 서행
  }

  // 신호: 남북 초록 14초 → 노랑 3초 → 동서 초록 14초 → 노랑 3초 (모든 교차로 같은 주기, 약간씩 어긋남)
  signal(j, axis) {
    const t = (this.time + j.offset) % this.cycle;
    const ns = t < 14 ? 'green' : t < 17 ? 'yellow' : 'red';
    const ew = t < 17 ? 'red' : t < 31 ? 'green' : 'yellow';
    return axis === 'ns' ? ns : ew;
  }

  update(dt) {
    this.time += dt;
    // 신호등 불빛 (기준 교차로의 상태로 표시)
    const j0 = this.junctions[0];
    if (j0) {
      ['ns', 'ew'].forEach((axis) => {
        const st = this.signal(j0, axis);
        lampMat(axis, 0xff3b30).emissiveIntensity = st === 'red' ? 2 : 0.05;
        lampMat(axis, 0xffb000).emissiveIntensity = st === 'yellow' ? 2 : 0.05;
        lampMat(axis, 0x3dff7a).emissiveIntensity = st === 'green' ? 2 : 0.05;
      });
    }
    // 같은 차선끼리 앞뒤 정렬
    const lanes = new Map();
    this.vehicles.forEach((v) => {
      const k = `${v.road}:${v.dir}:${v.lane}`;
      if (!lanes.has(k)) lanes.set(k, []);
      lanes.get(k).push(v);
    });
    lanes.forEach((list) => {
      list.sort((a, b) => (b.s - a.s) * a.dir);
      list.forEach((v, i) => {
        const r = this.roads[v.road];
        const front = v.s + (v.dir * v.len) / 2;
        let limit = Infinity;
        // 앞차
        const lead = list[i - 1];
        if (lead) {
          const gap = (lead.s - (lead.dir * lead.len) / 2 - front) * v.dir;
          if (gap > -2) limit = Math.min(limit, gap - 2.5);
        }
        // 신호
        this.junctions.forEach((j) => {
          if ((r.axis === 'ns' ? j.ns : j.ew) !== r) return;
          const c = r.axis === 'ns' ? j.z : j.x;
          const half = (r.axis === 'ns' ? j.ew.w : j.ns.w) / 2 + 3.6;
          const stopAt = c - v.dir * half;
          const d = (stopAt - front) * v.dir;
          if (d < -0.5 || d > 60) return;
          const st = this.signal(j, r.axis);
          if (st === 'red' || (st === 'yellow' && d > (v.v * v.v) / 12)) limit = Math.min(limit, d);
        });
        // 버스정류장
        if (v.kind === 'bus') {
          if (v.dwell > 0) { v.dwell -= dt; limit = 0; } else {
            this.busStops.forEach((b) => {
              if (b.road !== v.road || b.dir !== v.dir) return;
              const d = (b.s - v.s) * v.dir;
              if (d > -0.3 && d < 40 && this.time - v.lastStop > 20) {
                limit = Math.min(limit, d);
                if (d < 0.4 && v.v < 0.6) { v.dwell = 5; v.lastStop = this.time; }
              }
            });
          }
        }
        const target = Number.isFinite(limit) ? Math.min(v.vmax, Math.sqrt(2 * 7 * Math.max(0, limit))) : v.vmax;
        const dv = target - v.v;
        v.v = Math.max(0, v.v + THREE.MathUtils.clamp(dv, -14 * dt, 4 * dt));
        v.s += v.v * v.dir * dt;
        // 도로 끝에 닿으면 반대쪽 끝에서 다시 등장 (입구가 비어 있을 때만)
        const a = r.axis === 'ns' ? r.z0 : r.x0;
        const b = r.axis === 'ns' ? r.z1 : r.x1;
        const end = v.dir > 0 ? b : a;
        const start = v.dir > 0 ? a : b;
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
  // loop: true면 닫힌 순환선 (열차가 한 방향으로 계속 돈다), trains: 열차 수
  constructor(scene, points, { height = 12, skip = () => false, label, loop = false, trains = 1 } = {}) {
    this.scene = scene;
    this.h = height;
    this.loop = loop;
    this.curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, height, z)), loop, 'catmullrom', 0.2);
    this.length = this.curve.getLength();
    const beamMat = toon(0xd8d4cc);
    // 궤도 빔
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 480, 0.9, 6, loop), beamMat);
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
    this.stations.sort((a, b) => a.s - b.s);
    // 열차 (3량 편성)
    const makeCar = () => {
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
    };
    const n = this.loop ? Math.max(1, trains) : 1;
    this.trains = Array.from({ length: n }, (_, k) => {
      const si = Math.floor((k * this.stations.length) / n);
      return { cars: [makeCar(), makeCar(), makeCar()], s: this.stations[si] ? this.stations[si].s : 0, v: 0, dwell: 2 + k, next: (si + 1) % Math.max(1, this.stations.length), dir: 1 };
    });
  }

  wrap(s) { return ((s % this.length) + this.length) % this.length; }

  update(dt) {
    this.trains.forEach((tr) => {
      if (tr.dwell > 0) tr.dwell -= dt; else {
        const st = this.stations[tr.next];
        let d;
        if (this.loop) d = st ? this.wrap(st.s - tr.s) : Infinity;
        else d = ((st ? st.s : tr.dir > 0 ? this.length - 6 : 6) - tr.s) * tr.dir;
        // 앞 열차와 간격 유지 (순환선)
        if (this.loop && this.trains.length > 1) {
          this.trains.forEach((o) => { if (o !== tr) { const gap = this.wrap(o.s - tr.s); if (gap > 0) d = Math.min(d, gap - 30); } });
        }
        const vt = Math.min(14, Math.sqrt(2 * 2.5 * Math.max(0, d)));
        tr.v += THREE.MathUtils.clamp(vt - tr.v, -5 * dt, 2.5 * dt);
        tr.s += tr.v * tr.dir * dt;
        if (this.loop) tr.s = this.wrap(tr.s);
        const atStation = st && (this.loop ? this.wrap(st.s - tr.s) < 0.4 || this.wrap(tr.s - st.s) < 0.4 : Math.abs(st.s - tr.s) < 0.3);
        if (atStation && tr.v < 0.5) {
          tr.v = 0;
          tr.dwell = 5;
          if (this.loop) tr.next = (tr.next + 1) % this.stations.length;
          else {
            tr.next += tr.dir;
            if (tr.next < 0 || tr.next >= this.stations.length) {
              tr.dir *= -1;
              tr.next = THREE.MathUtils.clamp(tr.next + tr.dir * 2, 0, this.stations.length - 1);
            }
          }
        } else if (!this.loop && !st && d < 0.3 && tr.v < 0.5) { tr.dir *= -1; tr.next = THREE.MathUtils.clamp(tr.next + tr.dir, 0, this.stations.length - 1); }
      }
      tr.cars.forEach((g, i) => {
        let s = tr.s - tr.dir * i * 6.4;
        s = this.loop ? this.wrap(s) : THREE.MathUtils.clamp(s, 1, this.length - 1);
        const u = s / this.length;
        const p = this.curve.getPointAt(u);
        const t = this.curve.getTangentAt(u);
        g.position.set(p.x, p.y - 0.3, p.z);
        g.rotation.y = Math.atan2(t.x, t.z);
      });
    });
  }
}
