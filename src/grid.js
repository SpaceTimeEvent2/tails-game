/**
 * Сетка поля: для «Открытого поля» (лабиринт из подружек) и для редактора уровней.
 * Клетка — квадрат CELL×CELL, ширина дорожки в игре ≈ 6.2, поэтому CELL = 6.
 * Без THREE: используется и в браузере, и в симуляторе, и на сервере.
 */
export const CELL = 6;

export class Grid {
  /** w×h клеток с центром поля в (0,0). */
  constructor(w, h, cell = CELL) {
    this.w = w; this.h = h; this.cell = cell;
    this.x0 = -((w - 1) * cell) / 2;
    this.z0 = -((h - 1) * cell) / 2;
  }
  idx(i, j) { return j * this.w + i; }
  ij(k) { return [k % this.w, Math.floor(k / this.w)]; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  center(k) { const [i, j] = this.ij(k); return [this.x0 + i * this.cell, this.z0 + j * this.cell]; }
  cellAt(x, z) {
    const i = Math.round((x - this.x0) / this.cell), j = Math.round((z - this.z0) / this.cell);
    return this.inside(i, j) ? this.idx(i, j) : -1;
  }
  neighbors(k) {
    const [i, j] = this.ij(k);
    const out = [];
    if (i > 0) out.push(k - 1);
    if (i < this.w - 1) out.push(k + 1);
    if (j > 0) out.push(k - this.w);
    if (j < this.h - 1) out.push(k + this.w);
    return out;
  }

  /**
   * A* от start до goal по проходимым клеткам (passable(k) → bool), 4 соседа, эвристика — манхэттен.
   * Возвращает массив индексов клеток или null, если пути нет.
   */
  astar(start, goal, passable) {
    if (start < 0 || goal < 0) return null;
    const [gi, gj] = this.ij(goal);
    const hfun = (k) => { const [i, j] = this.ij(k); return Math.abs(i - gi) + Math.abs(j - gj); };
    const g = new Map([[start, 0]]);
    const from = new Map();
    const open = [[hfun(start), 0, start]];     // [f, порядок, клетка] — маленькая куча на массиве
    let order = 0;
    const closed = new Set();
    while (open.length) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0] || (open[q][0] === open[bi][0] && open[q][1] < open[bi][1])) bi = q;
      const [, , k] = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (k === goal) {
        const path = [k];
        let c = k;
        while (from.has(c)) { c = from.get(c); path.push(c); }
        return path.reverse();
      }
      if (closed.has(k)) continue;
      closed.add(k);
      for (const n of this.neighbors(k)) {
        if (n !== goal && !passable(n)) continue;
        const ng = g.get(k) + 1;
        if (ng < (g.get(n) ?? Infinity)) { g.set(n, ng); from.set(n, k); open.push([ng + hfun(n), order++, n]); }
      }
    }
    return null;
  }

  /**
   * Поле расстояний до цели (BFS от домика): тени в «Открытом поле» идут по убыванию расстояния —
   * так при постройке пересчитывается маршрут сразу у всех теней, а не у каждой отдельно.
   */
  flow(goal, passable) {
    const dist = new Int32Array(this.w * this.h).fill(-1);
    dist[goal] = 0;
    const q = [goal];
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      for (const n of this.neighbors(k)) {
        if (dist[n] >= 0 || !passable(n)) continue;
        dist[n] = dist[k] + 1;
        q.push(n);
      }
    }
    return dist;
  }

  /** Ломаная по центрам клеток без лишних точек на прямых участках. */
  polyline(cells) {
    const pts = cells.map((k) => this.center(k));
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) > 1e-9) out.push(b);
    }
    if (pts.length > 1) out.push(pts[pts.length - 1]);
    return out;
  }
}
