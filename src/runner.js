/**
 * Бегающий персонаж (assets/characters/tiny-dancer.glb): скелетные клипы Walking/Running,
 * плюс перенесённые из большой модели «стройка», прыжок, танец (tools/retarget-anims.mjs).
 * Свой — управляется WASD/стрелками или экранным джойстиком; чужие (в командной игре) —
 * плавно догоняют позицию из снимков хоста. Различие игроков — цветное кольцо под ногами и ник.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/** Кого можно выбрать в профиле. Скелет у моделей один, поэтому клипы подходят обеим. */
export const HEROES = {
  dancer: { name: 'Танцовщица', emoji: '💃', url: 'assets/characters/tiny-dancer.glb' },
  maskot: { name: 'Маскот', emoji: '⚡', url: 'models/maskot.web.glb' },
  ghost: { name: 'Призрак', emoji: '👻', url: null },     // без модели: рисуется кодом, растёт за ракушки, как замок
};
const GHOST_SCALE = [1, 1.3, 1.65, 2.1];   // стадии роста призрака

export const ghostKit = (() => {
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 4.6;
    const r = t > 0.62 ? Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2)) * 1.55
                       : 1.55 * Math.pow(t / 0.62, 0.7) * (0.25 + 0.75 * t / 0.62) + 0.02;
    prof.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const body = new THREE.LatheGeometry(prof, 20);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const low = Math.max(0, 1 - y / 2.2);
    const a = Math.atan2(z, x);
    p.setXYZ(i, x + low * low * 1.0, y + Math.sin(a * 5) * 0.12 * low, z - low * low * 1.6);
  }
  body.computeVertexNormals();
  return {
    body, eye: new THREE.SphereGeometry(0.3, 12, 10), shine: new THREE.SphereGeometry(0.09, 8, 6),
    cheek: new THREE.CircleGeometry(0.22, 14), mouth: new THREE.TorusGeometry(0.15, 0.06, 6, 14),
    arm: new THREE.SphereGeometry(0.42, 10, 8), blob: new THREE.CircleGeometry(1.5, 20),
    dark: new THREE.MeshBasicMaterial({ color: 0x2b2c4a }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blush: new THREE.MeshBasicMaterial({ color: 0xffa3c0, transparent: true, opacity: 0.8 }),
  };
})();


/** Цвет обволакивает всю фигуру: красит уже освещённый результат, складки и детали остаются видны. */
function wrapColor(material, tint) {
  const m = material.clone();
  const uTint = { value: new THREE.Color(tint) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = uTint;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
      .replace('#include <opaque_fragment>', `float wrapL = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        outgoingLight = mix(outgoingLight, uTint * (0.32 + 1.05 * wrapL), 0.88);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'tint-wrap';
  return m;
}
const HEIGHT = 4.6;
const MAX_SPEED = 11;           // ед/с при полном отклонении
const WALK_SPEED_AT = 0.55;     // до этой доли — шаг, дальше — бег

// Распрыжка: прыжок сразу при приземлении сохраняет и чуть увеличивает скорость, а в воздухе ею можно рулить.
// Промахнулся с моментом — на земле скорость быстро падает до обычной.
const GRAVITY = 38, JUMP_V = 11;
const HOP_WINDOW = 0.14;        // сколько секунд после приземления скорость ещё не теряется
const JUMP_BUFFER = 0.18;       // нажатие чуть раньше приземления тоже считается
const HOP_BOOST = 1.1, HOP_CAP = MAX_SPEED * 2.4;
const AIR_WISH = 4, AIR_ACCEL = 90;

const SRCS = {};                // hero → { gltf, scale }

export async function loadRunnerModel(loader, hero = 'maskot') {
  const kind = HEROES[hero] && hero !== 'dancer' ? hero : 'maskot';
  if (!HEROES[kind].url) return null;
  if (SRCS[kind]) return SRCS[kind];
  const gltf = await loader.loadAsync(HEROES[kind].url);
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  SRCS[kind] = { gltf, scale: HEIGHT / Math.max(0.001, size.y) };
  return SRCS[kind];
}

/** Надпись-спрайт над головой (ник, значок владельца). */
export function makeLabel(text, color = '#ffd447', scale = 1) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 44px "Segoe UI", system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w; c.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(6,25,43,0.82)';
  const r = 30;
  ctx.beginPath();
  ctx.roundRect(2, 4, w - 4, 64, r);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 24, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set((w / 72) * 1.5 * scale, 1.5 * scale, 1);
  sp.renderOrder = 10;
  return sp;
}

const ONE_SHOT = { jump: ['Jump', '360_Power_Spin_Jump', 'Skip_Forward'], build: ['Hammer', 'Heavy_Hammer_Swing', 'Fast_Lightning'], dance: ['Dance', 'All_Night_Dance'],
                   cheer: ['Cheer', 'Dance', 'All_Night_Dance'], sad: ['Kneel_Idle', 'Kneeling_Reload'] };

export class Runner {
  constructor(scene, { color = '#ffd447', name = '', me = false, hero = 'maskot', tint = '' } = {}) {
    if (hero === 'dancer') hero = 'maskot';     // персонаж игрока: Танцовщицы больше нет
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();       // для подпрыгивания без клипа
    this.root.add(this.body);
    this.ghost = hero === 'ghost';
    this.stage = 1;
    this.scaleNow = 1;
    const SRC = SRCS[hero] || SRCS.maskot || Object.values(SRCS)[0];
    if (this.ghost) {
      this.model = this.makeGhost(tint);
    } else {
      this.model = cloneSkinned(SRC.gltf.scene);
      this.model.scale.setScalar(SRC.scale);
    }
    this.body.add(this.model);
    this.hips = null;
    this.model.traverse((o) => {
      if (o.isBone && !this.hips && /hips/i.test(o.name)) this.hips = o;
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        if (tint && !this.ghost) o.material = wrapColor(o.material, tint);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    if (!this.ghost) for (const c of SRC.gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.walk = this.actions.Walking;
    this.run = this.actions.Running;
    for (const a of [this.walk, this.run]) if (a) { a.play(); a.setEffectiveWeight(0); }
    if (this.walk) { this.walk.setEffectiveWeight(1); this.walk.timeScale = 0; }
    this.shot = null;                    // разовый клип (прыжок, стройка, танец)
    this.mixer.addEventListener('finished', (e) => { if (this.shot && e.action === this.shot) this.endShot(); });

    const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.9, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: me ? 0.95 : 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.45;
    this.root.add(ring);
    this.ring = ring;
    if (name) {
      this.label = makeLabel(name, color, 0.75);
      this.label.position.y = HEIGHT + 1.6;
      this.root.add(this.label);
    }
    this.yaw = 0;
    this.speedK = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.y = 0;
    this.air = false; this.groundT = 1; this.jumpQ = 0;
    this._v = new THREE.Vector3();
    scene.add(this.root);
  }

  makeGhost(tint) {
    const k = ghostKit, g = new THREE.Group();
    const color = new THREE.Color(tint || '#eaf6ff');
    this.ghostMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5, transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(k.body, this.ghostMat);
    body.castShadow = true;
    g.add(body);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(k.eye, k.dark); e.position.set(s * 0.5, 3.55, 1.28); e.scale.set(1, 1.15, 0.5);
      const h = new THREE.Mesh(k.shine, k.white); h.position.set(s * 0.5 + 0.09, 3.68, 1.43);
      const c = new THREE.Mesh(k.cheek, k.blush); c.position.set(s * 0.9, 3.05, 1.2); c.rotation.y = s * 0.55;
      const a = new THREE.Mesh(k.arm, this.ghostMat); a.position.set(s * 1.55, 2.6, 0.3); a.scale.set(0.8, 0.55, 0.7);
      g.add(e, h, c, a);
    }
    const m = new THREE.Mesh(k.mouth, k.dark); m.position.set(0, 2.95, 1.42);
    g.add(m);
    return g;
  }

  /** Стадия роста призрака 1–4: заметно больше с каждой, как замок. */
  setGrow(stage) { if (this.ghost) this.stage = Math.max(1, Math.min(GHOST_SCALE.length, stage | 0)); }

  /** Во сколько раз быстрее обычного бега (для подсказки о распрыжке). */
  get hopK() { return Math.hypot(this.vx, this.vz) / MAX_SPEED; }

  /** Своё движение: dir — единичный вектор (или 0), mag — 0..1. */
  move(dir, mag, dt, radius = 50) {
    if (this.shot && this.shotLock && mag > 0) this.endShot();
    this.jumpQ -= dt;
    if (!this.air) {
      this.groundT += dt;
      if (this.jumpQ > 0) this.takeOff();
      else if (this.groundT > HOP_WINDOW) {        // на земле — обычный бег, лишняя скорость быстро гаснет
        const k = Math.min(1, dt * 10);
        this.vx += (dir.x * mag * MAX_SPEED - this.vx) * k;
        this.vz += (dir.z * mag * MAX_SPEED - this.vz) * k;
      }
    }
    if (this.air) {
      if (mag > 0.02) {                            // в воздухе: добавка только поперёк скорости — так и разгоняются, виляя
        const add = AIR_WISH * mag - (this.vx * dir.x + this.vz * dir.z);
        if (add > 0) { const a = Math.min(add, AIR_ACCEL * dt); this.vx += dir.x * a; this.vz += dir.z * a; }
      }
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > HOP_CAP) { this.vx *= HOP_CAP / sp; this.vz *= HOP_CAP / sp; }
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.air = false; this.groundT = 0; }
    }
    const p = this.root.position;
    p.x += this.vx * dt;
    p.z += this.vz * dt;
    const r = Math.hypot(p.x, p.z);
    if (r > radius) { p.x *= radius / r; p.z *= radius / r; }
    this.body.position.y = this.y;
    this.speedK += (Math.min(1, this.hopK) - this.speedK) * Math.min(1, dt * 8);
    if (mag > 0.02) {
      const want = Math.atan2(dir.x, dir.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.root.rotation.y = this.yaw;
    this.blend(this.speedK);
  }

  takeOff() {
    const chain = this.groundT <= HOP_WINDOW && this.hopK > 0.6;
    this.jumpQ = 0;
    this.air = true;
    this.vy = JUMP_V;
    if (chain) {                                   // успел: скорость сохраняется и растёт
      const k = Math.min(HOP_BOOST, HOP_CAP / Math.max(1, Math.hypot(this.vx, this.vz)));
      this.vx *= k; this.vz *= k;
    } else {
      this.playShot('jump', { lock: false });
    }
  }

  /** Сбросить движение (отдых, возврат к домику). */
  stop() { this.vx = this.vz = this.vy = this.y = 0; this.air = false; this.jumpQ = 0; this.speedK = 0; this.body.position.y = 0; }

  /** Чужой персонаж: догоняем точку из снимка и сами выбираем шаг/бег по скорости. */
  follow(x, z, ry, run, dt) {
    const p = this.root.position;
    const f = Math.min(1, dt * 8);
    const nx = p.x + (x - p.x) * f, nz = p.z + (z - p.z) * f;
    const v = Math.hypot(nx - p.x, nz - p.z) / Math.max(dt, 1e-3);
    p.x = nx; p.z = nz;
    let d = ry - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 10);
    this.root.rotation.y = this.yaw;
    const target = run ? Math.min(1, v / MAX_SPEED + 0.15) : Math.min(1, v / MAX_SPEED);
    this.speedK += (target - this.speedK) * Math.min(1, dt * 6);
    this.blend(this.speedK);
  }

  /** Шаг ↔ бег: плавное смешивание весов, в покое — Walking на паузе (первый кадр). */
  blend(s) {
    if (this.shot) return;
    if (!this.walk) return;
    if (!this.run) { this.walk.setEffectiveWeight(1); this.walk.timeScale = s < 0.03 ? 0 : 0.6 + s; return; }
    const runW = THREE.MathUtils.smoothstep(s, WALK_SPEED_AT - 0.15, WALK_SPEED_AT + 0.15);
    this.walk.setEffectiveWeight(1 - runW);
    this.run.setEffectiveWeight(runW);
    if (s < 0.03) { this.walk.timeScale = 0; this.walk.time = 0; } else this.walk.timeScale = 0.5 + s * 1.2;
    this.run.timeScale = 0.75 + s * 0.4;
  }

  clipFor(kind) {
    for (const n of ONE_SHOT[kind]) if (this.actions[n]) return this.actions[n];
    return null;
  }

  /** Разовый клип поверх ходьбы. loops — сколько раз (танец можно дольше). */
  playShot(kind, { loops = 1, lock = true, seconds = 0 } = {}) {
    const a = this.clipFor(kind);
    if (!a) return false;
    if (this.shot && this.shot !== a) this.shot.fadeOut(0.15);
    a.reset();
    a.setLoop(seconds ? THREE.LoopRepeat : THREE.LoopOnce, loops);
    a.clampWhenFinished = false;
    a.setEffectiveWeight(1);
    a.timeScale = 1;
    a.fadeIn(0.15).play();
    for (const b of [this.walk, this.run]) if (b) b.fadeOut(0.15);
    this.shot = a;
    this.shotLock = lock;
    clearTimeout(this.shotT);
    if (seconds) this.shotT = setTimeout(() => this.endShot(), seconds * 1000);
    return true;
  }

  endShot() {
    if (!this.shot) return;
    this.shot.fadeOut(0.2);
    this.shot = null;
    clearTimeout(this.shotT);
    for (const b of [this.walk, this.run]) if (b) { b.reset(); b.fadeIn(0.2).play(); }
    this.blend(this.speedK);
  }

  jump() { this.jumpQ = JUMP_BUFFER; }
  build() { if (this.ghost) this.pulse = 1; else this.playShot('build'); }
  dance(sec = 5) { this.playShot('dance', { seconds: sec }); }
  cheer(won) { if (won) this.playShot('cheer', { seconds: 8 }); else this.playShot('sad', { seconds: 6 }); }

  update(dt) {
    this.mixer.update(dt);
    if (this.hips) {                     // корень стоит на месте: позицией рулит игра
      this.hips.updateWorldMatrix(true, false);
      this._v.setFromMatrixPosition(this.hips.matrixWorld);
      this.body.worldToLocal(this._v);
      this.model.position.x -= this._v.x;
      this.model.position.z -= this._v.z;
    }
    if (this.ghost) {                    // парит, при ударе вспыхивает, растёт плавно
      this.ghostT = (this.ghostT || 0) + dt;
      this.pulse = Math.max(0, (this.pulse || 0) - dt * 4);
      const want = GHOST_SCALE[this.stage - 1];
      this.scaleNow += (want - this.scaleNow) * Math.min(1, dt * 5);
      this.model.scale.setScalar(this.scaleNow * (1 + this.pulse * 0.15));
      this.model.position.y = 0.7 + Math.sin(this.ghostT * 2.4) * 0.35;
      this.ghostMat.emissiveIntensity = 0.35 + this.pulse * 0.8;
      this.ring.scale.setScalar(this.scaleNow);
      if (this.label) this.label.position.y = HEIGHT * this.scaleNow + 2;
    }
    this.ring.material.opacity = 0.75 + Math.sin(performance.now() / 300) * 0.15;
  }

  dispose() { this.scene.remove(this.root); this.mixer.stopAllAction(); }
}

/** Экранный джойстик слева (телефон). x/y в [-1, 1], y вверх = вперёд. */
export class Joystick {
  constructor(el) {
    this.el = el;
    this.x = 0; this.y = 0; this.active = false;
    if (!el) return;
    const coarse = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('joy');
    if (coarse) el.classList.add('show');
    this.knob = el.querySelector('i');
    const R = 46;
    let id = null, cx = 0, cy = 0, tap = null;
    const set = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.x = dx / R; this.y = -dy / R;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      if (tap && l > 16) tap = null;
    };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      el.setPointerCapture(id);
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this.active = true;
      set(e);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; this.active = false; this.x = 0; this.y = 0;
      this.knob.style.transform = '';
      el.style.transform = '';
      if (tap && e.type === 'pointerup' && performance.now() - tap.t < 300) tap.fn(tap.x, tap.y);
      tap = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    /** Джойстик появляется под пальцем там, где inZone(x, y); короткое нажатие без движения уходит в onTap (плиты под зоной). */
    this.floatIn = (canvas, inZone, onTap) => {
      addEventListener('pointerdown', (e) => {
        if (id !== null || e.pointerType === 'mouse' || e.target !== canvas || !inZone(e.clientX, e.clientY)) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${e.clientX - r.left - r.width / 2}px, ${e.clientY - r.top - r.height / 2}px)`;
        id = e.pointerId;
        el.setPointerCapture(id);
        cx = e.clientX; cy = e.clientY;
        this.active = true;
        tap = { fn: onTap, x: cx, y: cy, t: performance.now() };
      }, { capture: true });
    };
  }
}
