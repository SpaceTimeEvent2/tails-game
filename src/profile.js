/** Профиль: кто твой персонаж, какого он цвета, как тебя зовут. Всё сохраняется сразу и видно другим в командной игре. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { me, saveMe, COLORS, EMOJIS, TINTS, HERO_IDS } from './net.js';
import { Runner, HEROES, loadRunnerModel } from './runner.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
if (qs.get('back') === 'lobby') { $('back').href = 'lobby.html'; $('back').textContent = '← В лобби'; }
const profile = me();

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: qs.has('debug') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(0, 3.2, 11);
camera.lookAt(0, 2.3, 0);
scene.add(new THREE.HemisphereLight(0xdff4ff, 0x4a6a58, 1.6));
const sun = new THREE.DirectionalLight(0xfff4d8, 2.4);
sun.position.set(4, 8, 6);
scene.add(sun);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let runner = null, drawId = 0;
async function draw() {
  const id = ++drawId;
  $('stage-hint').textContent = 'Загружаем…';
  await loadRunnerModel(loader, profile.hero);
  if (id !== drawId) return;
  if (runner) runner.dispose();
  runner = new Runner(scene, { color: profile.color, hero: profile.hero, tint: profile.tint, me: true });
  runner.dance(600);
  $('stage-hint').textContent = profile.hero === 'ghost' ? 'Призрак: в игре растёт за ракушки, как замок' : HEROES[profile.hero].name;
}
const save = () => { saveMe(profile); };

const mark = (host, v) => host.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
function pick(host, list, key, html, redraw) {
  host.innerHTML = list.map(html).join('');
  mark(host, profile[key]);
  host.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    profile[key] = b.dataset.v;
    mark(host, profile[key]);
    save();
    if (redraw) draw();
  };
}
pick($('heroes'), HERO_IDS, 'hero', (v) => `<button type="button" data-v="${v}">${HEROES[v].emoji} ${HEROES[v].name}</button>`, true);
pick($('tints'), TINTS, 'tint', (v) => (v ? `<button type="button" data-v="${v}" style="background:${v}" aria-label="цвет"></button>` : '<button type="button" data-v="" class="none" title="Как есть"></button>'), true);
pick($('colors'), COLORS, 'color', (v) => `<button type="button" data-v="${v}" style="background:${v}" aria-label="кольцо"></button>`, true);
pick($('emojis'), EMOJIS, 'emoji', (v) => `<button type="button" data-v="${v}">${v}</button>`, false);
$('name').value = profile.name;
$('name').addEventListener('input', () => { profile.name = $('name').value.trim().slice(0, 14); save(); });

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  const dt = Math.min(clock.getDelta(), 0.1);
  if (runner) { runner.yaw += dt * 0.5; runner.root.rotation.y = runner.yaw; runner.update(dt); }
  renderer.render(scene, camera);
}
try { await draw(); } catch (e) { console.error(e); $('stage-hint').textContent = 'Не получилось загрузить персонажа'; }
tick();
if (qs.has('debug')) window.__pf = { profile, get runner() { return runner; } };
