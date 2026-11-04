/**
 * Множители командной игры по числу игроков (1–4).
 * Посчитаны симулятором tools/balance.mjs, обоснование и таблицы — docs/BALANCE.md.
 *   hp     — здоровье каждой тени (подобрано бисекцией: средний запас домика как у одного игрока);
 *            у уровня может быть своё level.teamHp = [2 игрока, 3, 4] — тогда берётся оно (точнее под уровень)
 *   count  — сколько теней в волне
 *   shells — стартовые ракушки КАЖДОГО игрока (доля от level.shells)
 *   bounty — награда за тень, которую получает КАЖДЫЙ игрок команды
 *   bonus  — бонус за пройденную волну, тоже каждому
 */
export const TEAM = {
  1: { n: 1, hp: 1, count: 1, shells: 1, bounty: 1, bonus: 1 },
  2: { n: 2, hp: 1.45, count: 1.3, shells: 0.8, bounty: 0.7, bonus: 0.8 },
  3: { n: 3, hp: 1.7, count: 1.6, shells: 0.7, bounty: 0.55, bonus: 0.7 },
  4: { n: 4, hp: 1.85, count: 1.9, shells: 0.6, bounty: 0.45, bonus: 0.6 },
};

export const teamMult = (n) => TEAM[Math.max(1, Math.min(4, n | 0))] || TEAM[1];
