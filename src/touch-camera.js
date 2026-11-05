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
  // поворот считается от высоты экрана: на телефоне лёжа дрожание пальца иначе уводит камеру на десятки градусов
  if (coarse) controls.rotateSpeed = innerHeight < 520 ? 0.6 : 1.15;

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

/**
 * Кнопки срабатывают в момент касания: браузер не присылает click, пока другой палец держит джойстик,
 * поэтому по click нельзя было прыгать на бегу. Настоящий click после касания гасится, иначе нажатие сработает дважды.
 */
export function instantPress(box) {
  let until = 0;
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    e.preventDefault();
    until = Infinity;
    b.click();
  });
  addEventListener('pointerup', () => { if (until === Infinity) until = performance.now() + 500; });
  addEventListener('pointercancel', () => { if (until === Infinity) until = performance.now() + 500; });
  box.addEventListener('click', (e) => {
    if (e.isTrusted && performance.now() < until) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

/**
 * Касание холста рядом с кнопками не трогает камеру. Рядом с кнопкой из near — нажимает её (промах по «Прыжку»
 * всё равно прыжок), рядом с остальными ничего не запускает: волну случайно не отправить. Короткое нажатие уходит в onTap.
 */
export function thumbZone(canvas, box, { near = [], onTap, margin = 36 } = {}) {
  let swallowUntil = 0;
  box.addEventListener('click', (e) => {
    if (e.isTrusted && performance.now() < swallowUntil) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target !== canvas) return;
    let best = null, bd = margin;
    for (const b of box.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      if (!r.width) continue;
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      if (d <= bd) { bd = d; best = b; }
    }
    if (!best) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    swallowUntil = performance.now() + 800;     // браузер сам притягивает нажатие к ближайшей кнопке и шлёт ей click
    if (near.includes(best)) { if (!best.disabled) best.click(); return; }
    const { pointerId: id, clientX: x, clientY: y } = e;
    const up = (u) => {
      if (u.pointerId !== id) return;
      removeEventListener('pointerup', up);
      if (onTap && Math.hypot(u.clientX - x, u.clientY - y) <= TAP_SLOP.touch) onTap(x, y);
    };
    addEventListener('pointerup', up);
  }, { capture: true });
}
