/**
 * Корабли для гонки: три своих треугольных формы, нос по +Z. Плоские грани из вершин — корпус выглядит рубленым.
 * Общие для гонки (race.js) и профиля (profile.js), где корабль выбирают.
 */
import * as THREE from 'three';

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

/** Корабль в цвете игрока; engines — где у него сопла (x, y, радиус), сопла на z = −2. */
export function makeShip(id, color, outline = 0xffffff) {
  const g = geometry(SHIP_IDS.includes(id) ? id : 'wedge');
  const ship = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, flatShading: true, side: THREE.DoubleSide, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
  ship.add(new THREE.Mesh(g.hull, METAL));
  for (const p of g.paint) ship.add(new THREE.Mesh(p, paint));
  for (const p of g.metal) ship.add(new THREE.Mesh(p, METAL));
  for (const p of g.glass) ship.add(new THREE.Mesh(p, GLASS));
  ship.add(new THREE.LineSegments(g.edges, new THREE.LineBasicMaterial({ color: new THREE.Color(outline), transparent: true, opacity: 0.8 })));
  ship.userData.engines = g.engines;
  return ship;
}
