#!/usr/bin/env node
/**
 * Перенос анимаций с большой модели (скелет Mixamo, кости «mixamorig:*», метры) на персонажа
 * tiny-dancer (скелет Meshy, кости без префикса, сантиметры под Armature ×0.01).
 *
 *   node tools/retarget-anims.mjs ИСТОЧНИК.glb [--base tools/src/tiny-dancer.base.glb] [--out assets/characters/tiny-dancer.glb]
 *
 * Как переносим (позы покоя у скелетов разные, поэтому прямое копирование кручёных кватернионов
 * выворачивает кости):
 *   1. Обе модели раскладываем в мировые повороты костей в позе покоя: Rs (источник), Rt (цель).
 *   2. Для каждого кадра источника считаем мировой поворот кости Gs(t) и «отклонение от покоя»
 *      D(t) = Gs(t) · Rs⁻¹ — то же самое отклонение применяем к цели: Gt(t) = D(t) · Rt.
 *   3. Обратно в локальные: qt(t) = Gt(родитель)⁻¹ · Gt(t).
 *   4. Бёдра (Hips): смещение от позы покоя × (высота бёдер цели / высота бёдер источника) —
 *      чтобы персонаж не «летал» и не проваливался.
 *   Кости, которых у цели нет, пропускаем (их вклад уже учтён в мировых поворотах детей).
 * Проверка: источник и цель оба имеют Walking/Running — переносим и сравниваем с родными клипами
 * цели (средняя угловая ошибка по костям печатается).
 * GUID-клипы получают имена по содержанию (просмотрены покадрово, см. RENAME), мусор — отбрасываем.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three/build/three.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = args.find((a) => a.endsWith('.glb') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const BASE = opt('--base', path.join(ROOT, 'tools/src/tiny-dancer.base.glb'));
const OUT = opt('--out', path.join(ROOT, 'assets/characters/tiny-dancer.glb'));
const FPS = 30;
const ONLY_CHECK = args.includes('--check');

/**
 * Имена клипов: понятные по содержанию. null — отбросить.
 * GUID-клипы просмотрены покадрово (tools/anim-preview.html, кадры в ~/tails-shots/anim-*.png).
 */
export const RENAME = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/anim-names.json'), 'utf8'));
delete RENAME._comment;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// имена костей Mixamo → Meshy (где отличаются не только префиксом)
const ALIAS = { Spine1: 'Spine01', Spine2: 'Spine02', Neck: 'neck', HeadTop_End: 'head_end' };
const strip = (n) => { const b = n.replace(/^mixamorig\d*:/, ''); return ALIAS[b] || b; };

/* ── скелет: родители и поза покоя ── */
function skeleton(doc) {
  const nodes = doc.getRoot().listNodes();
  const parent = new Map();
  for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const byName = new Map(joints.map((j) => [strip(j.getName()), j]));
  // мировые повороты/позиции в покое (с учётом всех предков, включая Armature)
  const restWorldQ = new Map();
  const worldQ = (n) => {
    if (restWorldQ.has(n)) return restWorldQ.get(n);
    const q = new THREE.Quaternion(...n.getRotation());
    const p = parent.get(n);
    const w = p ? worldQ(p).clone().multiply(q) : q;
    restWorldQ.set(n, w);
    return w;
  };
  for (const j of joints) worldQ(j);
  return { joints, byName, parent, restWorldQ };
}

/* ── выборка трека в момент t ── */
function sampler(channel) {
  const s = channel.getSampler();
  const times = s.getInput().getArray();
  const vals = s.getOutput().getArray();
  const n = channel.getTargetPath() === 'rotation' ? 4 : 3;
  return (t) => {
    let i = 0;
    while (i < times.length - 1 && times[i + 1] < t) i++;
    const j = Math.min(times.length - 1, i + 1);
    const k = times[j] > times[i] ? Math.max(0, Math.min(1, (t - times[i]) / (times[j] - times[i]))) : 0;
    if (n === 4) {
      const a = new THREE.Quaternion().fromArray(vals, i * 4), b = new THREE.Quaternion().fromArray(vals, j * 4);
      return a.slerp(b, k);
    }
    return new THREE.Vector3().fromArray(vals, i * 3).lerp(new THREE.Vector3().fromArray(vals, j * 3), k);
  };
}

/** Клип источника → для каждого момента мировые повороты костей (по имени без префикса) и смещение бёдер. */
function sampleSource(src, anim) {
  const tracks = new Map();   // node → {rotation, translation}
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    if (!tracks.has(node)) tracks.set(node, {});
    tracks.get(node)[ch.getTargetPath()] = sampler(ch);
  }
  const dur = Math.max(...anim.listChannels().map((c) => c.getSampler().getInput().getMax([])[0]));
  const frames = [];
  const nF = Math.max(2, Math.round(dur * FPS) + 1);
  for (let f = 0; f < nF; f++) {
    const t = Math.min(dur, f / FPS);
    const world = new Map();
    const wq = (n) => {
      if (world.has(n)) return world.get(n);
      const tr = tracks.get(n);
      const q = tr && tr.rotation ? tr.rotation(t) : new THREE.Quaternion(...n.getRotation());
      const p = src.parent.get(n);
      const w = p ? wq(p).clone().multiply(q) : q;
      world.set(n, w);
      return w;
    };
    const out = new Map();
    for (const j of src.joints) out.set(strip(j.getName()), wq(j));
    const hips = src.byName.get('Hips');
    const ht = tracks.get(hips)?.translation;
    frames.push({ t, world: out, hipsT: ht ? ht(t) : new THREE.Vector3(...hips.getTranslation()) });
  }
  return { dur, frames };
}

/**
 * Поправка на разницу поз покоя (T-поза у Mixamo, A-поза у Meshy): у обеих моделей есть один и тот же
 * клип Walking — на его кадрах считаем для каждой кости C = Gs⁻¹ · Gt (как повернуть оси кости
 * источника, чтобы получились оси кости цели). Дальше Gt(t) = Gs(t) · C.
 */
let CALIB = null;
function calibrate(src, dst, srcAnim, dstAnim) {
  const sampledS = sampleSource(src, srcAnim);
  const tracks = new Map();
  for (const ch of dstAnim.listChannels()) if (ch.getTargetPath() === 'rotation') tracks.set(strip(ch.getTargetNode().getName()), sampler(ch));
  const acc = new Map();
  const frames = sampledS.frames.filter((_, i) => i % 2 === 0);
  for (const fr of frames) {
    const cache = new Map();
    const world = (name) => {
      if (cache.has(name)) return cache.get(name);
      const node = dst.byName.get(name);
      const p = dst.parent.get(node);
      const pn = p && strip(p.getName());
      const pw = p ? (dst.byName.has(pn) ? world(pn) : dst.restWorldQ.get(p) || new THREE.Quaternion(...p.getRotation())) : new THREE.Quaternion();
      const loc = tracks.has(name) ? tracks.get(name)(fr.t) : new THREE.Quaternion(...node.getRotation());
      const w = pw.clone().multiply(loc);
      cache.set(name, w);
      return w;
    };
    for (const n of dst.byName.keys()) {
      if (!fr.world.has(n)) continue;
      const c = fr.world.get(n).clone().invert().multiply(world(n));
      if (!acc.has(n)) acc.set(n, []);
      acc.get(n).push(c);
    }
  }
  // среднее кватернионов (все близки друг к другу): выравниваем знак и нормируем сумму
  CALIB = new Map();
  for (const [n, list] of acc) {
    const m = new THREE.Vector4();
    for (const q of list) { const sgn = q.dot(list[0]) < 0 ? -1 : 1; m.x += q.x * sgn; m.y += q.y * sgn; m.z += q.z * sgn; m.w += q.w * sgn; }
    CALIB.set(n, new THREE.Quaternion(m.x, m.y, m.z, m.w).normalize());
  }
}

/** Мировые повороты источника → локальные повороты цели. */
function retarget(src, dst, sampled) {
  const names = [...dst.byName.keys()].filter((n) => src.byName.has(n));
  const hipsS = src.byName.get('Hips'), hipsT = dst.byName.get('Hips');
  const restS = new THREE.Vector3(...hipsS.getTranslation()), restT = new THREE.Vector3(...hipsT.getTranslation());
  // высота бёдер в мировых единицах: у цели Armature ×0.01 → переводим в локальные единицы родителя бёдер
  const ratio = restT.y / restS.y;
  const rot = new Map(names.map((n) => [n, []]));
  const hipsPos = [];
  for (const fr of sampled.frames) {
    const gt = new Map();
    for (const n of names) {
      if (CALIB && CALIB.has(n)) { gt.set(n, fr.world.get(n).clone().multiply(CALIB.get(n))); continue; }
      const D = fr.world.get(n).clone().multiply(src.restWorldQ.get(src.byName.get(n)).clone().invert());
      gt.set(n, D.multiply(dst.restWorldQ.get(dst.byName.get(n))));
    }
    for (const n of names) {
      const node = dst.byName.get(n);
      const p = dst.parent.get(node);
      let pw;
      if (p && dst.byName.has(strip(p.getName())) && gt.has(strip(p.getName()))) pw = gt.get(strip(p.getName()));
      else pw = p ? dst.restWorldQ.get(p) || new THREE.Quaternion(...p.getRotation()) : new THREE.Quaternion();
      const local = pw.clone().invert().multiply(gt.get(n)).normalize();
      rot.get(n).push(local);
    }
    hipsPos.push(restT.clone().add(fr.hipsT.clone().sub(restS).multiplyScalar(ratio)));
  }
  // знак кватернионов — непрерывный (иначе slerp крутит «через спину»)
  for (const list of rot.values()) for (let i = 1; i < list.length; i++) if (list[i].dot(list[i - 1]) < 0) list[i].set(-list[i].x, -list[i].y, -list[i].z, -list[i].w);
  return { names, rot, hipsPos, times: sampled.frames.map((f) => f.t) };
}

/** Сравнить перенесённый клип с родным клипом цели (средний угол между мировыми поворотами, градусы). */
function compare(dst, dstAnim, rt) {
  const tracks = new Map();
  for (const ch of dstAnim.listChannels()) if (ch.getTargetPath() === 'rotation') tracks.set(strip(ch.getTargetNode().getName()), sampler(ch));
  let sum = 0, n = 0;
  const per = new Map();
  for (let f = 0; f < rt.times.length; f += 3) {
    const t = rt.times[f];
    const wN = new Map(), wR = new Map();
    const world = (name, getLocal, cache) => {
      if (cache.has(name)) return cache.get(name);
      const node = dst.byName.get(name);
      const p = dst.parent.get(node);
      const pn = p && strip(p.getName());
      const pw = p ? (dst.byName.has(pn) ? world(pn, getLocal, cache) : dst.restWorldQ.get(p) || new THREE.Quaternion(...p.getRotation())) : new THREE.Quaternion();
      const w = pw.clone().multiply(getLocal(name));
      cache.set(name, w);
      return w;
    };
    for (const name of rt.names) {
      const a = world(name, (nm) => (tracks.has(nm) ? tracks.get(nm)(t) : new THREE.Quaternion(...dst.byName.get(nm).getRotation())), wN);
      const b = world(name, (nm) => (rt.rot.has(nm) ? rt.rot.get(nm)[f] : new THREE.Quaternion(...dst.byName.get(nm).getRotation())), wR);
      const ang = THREE.MathUtils.radToDeg(a.angleTo(b));
      sum += ang; n++;
      per.set(name, (per.get(name) || 0) + ang);
    }
  }
  const worst = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v / (rt.times.length / 3)).toFixed(0)}°`);
  return { mean: sum / n, worst };
}

/* ── запуск ── */
if (!SRC) { console.error('укажи исходный .glb с анимациями'); process.exit(1); }
const srcDoc = await io.read(SRC);
const dstDoc = await io.read(BASE);
const src = skeleton(srcDoc), dst = skeleton(dstDoc);
const missing = [...dst.byName.keys()].filter((n) => !src.byName.has(n));
const extra = [...src.byName.keys()].filter((n) => !dst.byName.has(n));
console.log(`кости: у цели ${dst.byName.size}, у источника ${src.byName.size}; нет в источнике: ${missing.join(', ') || '—'}; лишние в источнике: ${extra.join(', ') || '—'}`);

const dstAnims = new Map(dstDoc.getRoot().listAnimations().map((a) => [a.getName(), a]));
const srcWalk = srcDoc.getRoot().listAnimations().find((x) => x.getName() === 'Walking');
if (srcWalk && dstAnims.has('Walking') && !args.includes('--no-calib')) {
  for (const name of ['Running']) {     // без поправки — для сравнения
    const a = srcDoc.getRoot().listAnimations().find((x) => x.getName() === name);
    const c = compare(dst, dstAnims.get(name), retarget(src, dst, sampleSource(src, a)));
    console.log(`без поправки поз покоя ${name}: ${c.mean.toFixed(1)}°`);
  }
  calibrate(src, dst, srcWalk, dstAnims.get('Walking'));
  console.log('поправка поз покоя посчитана по общему клипу Walking (проверка — по Running, он в калибровке не участвует)');
}
for (const name of ['Walking', 'Running']) {
  const a = srcDoc.getRoot().listAnimations().find((x) => x.getName() === name);
  if (!a || !dstAnims.has(name)) continue;
  const rt = retarget(src, dst, sampleSource(src, a));
  const c = compare(dst, dstAnims.get(name), rt);
  console.log(`проверка ${name}: средняя разница с родным клипом цели ${c.mean.toFixed(1)}°, больше всего: ${c.worst.join(', ')}`);
}
if (ONLY_CHECK) process.exit(0);

const buf = dstDoc.getRoot().listBuffers()[0];
let added = 0;
for (const a of srcDoc.getRoot().listAnimations()) {
  const name = a.getName();
  const to = Object.prototype.hasOwnProperty.call(RENAME, name) ? RENAME[name] : name;
  if (!to) { console.log(`  ✗ ${name} — отброшен`); continue; }
  if (dstAnims.has(to)) { console.log(`  = ${name} — у персонажа уже есть свой «${to}»`); continue; }
  const rt = retarget(src, dst, sampleSource(src, a));
  const anim = dstDoc.createAnimation(to);
  const input = dstDoc.createAccessor().setType('SCALAR').setArray(new Float32Array(rt.times)).setBuffer(buf);
  for (const n of rt.names) {
    const arr = new Float32Array(rt.rot.get(n).length * 4);
    rt.rot.get(n).forEach((q, i) => q.toArray(arr, i * 4));
    const out = dstDoc.createAccessor().setType('VEC4').setArray(arr).setBuffer(buf);
    const s = dstDoc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(dstDoc.createAnimationChannel().setTargetNode(dst.byName.get(n)).setTargetPath('rotation').setSampler(s));
  }
  const parr = new Float32Array(rt.hipsPos.length * 3);
  rt.hipsPos.forEach((v, i) => v.toArray(parr, i * 3));
  const pout = dstDoc.createAccessor().setType('VEC3').setArray(parr).setBuffer(buf);
  const ps = dstDoc.createAnimationSampler().setInput(input).setOutput(pout).setInterpolation('LINEAR');
  anim.addSampler(ps).addChannel(dstDoc.createAnimationChannel().setTargetNode(dst.byName.get('Hips')).setTargetPath('translation').setSampler(ps));
  added++;
  console.log(`  + ${name}${to !== name ? ' → ' + to : ''} (${rt.times.length} кадров, ${rt.names.length} костей)`);
}

await dstDoc.transform(resample({ tolerance: 1e-4 }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, dstDoc);
const size = fs.statSync(OUT).size;
console.log(`добавлено клипов: ${added}; клипы: ${dstDoc.getRoot().listAnimations().map((a) => a.getName()).join(', ')}`);
console.log(`→ ${path.relative(ROOT, OUT)}: ${(size / 1024 / 1024).toFixed(2)} МБ`);
