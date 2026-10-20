// 마을 주민: 기본 도형으로 만든 2등신 동물 캐릭터 16종 + 소품(안경·공무원증·모자·가방·치마 등).
// 행동: 광장(plaza) / 동네 앞마당(yard) / 길(road) 세 가지.
import * as THREE from 'three';

let gradient;
function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map();
export function toon(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() }));
  return matCache.get(color);
}
export const toonGradientMap = () => toonGradient();

// 자주 쓰는 도형은 공유
const G = {
  sph: new THREE.SphereGeometry(1, 16, 12),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone: new THREE.ConeGeometry(1, 1, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cap: new THREE.CapsuleGeometry(1, 1, 4, 10),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 20),
};

function part(geo, mat, [x, y, z], [sx, sy, sz], rot) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true;
  return m;
}

const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// 종족 정의: fur(털색 후보), inner(귀 안·주둥이), build(머리 장식 함수)
const SPECIES = {
  cat: { fur: [0xf3b562, 0xd9d2c5, 0x8d7a6a, 0x2f2f33], inner: 0xf6e1c5, tail: 'thin', ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.cone4, f, [s * 0.28, 0.42, 0], [0.17, 0.32, 0.17], [0, 0, -s * 0.35])); });
  } },
  dog: { fur: [0xe9c99b, 0xc28b55, 0xf1e4cf, 0x7a5236], inner: 0xf6e1c5, tail: 'thin', ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.sph, i, [s * 0.46, 0.02, -0.02], [0.09, 0.22, 0.16], [0, 0, s * 0.25])); });
  } },
  bear: { fur: [0xa8754a, 0x6e5040, 0xd6a46c], inner: 0xf0d2a8, ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.sph, f, [s * 0.34, 0.36, -0.02], [0.15, 0.15, 0.15])); h.add(part(G.sph, i, [s * 0.34, 0.36, 0.08], [0.08, 0.08, 0.05])); });
  } },
  rabbit: { fur: [0xf5efe6, 0xd8c3a5, 0xb9b0a8], inner: 0xf4a7b6, tail: 'puff', ears(h, f, i) {
    [-1, 1].forEach((s) => {
      h.add(part(G.cap, f, [s * 0.16, 0.72, -0.04], [0.09, 0.21, 0.09], [0, 0, -s * 0.12]));
      h.add(part(G.cap, i, [s * 0.16, 0.72, 0.04], [0.045, 0.16, 0.03], [0, 0, -s * 0.12]));
    });
  } },
  fox: { fur: [0xe8833a, 0xd96c2c], inner: 0xffffff, tail: 'fox', ears(h, f, i) {
    [-1, 1].forEach((s) => {
      h.add(part(G.cone4, f, [s * 0.27, 0.46, 0], [0.19, 0.4, 0.15], [0, 0, -s * 0.3]));
      h.add(part(G.cone4, toon(0x2f2f33), [s * 0.33, 0.62, 0.01], [0.07, 0.12, 0.06], [0, 0, -s * 0.3]));
    });
  } },
  panda: { fur: [0xfafafa], inner: 0xffffff, ears(h, f, i) {
    const k = toon(0x1f1f22);
    [-1, 1].forEach((s) => {
      h.add(part(G.sph, k, [s * 0.34, 0.36, -0.02], [0.15, 0.15, 0.13]));
      h.add(part(G.sph, k, [s * 0.18, 0.03, 0.4], [0.13, 0.15, 0.06], [0, 0, s * 0.5]));
    });
  } },
  pig: { fur: [0xf7b5c0, 0xf2a2b0], inner: 0xf08a9c, ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.cone4, f, [s * 0.3, 0.38, 0.08], [0.15, 0.22, 0.1], [0.5, 0, -s * 0.4])); });
    h.add(part(G.cyl, i, [0, -0.1, 0.48], [0.15, 0.08, 0.15], [Math.PI / 2, 0, 0]));
  }, noNose: true },
  penguin: { fur: [0x2a2d3a], inner: 0xffffff, ears(h, f, i) {
    h.add(part(G.sph, toon(0xffffff), [0, -0.06, 0.2], [0.38, 0.36, 0.3]));
    h.add(part(G.cone, toon(0xf29b38), [0, -0.12, 0.52], [0.08, 0.16, 0.08], [Math.PI / 2, 0, 0]));
  }, noNose: true, noMuzzle: true },
  koala: { fur: [0x9ea3a8, 0x8a8f96], inner: 0xffffff, ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.sph, f, [s * 0.46, 0.22, -0.04], [0.22, 0.22, 0.12])); h.add(part(G.sph, toon(0xf2f2f2), [s * 0.46, 0.22, 0.04], [0.14, 0.14, 0.06])); });
    h.add(part(G.sph, toon(0x2f2f33), [0, -0.06, 0.48], [0.1, 0.14, 0.08]));
  }, noNose: true },
  tiger: { fur: [0xf29b38, 0xf7c26b], inner: 0xfff2dc, tail: 'thin', ears(h, f, i) {
    const k = toon(0x2f2f33);
    [-1, 1].forEach((s) => { h.add(part(G.sph, f, [s * 0.32, 0.38, 0], [0.13, 0.13, 0.08])); });
    [-0.14, 0, 0.14].forEach((x) => h.add(part(G.box, k, [x, 0.42, 0.18], [0.04, 0.03, 0.22], [-0.4, 0, 0])));
  } },
  chick: { fur: [0xffd84d, 0xffe27a], inner: 0xffffff, ears(h, f, i) {
    [-0.06, 0, 0.06].forEach((x, k) => h.add(part(G.cone, f, [x, 0.5, 0], [0.05, 0.18, 0.05], [0, 0, (k - 1) * 0.4])));
    h.add(part(G.cone, toon(0xf29b38), [0, -0.08, 0.52], [0.09, 0.14, 0.07], [Math.PI / 2, 0, 0]));
  }, noNose: true, noMuzzle: true },
  mouse: { fur: [0xb7b2ad, 0xa48c74], inner: 0xf4a7b6, tail: 'thin', ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.sph, f, [s * 0.38, 0.4, -0.04], [0.22, 0.22, 0.05])); h.add(part(G.sph, i, [s * 0.38, 0.4, -0.01], [0.14, 0.14, 0.03])); });
  } },
  raccoon: { fur: [0x8c7f72, 0x7a6f66], inner: 0xe9e2d6, tail: 'thin', ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.cone4, f, [s * 0.28, 0.4, 0], [0.15, 0.24, 0.12], [0, 0, -s * 0.35])); });
    h.add(part(G.sph, toon(0x3a3330), [0, 0.03, 0.36], [0.38, 0.11, 0.12]));
  } },
  deer: { fur: [0xc58a52, 0xb47a46], inner: 0xf6e1c5, ears(h, f, i) {
    const a = toon(0x8b5a2b);
    [-1, 1].forEach((s) => {
      h.add(part(G.sph, f, [s * 0.44, 0.24, 0], [0.18, 0.08, 0.1], [0, 0, s * 0.4]));
      h.add(part(G.cyl, a, [s * 0.18, 0.62, 0], [0.04, 0.32, 0.04], [0, 0, -s * 0.3]));
      h.add(part(G.cyl, a, [s * 0.28, 0.72, 0], [0.03, 0.16, 0.03], [0, 0, -s * 1.1]));
    });
  } },
  sheep: { fur: [0xf7f3ea], inner: 0xe8e2d6, ears(h, f, i) {
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; h.add(part(G.sphLo, f, [Math.cos(a) * 0.32, 0.33 + Math.sin(a) * 0.08, Math.sin(a) * 0.22 - 0.05], [0.17, 0.17, 0.17])); }
    [-1, 1].forEach((s) => h.add(part(G.sph, toon(0x8a7a6a), [s * 0.5, 0.05, 0], [0.06, 0.11, 0.12])));
  } },
  frog: { fur: [0x7fc26b, 0x9fd27c], inner: 0xc9e8a9, ears(h, f, i) {
    [-1, 1].forEach((s) => { h.add(part(G.sph, f, [s * 0.22, 0.4, 0.12], [0.15, 0.15, 0.15])); h.add(part(G.sph, toon(0x1f1f1f), [s * 0.22, 0.42, 0.25], [0.07, 0.07, 0.04])); });
  }, noEyes: true, noNose: true, noMuzzle: true },
};
export const SPECIES_NAMES = Object.keys(SPECIES);

const SHIRTS = [0x4c9bd6, 0xe5534b, 0x5fb86b, 0xf29b38, 0x9b6fd1, 0xf06fa4, 0x3fbfb0, 0xf2d24b, 0xffffff, 0x2f4f7f, 0x7a8b99, 0xc0392b];
const PANTS = [0x3d4a63, 0x2f2f33, 0x6b5a48, 0x4a6b8a, 0x8a8f96, 0x5a3f2e];
const HATS = [0xe5534b, 0x4c9bd6, 0xf2d24b, 0x5fb86b, 0xffffff, 0x2f2f33];

function buildBody(spec, rnd) {
  const sp = SPECIES[spec.species];
  const root = new THREE.Group();
  const fur = toon(pick(sp.fur, rnd()));
  const inner = toon(sp.inner);
  const shirt = toon(pick(SHIRTS, rnd()));
  const pants = toon(pick(PANTS, rnd()));
  const black = toon(0x1f1f1f);
  const shoes = toon(pick([0x5a3f2e, 0x2f2f33, 0xffffff, 0xe5534b], rnd()));

  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.14, 0.44, 0);
    p.add(part(G.cyl, pants, [0, -0.2, 0], [0.105, 0.4, 0.105]));
    p.add(part(G.sph, shoes, [0, -0.4, 0.04], [0.12, 0.09, 0.15]));
    root.add(p);
    return p;
  });

  const torso = new THREE.Group();
  torso.position.y = 0.74;
  torso.add(part(new THREE.CylinderGeometry(0.27, 0.34, 0.6, 16), shirt, [0, 0, 0], [1, 1, 1]));
  if (rnd() < 0.3) torso.add(part(new THREE.ConeGeometry(0.46, 0.42, 16, 1, true), pants, [0, -0.16, 0], [1, 1, 1])); // 치마
  const acc = { lanyard: rnd() < 0.45, tie: rnd() < 0.2, bag: rnd() < 0.18, glasses: rnd() < 0.3, hat: rnd() < 0.35 };
  if (acc.lanyard) { // 공무원증
    torso.add(part(G.box, toon(0x2c5aa0), [-0.1, 0.12, 0.27], [0.03, 0.34, 0.02], [0, 0, 0.25]));
    torso.add(part(G.box, toon(0x2c5aa0), [0.1, 0.12, 0.27], [0.03, 0.34, 0.02], [0, 0, -0.25]));
    torso.add(part(G.box, toon(0xffffff), [0, -0.08, 0.32], [0.16, 0.2, 0.02]));
  } else if (acc.tie) {
    torso.add(part(G.cone4, toon(pick([0xe5534b, 0x2f4f7f, 0xf2d24b], rnd())), [0, 0.06, 0.3], [0.06, 0.34, 0.03], [Math.PI, 0, 0]));
  }
  if (acc.bag) torso.add(part(G.box, toon(pick([0xe5534b, 0x4c9bd6, 0xf29b38], rnd())), [0, 0.02, -0.36], [0.4, 0.44, 0.2]));
  root.add(torso);

  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.33, 0.98, 0);
    p.add(part(G.cyl, shirt, [0, -0.18, 0], [0.075, 0.4, 0.075]));
    p.add(part(G.sph, fur, [0, -0.4, 0], [0.09, 0.09, 0.09]));
    p.rotation.z = s * 0.18;
    root.add(p);
    return p;
  });

  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  head.add(part(G.sph, fur, [0, 0, 0], [0.5, 0.46, 0.475]));
  if (!sp.noMuzzle) head.add(part(G.sph, inner, [0, -0.14, 0.38], [0.22, 0.15, 0.14]));
  if (!sp.noNose) head.add(part(G.sph, black, [0, -0.06, 0.52], [0.055, 0.05, 0.05]));
  if (!sp.noEyes) {
    [-1, 1].forEach((s) => {
      head.add(part(G.sph, black, [s * 0.18, 0.04, 0.43], [0.075, 0.075, 0.075]));
      head.add(part(G.sphLo, toon(0xffffff), [s * 0.18 + 0.02, 0.07, 0.5], [0.025, 0.025, 0.025]));
    });
  }
  [-1, 1].forEach((s) => head.add(part(G.sphLo, toon(0xff9aa8), [s * 0.3, -0.12, 0.36], [0.08, 0.05, 0.03])));
  sp.ears(head, fur, inner);
  if (acc.glasses) {
    const fr = toon(pick([0x2f2f33, 0x8b5a2b, 0xc0392b], rnd()));
    [-1, 1].forEach((s) => head.add(part(G.torus, fr, [s * 0.18, 0.04, 0.5], [0.11, 0.11, 0.11])));
    head.add(part(G.box, fr, [0, 0.06, 0.52], [0.12, 0.02, 0.02]));
  }
  if (acc.hat) {
    const hc = toon(pick(HATS, rnd()));
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) { // 모자(챙)
      head.add(part(G.sph, hc, [0, 0.3, -0.02], [0.44, 0.24, 0.44]));
      head.add(part(G.cyl, hc, [0, 0.27, 0.32], [0.3, 0.03, 0.22]));
    } else if (kind === 1) { // 밀짚모자
      head.add(part(G.cyl, toon(0xe8c77a), [0, 0.36, 0], [0.62, 0.04, 0.62]));
      head.add(part(G.cyl, toon(0xe8c77a), [0, 0.48, 0], [0.3, 0.22, 0.3]));
      head.add(part(G.cyl, hc, [0, 0.42, 0], [0.31, 0.06, 0.31]));
    } else { // 리본
      [-1, 1].forEach((s) => head.add(part(G.cone4, hc, [s * 0.12, 0.42, 0.1], [0.1, 0.16, 0.06], [0, 0, s * Math.PI / 2])));
      head.add(part(G.sphLo, hc, [0, 0.42, 0.1], [0.06, 0.06, 0.06]));
    }
  }
  root.add(head);

  if (sp.tail === 'thin') root.add(part(G.cyl, fur, [0, 0.5, -0.36], [0.05, 0.4, 0.05], [-0.9, 0, 0]));
  if (sp.tail === 'puff') root.add(part(G.sphLo, fur, [0, 0.45, -0.34], [0.12, 0.12, 0.12]));
  if (sp.tail === 'fox') {
    root.add(part(G.sph, fur, [0, 0.5, -0.45], [0.16, 0.16, 0.34], [0.6, 0, 0]));
    root.add(part(G.sphLo, toon(0xffffff), [0, 0.68, -0.68], [0.1, 0.1, 0.1]));
  }

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

/* ---------- 이동 ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
const inRect = (r) => new THREE.Vector3(rand(r.x0, r.x1), 0, rand(r.z0, r.z1));

export class Villager {
  // behavior:
  //  { kind:'plaza', area, watch, doors:[{pos, id}], pillars:[Vector3], board:Vector3 }
  //  { kind:'yard', area, id }
  //  { kind:'road', a:Vector3, b:Vector3 }
  constructor(spec, behavior, seed) {
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    Object.assign(this, buildBody(spec, rnd));
    this.group = this.root;
    this.group.scale.setScalar(rand(0.88, 1.08));
    this.behavior = behavior;
    this.speed = rand(1.0, 1.7);
    this.phase = Math.random() * 10;
    this.state = 'idle';
    this.wait = rand(0.5, 3);
    this.target = new THREE.Vector3();
    this.place = null; // 지금 서 있는 곳의 id (건물 앞이면 건물 id)
    this.group.position.copy(this.randomSpot());
    this.group.rotation.y = Math.random() * Math.PI * 2;
    this.bubble = null;
    this.bubbleTime = 0;
    this.nextTalk = rand(3, 20);
  }

  randomSpot() {
    const b = this.behavior;
    if (b.kind === 'road') return b.a.clone().lerp(b.b, Math.random());
    return inRect(b.area);
  }

  hitsPillar(a, p) {
    const pillars = this.behavior.pillars || [];
    const ab = new THREE.Vector3().subVectors(p, a);
    const len2 = ab.lengthSq() || 1;
    return pillars.some((q) => {
      const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(q, a).dot(ab) / len2, 0, 1);
      return a.clone().addScaledVector(ab, t).distanceTo(q) < 1.6;
    });
  }

  pickTarget() {
    const b = this.behavior;
    const from = this.group.position;
    this.willWatch = false;
    if (b.kind === 'road') {
      this.target.copy(b.a.clone().lerp(b.b, Math.random() < 0.5 ? rand(0, 0.15) : rand(0.85, 1)));
      this.place = null;
      return;
    }
    if (b.kind === 'yard') {
      this.target.copy(inRect(b.area));
      this.place = b.id;
      return;
    }
    for (let i = 0; i < 8; i++) {
      const r = Math.random();
      let p;
      let place = null;
      let watch = false;
      if (r < 0.35) p = inRect(b.area);
      else if (r < 0.6) { p = inRect(b.watch); watch = true; } else {
        const d = b.doors[Math.floor(Math.random() * b.doors.length)];
        p = d.pos.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
        place = d.id;
      }
      if (!this.hitsPillar(from, p)) { this.target.copy(p); this.place = place; this.willWatch = watch; return; }
    }
    this.target.copy(inRect(b.watch));
  }

  say(text, seconds = 6) {
    this.clearBubble();
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(text), depthWrite: false }));
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
        this.state = this.willWatch ? 'watch' : 'idle';
        this.wait = this.willWatch ? rand(4, 9) : rand(1, 4);
      } else {
        to.normalize();
        pos.addScaledVector(to, Math.min(dist, this.speed * dt));
        this.turnTo(Math.atan2(to.x, to.z), dt);
        this.phase += dt * this.speed * 6;
      }
    } else {
      this.wait -= dt;
      if (this.state === 'watch' && this.behavior.board) {
        const b = this.behavior.board;
        this.turnTo(Math.atan2(b.x - pos.x, b.z - pos.z), dt);
      }
      if (this.wait <= 0) { this.pickTarget(); this.state = 'walk'; }
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
    this.head.rotation.x = this.state === 'watch' ? -0.3 : this.head.rotation.x * 0.9;

    if (this.bubble) {
      this.bubbleTime -= dt;
      if (this.bubbleTime <= 0) this.clearBubble();
    } else {
      this.nextTalk -= dt;
      if (this.nextTalk <= 0 && talk) {
        const text = talk(this);
        if (text) this.say(text);
        this.nextTalk = rand(14, 32);
      }
    }
  }

  turnTo(angle, dt) {
    let d = angle - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 6);
  }
}

let seedCounter = 1;
export function makeVillager(behavior, speciesIndex) {
  const name = SPECIES_NAMES[speciesIndex % SPECIES_NAMES.length];
  const v = new Villager({ species: name }, behavior, 7919 * seedCounter++ + 13);
  v.species = name;
  return v;
}
