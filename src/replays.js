/**
 * Записи гонок на телефоне: координаты всех гонщиков 10 раз в секунду и выстрелы. Хранятся в localStorage,
 * последние 10 штук: список — в tg.replays, сама запись — в tg.replay.<id>. На сервер ничего не уходит.
 */
const LIST = 'tg.replays', ITEM = (id) => `tg.replay.${id}`, KEEP = 10;

export const replays = {
  list() { try { return JSON.parse(localStorage.getItem(LIST) || '[]'); } catch (e) { return []; } },
  get(id) { try { return JSON.parse(localStorage.getItem(ITEM(id)) || 'null'); } catch (e) { return null; } },
  /** Сохранить (или обновить ту же запись). Не хватает места — выбрасываем самые старые. */
  save(rec) {
    const meta = { id: rec.id, at: rec.at, name: rec.name, place: rec.place, time: rec.time, n: rec.riders.length };
    let list = [meta, ...this.list().filter((x) => x.id !== rec.id)];
    for (const old of list.slice(KEEP)) localStorage.removeItem(ITEM(old.id));
    list = list.slice(0, KEEP);
    const data = JSON.stringify(rec);
    for (;;) {
      try {
        localStorage.setItem(ITEM(rec.id), data);
        localStorage.setItem(LIST, JSON.stringify(list));
        return true;
      } catch (e) {
        if (list.length <= 1) return false;
        localStorage.removeItem(ITEM(list.pop().id));
      }
    }
  },
  remove(id) { localStorage.removeItem(ITEM(id)); localStorage.setItem(LIST, JSON.stringify(this.list().filter((x) => x.id !== id))); },
};
