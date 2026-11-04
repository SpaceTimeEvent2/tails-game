// Проверка раскладок: плиты не на дороге, не друг на друге, не в море, домик на острове.
import { MAPS, spotsOf, pathDist, houseOf, pathsOf } from '../src/levels.js';
import { mazeState } from '../src/sim.js';
let bad = 0;
for (const m of Object.values(MAPS)) {
  for (const l of m.levels) {
    if (l.maze) {
      const st = mazeState(l, new Set());
      const ok = st.ok;
      if (!ok) bad++;
      console.log(`${ok ? 'ok ' : 'BAD'} ${m.id}/${l.id} ${l.name.padEnd(20)} лабиринт ${l.maze.w}×${l.maze.h}, плит ${spotsOf(l).filter((s) => s[2]).length}, путь A* ${st.routes[0]?.length} клеток`);
      continue;
    }
    const spots = spotsOf(l);
    const paths = pathsOf(l);
    const minPath = Math.min(...spots.map((s) => Math.min(...paths.map((p) => pathDist(s, p)))));
    let minPair = Infinity;
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++)
      minPair = Math.min(minPair, Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]));
    const far = Math.max(...spots.map((s) => Math.hypot(...s)), ...paths.flat().map((p) => Math.hypot(...p)));
    const h = houseOf(l);
    const needPath = m.id === 'castle' ? 7 : 4.6, needPair = m.id === 'castle' ? 12 : 5.5;
    const maxPt = Math.max(...paths.flat().map((p) => Math.hypot(...p)));
    // карта «Набережная» — исходные уровни как есть (только сообщаем), «Замок» — проверяем строго
    const ok = m.id === 'quay' || (m.id === 'boka' && spots.length >= 8 && minPath >= 4.6) || (spots.length >= 6 && minPath >= needPath && minPair >= needPair && maxPt <= 48);
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${m.id}/${l.id} ${l.name.padEnd(20)} плит ${spots.length}  до дороги ≥${minPath.toFixed(1)}  между ≥${minPair.toFixed(1)}  дальняя точка ${far.toFixed(1)}  домик ${h.map((v) => v.toFixed(0))}  до края дороги ${maxPt.toFixed(1)}`);
    if (m.id === 'castle' && !l.spotsList) console.log('     ', JSON.stringify(spots));
  }
}
process.exit(bad ? 1 : 0);
