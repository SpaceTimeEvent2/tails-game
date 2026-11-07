/** Каталог ачивок для корабля (без логики баллов): его читают профиль, сеть, гонка и сервер. */
/** Ачивки для корабля: что купил — то можно надеть в мастерской. */
export const SHOP = [
  { id: 'paint-gold', kind: 'paint', name: 'Золотой корпус', icon: '🟡', price: 60, color: '#ffcf3a', metal: true },
  { id: 'paint-chrome', kind: 'paint', name: 'Хром', icon: '⚪', price: 45, color: '#e8eef6', metal: true },
  { id: 'paint-neon', kind: 'paint', name: 'Неоновый', icon: '🟣', price: 30, color: '#ff4fd8', glow: true },
  { id: 'paint-night', kind: 'paint', name: 'Ночной', icon: '⚫', price: 25, color: '#2a2f4a' },
  { id: 'wings-twin', kind: 'wings', name: 'Двойные крылья', icon: '🪽', price: 40 },
  { id: 'wings-fins', kind: 'wings', name: 'Плавники', icon: '🦈', price: 30 },
  { id: 'trail-rainbow', kind: 'trail', name: 'Радужный след', icon: '🌈', price: 60 },
  { id: 'trail-blue', kind: 'trail', name: 'Синее пламя', icon: '🔵', price: 20, color: '#4fb8ff' },
  { id: 'trail-green', kind: 'trail', name: 'Зелёное пламя', icon: '🟢', price: 20, color: '#5cff7a' },
  { id: 'emblem-star', kind: 'emblem', name: 'Звезда', icon: '⭐', price: 20, glyph: '⭐' },
  { id: 'emblem-bolt', kind: 'emblem', name: 'Молния', icon: '⚡', price: 20, glyph: '⚡' },
  { id: 'emblem-fox', kind: 'emblem', name: 'Лисёнок', icon: '🦊', price: 35, glyph: '🦊' },
  { id: 'badge-builder', kind: 'badge', name: 'Значок «Строитель»', icon: '🏗️', price: 80 },
  { id: 'badge-ace', kind: 'badge', name: 'Значок «Ас гонки»', icon: '🏆', price: 120 },
];
export const SLOTS = ['paint', 'wings', 'trail', 'emblem', 'badge'];
export const itemById = (id) => SHOP.find((x) => x.id === id) || null;

/** Надетое на корабль: { paint, wings, trail, emblem, badge } → строка для сети «paint-gold,wings-twin» (только известные id). */
export const kitString = (kit) => SLOTS.map((s) => kit && kit[s]).filter((id) => itemById(id)).join(',');
export function parseKit(str) {
  const kit = {};
  for (const id of String(str || '').split(',').slice(0, SLOTS.length)) { const it = itemById(id); if (it) kit[it.kind] = it.id; }
  return kit;
}

