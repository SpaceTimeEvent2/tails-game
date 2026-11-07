/**
 * Корабли для гонки: три своих треугольных формы, нос по +Z. Плоские грани из вершин — корпус выглядит рубленым.
 * Общие для гонки (race.js) и профиля (profile.js), где корабль выбирают.
 */
import * as THREE from 'three';
import { itemById } from './shop.js';

export const SHIP_IDS = ['wedge', 'arrow', 'delta'];
export const SHIPS = {
  wedge: { name: 'Клин', svg: 'M12 1 L22 22 L12 18 L2 22 Z' },
  arrow: { name: 'Стрела', svg: 'M12 0 L17 21 L12 17 L7 21 Z M5 23 L7 16 L8 23 Z M19 23 L17 16 L16 23 Z' },
  delta: { name: 'Дельта', svg: 'M12 4 L23 20 L15 17 L12 21 L9 17 L1 20 Z' },
};
/** Иконка формы сверху для кнопок выбора. */
export const shipIcon = (id, color = '#fff') => `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="${SHIPS[id].svg}" fill="${color}" stroke="#06192b" stroke-width="1" stroke-linejoin="round"/></svg>`;

function facets(tris) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
/** Корпус-пирамида: нос N, задние углы L и R, гребень T, киль B. */
const hullOf = (N, L, R, T, B) => facets([[N, R, T], [N, T, L], [N, B, R], [N, L, B], [L, T, B], [T, R, B]]);

const GEO = {};
function geometry(id) {
  if (GEO[id]) return GEO[id];
  let g;
  if (id === 'arrow') {
    const hull = hullOf([0, 0, 4.3], [-1.15, 0, -2], [1.15, 0, -2], [0, 0.5, -2], [0, -0.36, -2]);
    const fin = (s) => facets([[[s * 0.95, 0, -2], [s * 0.95, 1.05, -2.35], [s * 0.95, 0, -0.7]]]);
    g = { hull, paint: [fin(1), fin(-1), box(0.5, 0.16, 2.2, 0, 0.36, -0.5)], metal: [], glass: [box(0.42, 0.18, 0.9, 0, 0.42, 1.0)],
      engines: [[-0.45, 0.05, 0.16], [0.45, 0.05, 0.16]] };
  } else if (id === 'delta') {
    const hull = hullOf([0, 0, 2.7], [-2.55, 0, -1.9], [2.55, 0, -1.9], [0, 0.42, -1.3], [0, -0.3, -1.3]);
    const dome = new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.7, 1.5); dome.translate(0, 0.25, 0.2);
    const tip = (s) => facets([[[s * 2.55, 0, -1.9], [s * 1.7, 0, -1.35], [s * 2.4, 0.5, -2.05]]]);
    g = { hull, paint: [tip(1), tip(-1), box(3.2, 0.1, 0.35, 0, 0.12, -1.25)], metal: [], glass: [dome],
      engines: [[-1.15, 0.05, 0.17], [1.15, 0.05, 0.17], [0, 0.12, 0.2]] };
  } else {
    // клин: длинный нос, ступенчатая рубка на корме
    const hull = hullOf([0, 0, 3.7], [-1.95, 0, -2.1], [1.95, 0, -2.1], [0, 0.62, -2.1], [0, -0.42, -2.1]);
    const stripe = facets([[[0, 0.14, 2.7], [0.2, 0.47, -0.9], [-0.2, 0.47, -0.9]]]);
    g = { hull, paint: [stripe, box(1.5, 0.3, 1.1, 0, 0.62, -1.45)], metal: [box(0.85, 0.32, 0.6, 0, 0.92, -1.62), box(1.25, 0.14, 0.26, 0, 1.15, -1.66)],
      glass: [box(1.05, 0.06, 0.02, 0, 1.15, -1.52)], engines: [[0, 0.08, 0.2], [-0.72, 0.02, 0.14], [0.72, 0.02, 0.14]] };
  }
  g.edges = new THREE.EdgesGeometry(g.hull, 1);
  return (GEO[id] = g);
}

const METAL = new THREE.MeshStandardMaterial({ color: 0xc9d0dc, roughness: 0.55, metalness: 0.35, flatShading: true, side: THREE.DoubleSide });
const GLASS = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

/* ── ачивки (src/shop.js): крылья и эмблема на рубке ── */
const WING = {
  'wings-twin': () => { const g = []; for (const s of [1, -1]) for (const [y, z] of [[0.1, -0.6], [0.45, -1.4]]) g.push(facets([[[s * 0.8, y, z + 0.7], [s * 3.1, y, z - 0.5], [s * 0.9, y, z - 0.6]]])); return g; },
  'wings-fins': () => [1, -1].map((s) => facets([[[s * 0.5, 0.2, -0.4], [s * 0.7, 1.7, -2.2], [s * 0.6, 0.2, -2]]])),
};
const glyphTex = new Map();
function emblem(glyph) {
  if (!glyphTex.has(glyph)) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.font = '100px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(glyph, 64, 70);
    glyphTex.set(glyph, new THREE.CanvasTexture(c));
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: glyphTex.get(glyph), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.62, 0.7);
  return m;
}

/** Корабль в цвете игрока; engines — где у него сопла (x, y, радиус), сопла на z = −2. kit — надетые ачивки. */
export function makeShip(id, color, outline = 0xffffff, kit = {}) {
  const g = geometry(SHIP_IDS.includes(id) ? id : 'wedge');
  const ship = new THREE.Group();
  const paintIt = itemById(kit.paint), hull = paintIt ? new THREE.MeshStandardMaterial({ color: new THREE.Color(paintIt.color), roughness: paintIt.metal ? 0.25 : 0.55,
    metalness: paintIt.metal ? 0.9 : 0.3, flatShading: true, side: THREE.DoubleSide, emissive: new THREE.Color(paintIt.glow ? paintIt.color : 0), emissiveIntensity: paintIt.glow ? 0.45 : 0 }) : METAL;
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, flatShading: true, side: THREE.DoubleSide, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
  ship.add(new THREE.Mesh(g.hull, hull));
  for (const p of g.paint) ship.add(new THREE.Mesh(p, paint));
  for (const p of g.metal) ship.add(new THREE.Mesh(p, hull));
  for (const p of g.glass) ship.add(new THREE.Mesh(p, GLASS));
  if (WING[kit.wings]) for (const w of WING[kit.wings]()) ship.add(new THREE.Mesh(w, paint));
  const em = itemById(kit.emblem);
  if (em) ship.add(emblem(em.glyph));
  ship.add(new THREE.LineSegments(g.edges, new THREE.LineBasicMaterial({ color: new THREE.Color(outline), transparent: true, opacity: 0.8 })));
  ship.userData.engines = g.engines;
  return ship;
}

const flameGeo = new THREE.ConeGeometry(0.34, 1, 10);
flameGeo.translate(0, 0.5, 0);
flameGeo.rotateX(-Math.PI / 2);         // основание у сопла, острие назад, по −Z
/** Реактивные струи из сопел корабля: цвет игрока или купленный след; радужный переливается. set(k) — длина 0..3. */
export function addFlames(ship, color, kit = {}) {
  const tr = itemById(kit.trail);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(tr && tr.color ? tr.color : color), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const group = new THREE.Group();
  for (const [x, y, k] of ship.userData.engines) {
    const f = new THREE.Mesh(flameGeo, mat);
    f.position.set(x, y, 0);
    f.scale.set(k / 0.34, k / 0.34, 1);
    group.add(f);
  }
  group.position.z = -2.1;
  ship.add(group);
  const rainbow = tr && tr.id === 'trail-rainbow';
  return { group, set(len) { group.scale.set(1, 1, len); if (rainbow) mat.color.setHSL((performance.now() / 1500) % 1, 1, 0.6); } };
}
