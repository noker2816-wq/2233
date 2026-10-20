// 마을 주민: 동물 머리 2등신 캐릭터, 광장·건물 문 앞·앞마당을 오가며 걷는다.
import * as THREE from 'three';

let gradient;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map();
export function toon(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() }));
  return matCache.get(color);
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// 종족별 털색·귀 모양. (닌텐도 캐릭터가 아니라 기본 도형으로 만든 동물 머리)
export const SPECIES = ['cat', 'bear', 'rabbit', 'dog', 'cat', 'bear', 'rabbit', 'dog', 'sheep', 'frog'];
const FUR = {
  cat: [0xf3b562, 0xd9d2c5, 0x8d7a6a],
  bear: [0xa8754a, 0xd6a46c, 0x6e5040],
  rabbit: [0xf5efe6, 0xf2c6d0, 0xd8c3a5],
  dog: [0xe9c99b, 0xc28b55, 0xf1e4cf],
  sheep: [0xf7f3ea, 0xe8e2d6],
  frog: [0x7fc26b, 0x9fd27c],
};
const SHIRTS = [0x4c9bd6, 0xe5534b, 0x5fb86b, 0xf29b38, 0x9b6fd1, 0xf06fa4, 0x3fbfb0, 0xf2d24b];

function ears(group, species, fur, inner) {
  const head = group;
  if (species === 'cat') {
    [-1, 1].forEach((s) => {
      const e = mesh(new THREE.ConeGeometry(0.17, 0.32, 4), fur, s * 0.28, 0.42, 0);
      e.rotation.z = -s * 0.35;
      head.add(e);
    });
  } else if (species === 'bear') {
    [-1, 1].forEach((s) => {
      head.add(mesh(new THREE.SphereGeometry(0.15, 14, 10), fur, s * 0.34, 0.36, -0.02));
      head.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), inner, s * 0.34, 0.36, 0.08));
    });
  } else if (species === 'rabbit') {
    [-1, 1].forEach((s) => {
      const e = mesh(new THREE.CapsuleGeometry(0.09, 0.42, 6, 12), fur, s * 0.16, 0.7, -0.04);
      e.rotation.z = -s * 0.12;
      head.add(e);
      const i = mesh(new THREE.CapsuleGeometry(0.045, 0.32, 4, 8), inner, s * 0.16, 0.7, 0.04);
      i.rotation.z = -s * 0.12;
      head.add(i);
    });
  } else if (species === 'dog') {
    [-1, 1].forEach((s) => {
      const e = mesh(new THREE.SphereGeometry(0.2, 12, 10), inner, s * 0.46, 0.02, -0.02);
      e.scale.set(0.45, 1.1, 0.8);
      e.rotation.z = s * 0.25;
      head.add(e);
    });
  } else if (species === 'sheep') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      head.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), fur, Math.cos(a) * 0.32, 0.33 + Math.sin(a) * 0.08, Math.sin(a) * 0.22 - 0.05));
    }
    [-1, 1].forEach((s) => {
      const e = mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(0x8a7a6a), s * 0.5, 0.05, 0);
      e.scale.set(0.5, 0.9, 1);
      head.add(e);
    });
  } else if (species === 'frog') {
    [-1, 1].forEach((s) => {
      head.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), fur, s * 0.22, 0.4, 0.12));
      head.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), toon(0x1f1f1f), s * 0.22, 0.42, 0.25));
    });
  }
}

function buildBody(spec) {
  const root = new THREE.Group();
  const furList = FUR[spec.species];
  const fur = toon(furList[spec.furIndex % furList.length]);
  const inner = toon(spec.species === 'rabbit' ? 0xf4a7b6 : 0xf6e1c5);
  const shirt = toon(spec.shirt);
  const pants = toon(0x3d4a63);
  const black = toon(0x1f1f1f);

  // 다리 (엉덩이 축으로 흔든다)
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.14, 0.44, 0);
    pivot.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.4, 10), pants, 0, -0.2, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), toon(0x5a3f2e), 0, -0.4, 0.04));
    root.add(pivot);
    return pivot;
  });

  // 몸통
  const torso = mesh(new THREE.CylinderGeometry(0.27, 0.34, 0.6, 16), shirt, 0, 0.74, 0);
  root.add(torso);

  // 팔 (어깨 축)
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.33, 0.98, 0);
    const arm = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.4, 8), shirt, 0, -0.18, 0);
    pivot.add(arm);
    pivot.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), fur, 0, -0.4, 0));
    pivot.rotation.z = s * 0.18;
    root.add(pivot);
    return pivot;
  });

  // 머리
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  const skull = mesh(new THREE.SphereGeometry(0.5, 24, 18), fur);
  skull.scale.set(1, 0.92, 0.95);
  head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), inner, 0, -0.14, 0.38));
  head.children.at(-1).scale.set(1.1, 0.75, 0.7);
  head.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), black, 0, -0.06, 0.52)); // 코
  [-1, 1].forEach((s) => {
    head.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), black, s * 0.18, 0.04, 0.43));
    head.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), toon(0xffffff), s * 0.18 + 0.02, 0.07, 0.5));
    const cheek = mesh(new THREE.SphereGeometry(0.08, 10, 8), toon(0xff9aa8), s * 0.3, -0.12, 0.36);
    cheek.scale.set(1, 0.6, 0.4);
    head.add(cheek);
  });
  ears(head, spec.species, fur, inner);
  if (spec.hat) {
    const hat = toon(spec.hatColor);
    head.add(mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.06, 20), hat, 0, 0.36, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.24, 20), hat, 0, 0.5, 0));
  }
  root.add(head);

  // 발밑 그림자 대신 쓰는 둥근 그림자 판
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  root.add(blob);

  return { root, legs, arms, head, torso };
}

/* ---------- 말풍선 ---------- */
function bubbleTexture(text) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 190;
  const g = c.getContext('2d');
  g.font = '700 40px "Noto Sans KR", sans-serif';
  let t = text;
  while (g.measureText(t).width > 560 && t.length > 2) t = t.slice(0, -2);
  if (t !== text) t = `${t.trimEnd()}…`;
  const w = Math.min(600, g.measureText(t).width + 64);
  const x = (640 - w) / 2;
  g.fillStyle = '#fffaf0';
  g.strokeStyle = '#d9c79f';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(x, 10, w, 120, 40);
  g.moveTo(300, 128);
  g.lineTo(320, 175);
  g.lineTo(345, 128);
  g.fill();
  g.stroke();
  g.fillStyle = '#fffaf0';
  g.fillRect(303, 120, 40, 12);
  g.fillStyle = '#3b2f22';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, 320, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 이동 경로 ---------- */
const rand = (a, b) => a + Math.random() * (b - a);

export class Villager {
  constructor(spec, world) {
    this.world = world; // { doors: Vector3[], boardPos: Vector3, pillars: Vector3[] }
    const parts = buildBody(spec);
    Object.assign(this, parts);
    this.group = parts.root;
    this.group.scale.setScalar(spec.scale || 1);
    this.speed = rand(1.1, 1.6);
    this.phase = Math.random() * 10;
    this.state = 'idle';
    this.wait = rand(0.5, 3);
    this.where = 'plaza';
    this.target = new THREE.Vector3();
    this.group.position.copy(this.plazaPoint());
    this.group.rotation.y = Math.random() * Math.PI * 2;
    this.bubble = null;
    this.bubbleTime = 0;
    this.nextTalk = rand(4, 14);
  }

  plazaPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = rand(5.2, 10);
    return new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
  }

  lawnPoint() {
    return new THREE.Vector3(rand(-2.2, 2.2), 0, rand(13, 24));
  }

  watchPoint() {
    return new THREE.Vector3(rand(-4, 4), 0, rand(4.5, 8));
  }

  // 기둥에 부딪히지 않는 목적지를 고른다. 광장이 아닌 곳에서는 항상 광장을 거친다.
  pickTarget() {
    const from = this.group.position;
    for (let tries = 0; tries < 8; tries++) {
      let p;
      let where;
      if (this.where !== 'plaza') { p = this.plazaPoint(); where = 'plaza'; } else {
        const r = Math.random();
        if (r < 0.3) { p = this.plazaPoint(); where = 'plaza'; } else if (r < 0.55) { p = this.watchPoint(); where = 'plaza'; this.willWatch = true; } else if (r < 0.85) {
          const idx = Math.floor(Math.random() * this.world.doors.length);
          this.doorIndex = idx;
          const door = this.world.doors[idx];
          p = door.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)));
          where = 'door';
        } else { p = this.lawnPoint(); where = 'lawn'; }
      }
      if (!this.hitsPillar(from, p)) { this.target.copy(p); this.where = where; return; }
      this.willWatch = false;
    }
    this.target.copy(this.plazaPoint());
    this.where = 'plaza';
  }

  hitsPillar(a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const len2 = ab.lengthSq() || 1;
    return this.world.pillars.some((p) => {
      const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / len2, 0, 1);
      return a.clone().addScaledVector(ab, t).distanceTo(p) < 1.1;
    });
  }

  say(text, seconds = 6) {
    this.clearBubble();
    const mat = new THREE.SpriteMaterial({ map: bubbleTexture(text), depthWrite: false });
    this.bubble = new THREE.Sprite(mat);
    this.bubble.scale.set(3.4, 1.01, 1);
    this.bubble.position.set(0, 2.75, 0);
    this.bubble.renderOrder = 10;
    this.group.add(this.bubble);
    this.bubbleTime = seconds;
  }

  clearBubble() {
    if (!this.bubble) return;
    this.group.remove(this.bubble);
    this.bubble.material.map.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  update(dt, talk) {
    const pos = this.group.position;
    if (this.state === 'walk') {
      const to = new THREE.Vector3().subVectors(this.target, pos);
      to.y = 0;
      const dist = to.length();
      if (dist < 0.15) {
        if (this.willWatch) {
          this.state = 'watch';
          this.wait = rand(4, 8);
          this.willWatch = false;
        } else {
          this.state = 'idle';
          this.wait = rand(1, 4);
        }
      } else {
        to.normalize();
        pos.addScaledVector(to, Math.min(dist, this.speed * dt));
        this.turnTo(Math.atan2(to.x, to.z), dt);
        this.phase += dt * this.speed * 6;
      }
    } else {
      this.wait -= dt;
      if (this.state === 'watch') {
        const b = this.world.boardPos;
        this.turnTo(Math.atan2(b.x - pos.x, b.z - pos.z), dt);
      }
      if (this.wait <= 0) {
        this.pickTarget();
        this.state = 'walk';
      }
      // 서 있을 때는 팔다리를 제자리로
      this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 8);
    }

    const swing = Math.sin(this.phase);
    this.legs[0].rotation.x = swing * 0.6;
    this.legs[1].rotation.x = -swing * 0.6;
    this.arms[0].rotation.x = -swing * 0.5;
    this.arms[1].rotation.x = swing * 0.5;
    const bob = Math.abs(Math.sin(this.phase)) * 0.06;
    this.torso.position.y = 0.74 + bob;
    this.head.position.y = 1.5 + bob;
    this.head.rotation.z = Math.sin(performance.now() / 900 + this.speed * 10) * 0.05;
    if (this.state === 'watch') this.head.rotation.x = -0.25; else this.head.rotation.x *= 0.9;

    // 말풍선
    if (this.bubble) {
      this.bubbleTime -= dt;
      if (this.bubbleTime <= 0) this.clearBubble();
    } else {
      this.nextTalk -= dt;
      if (this.nextTalk <= 0 && talk) {
        const text = talk(this);
        if (text) this.say(text);
        this.nextTalk = rand(12, 26);
      }
    }
  }

  turnTo(angle, dt) {
    let d = angle - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 6);
  }
}

export function makeVillagers(count, world) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const species = SPECIES[i % SPECIES.length];
    list.push(new Villager({
      species,
      furIndex: Math.floor(i / SPECIES.length) + i,
      shirt: SHIRTS[(i * 3) % SHIRTS.length],
      hat: i % 4 === 1,
      hatColor: SHIRTS[(i * 5 + 2) % SHIRTS.length],
      scale: rand(0.92, 1.05),
    }, world));
  }
  return list;
}
