/**
 * Управление сценой с планшета: один палец — вращение, два — щипок приближает, а скручивание вращает, кнопки ⟲ ⟳ — вращение без жестов.
 * Нажатие считается нажатием, только если палец почти не двигался и второго пальца не было: поворот не задевает плиты.
 */
import * as THREE from 'three';

const TAP_SLOP = { mouse: 8, touch: 16, pen: 12 };
const up = new THREE.Vector3(0, 1, 0), off = new THREE.Vector3();

export function touchCamera(canvas, camera, controls, { left, right } = {}) {
  const fingers = new Map();
  let twist = null, tapFrom = null, spoiled = false, hold = 0, last = 0;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse) controls.rotateSpeed = 1.15;     // большой экран: палец проходит больше, поворот не должен быть вялым

  const spin = (a) => {
    off.copy(camera.position).sub(controls.target).applyAxisAngle(up, a);
    camera.position.copy(controls.target).add(off);
  };
  const angle = () => { const [a, b] = [...fingers.values()]; return Math.atan2(b.y - a.y, b.x - a.x); };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) { twist = angle(); spoiled = true; }
    }
    if (!tapFrom && !spoiled) tapFrom = { x: e.clientX, y: e.clientY, type: e.pointerType };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2 && twist !== null) {
      const now = angle();
      let d = now - twist;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      twist = now;
      if (Math.abs(d) < 0.5) spin(d);          // скручивание по часовой — сцена идёт за пальцами
    }
  });
  const lift = (e) => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) twist = null;
    if (!fingers.size) setTimeout(() => { spoiled = false; tapFrom = null; }, 0);
  };
  addEventListener('pointerup', lift);
  addEventListener('pointercancel', lift);

  // кнопки: пока держишь — сцена вращается
  const tick = (t) => {
    if (!hold) return;
    spin(hold * Math.min(0.05, (t - last) / 1000) * 1.5);
    last = t;
    requestAnimationFrame(tick);
  };
  const bind = (el, dir) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); hold = dir; last = performance.now(); requestAnimationFrame(tick); });
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(n, () => { hold = 0; });
  };
  bind(left, 1);
  bind(right, -1);

  return {
    spin,
    /** Вызвать из pointerup холста: это было нажатие, а не поворот? */
    isTap(e) {
      if (spoiled || !tapFrom) return false;
      return Math.hypot(e.clientX - tapFrom.x, e.clientY - tapFrom.y) <= (TAP_SLOP[tapFrom.type] || 8);
    },
  };
}
