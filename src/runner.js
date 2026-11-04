/**
 * Бегающий персонаж (assets/characters/tiny-dancer.glb): скелетные клипы Walking/Running,
 * плюс перенесённые из большой модели «стройка», прыжок, танец (tools/retarget-anims.mjs).
 * Свой — управляется WASD/стрелками или экранным джойстиком; чужие (в командной игре) —
 * плавно догоняют позицию из снимков хоста. Различие игроков — цветное кольцо под ногами и ник.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const RUNNER_URL = 'assets/characters/tiny-dancer.glb';
const HEIGHT = 4.6;
const MAX_SPEED = 11;           // ед/с при полном отклонении
const WALK_SPEED_AT = 0.55;     // до этой доли — шаг, дальше — бег

let SRC = null;                 // { gltf, scale }

export async function loadRunnerModel(loader) {
  if (SRC) return SRC;
  const gltf = await loader.loadAsync(RUNNER_URL);
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  SRC = { gltf, scale: HEIGHT / Math.max(0.001, size.y) };
  return SRC;
}
export const runnerClips = () => (SRC ? SRC.gltf.animations.map((a) => a.name) : []);

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

const ONE_SHOT = { jump: ['Jump', '360_Power_Spin_Jump'], build: ['Hammer', 'Heavy_Hammer_Swing'], dance: ['Dance', 'All_Night_Dance'],
                   cheer: ['Cheer', 'Dance'], sad: ['Kneel_Idle'] };

export class Runner {
  constructor(scene, { color = '#ffd447', name = '', me = false } = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();       // для подпрыгивания без клипа
    this.root.add(this.body);
    this.model = cloneSkinned(SRC.gltf.scene);
    this.model.scale.setScalar(SRC.scale);
    this.body.add(this.model);
    this.hips = null;
    this.model.traverse((o) => {
      if (o.isBone && !this.hips && /hips/i.test(o.name)) this.hips = o;
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of SRC.gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
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
    this.hop = -1;
    this._v = new THREE.Vector3();
    scene.add(this.root);
  }

  /** Своя ходьба: dir — единичный вектор (или 0), mag — 0..1. */
  move(dir, mag, dt, radius = 50) {
    if (this.shot && this.shotLock && mag > 0) this.endShot();
    const k = Math.min(1, dt * 8);
    this.speedK += (mag - this.speedK) * k;
    if (mag > 0.02) {
      const p = this.root.position;
      p.x += dir.x * MAX_SPEED * this.speedK * dt;
      p.z += dir.z * MAX_SPEED * this.speedK * dt;
      const r = Math.hypot(p.x, p.z);
      if (r > radius) { p.x *= radius / r; p.z *= radius / r; }
      const want = Math.atan2(dir.x, dir.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.root.rotation.y = this.yaw;
    this.blend(this.speedK);
  }

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

  jump() { if (!this.playShot('jump', { lock: false })) this.hop = 0; else this.hop = 0; }
  build() { this.playShot('build'); }
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
    if (this.hop >= 0) {                 // прыжок-подскок (если клипа нет — он и есть прыжок)
      this.hop += dt / 0.6;
      this.body.position.y = Math.sin(Math.min(1, this.hop) * Math.PI) * (this.clipFor('jump') ? 0.6 : 2.4);
      if (this.hop >= 1) { this.hop = -1; this.body.position.y = 0; }
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
    let id = null, cx = 0, cy = 0;
    const set = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.x = dx / R; this.y = -dy / R;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
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
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
