/**
 * Лобби командной игры: ник/цвет, список открытых игр, вход по коду, создание игры, комната ожидания.
 */
import { MAPS, resolveLevel } from './levels.js';
import { Net, me, saveMe, COLORS, EMOJIS } from './net.js';
import { myLevels, decode } from './custom.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const profile = me();
if (!profile.name) profile.name = `Игрок ${Math.floor(10 + Math.random() * 89)}`;
saveMe(profile);

/* ── кто ты ── */
$('name').value = profile.name;
$('name').addEventListener('change', () => { profile.name = $('name').value.trim().slice(0, 14) || profile.name; saveMe(profile); rehello(); });
const swatches = (host, list, key, render) => {
  host.innerHTML = list.map((v) => `<button type="button" data-v="${v}" ${key === 'color' ? `style="background:${v}"` : ''}>${render(v)}</button>`).join('');
  const mark = () => host.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === profile[key]));
  host.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; profile[key] = b.dataset.v; saveMe(profile); mark(); rehello(); };
  mark();
};
swatches($('colors'), COLORS, 'color', () => '');
swatches($('emojis'), EMOJIS, 'emoji', (v) => v);

/* ── выбор карты и уровня ── */
const my = myLevels.list();
const fromEditor = qs.get('map') === 'custom' && qs.get('code') && decode(qs.get('code')) ? qs.get('code') : null;
$('map').innerHTML = Object.values(MAPS).map((m) => `<option value="${m.id}">${m.emoji} ${m.name}</option>`).join('')
  + (my.length || fromEditor ? '<option value="custom">🛠 Мои уровни</option>' : '');
function fillLevels() {
  const m = $('map').value;
  if (m === 'custom') {
    const items = [...(fromEditor ? [{ code: fromEditor, name: decode(fromEditor).name + ' (из редактора)' }] : []), ...my];
    $('level').innerHTML = items.map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('');
  } else {
    $('level').innerHTML = MAPS[m].levels.map((l) => `<option value="${l.id}">${l.id}. ${l.name}${l.players ? ` (игроков ${l.players})` : ''}</option>`).join('');
  }
}
$('map').onchange = fillLevels;
if (fromEditor) $('map').value = 'custom';
if (qs.get('map') && MAPS[qs.get('map')]) $('map').value = qs.get('map');
fillLevels();
if (qs.get('level') && $('map').value !== 'custom') $('level').value = qs.get('level');

/* ── сеть ── */
const net = new Net();
let room = null;
const err = (t) => { $('err').textContent = t || ''; };
function rehello() { if (net.open) net.send({ t: 'hello', token: sessionStorage.getItem('tg.token'), ...profile }); }

const mapName = (r) => (r.map === 'custom' ? '🛠 Свой уровень' : `${MAPS[r.map]?.emoji || ''} ${MAPS[r.map]?.name || r.map}`);
const levelName = (r) => r.levelName || (resolveLevel(r.map, r.level, r.lv) || {}).name || '';

net.on('rooms', (m) => {
  $('games').innerHTML = m.rooms.length ? m.rooms.map((r) => `
    <div class="game" data-code="${r.code}">
      <div class="what"><b>${mapName(r)} · ${esc(levelName(r))}</b><br><span class="empty">ведёт ${esc(r.host)} · код ${r.code}</span></div>
      <span>👫 ${r.n}/${r.max}</span>
      <span class="st ${r.status}">${r.status === 'wait' ? 'ждут' : 'идёт'}</span>
      <button class="btn" data-join="${r.code}" ${r.n >= r.max ? 'disabled' : ''}>Присоединиться</button>
    </div>`).join('') : '<div class="empty">Пока никто не играет. Создай игру — она появится здесь!</div>';
});
$('games').onclick = (e) => { const b = e.target.closest('[data-join]'); if (b) join(b.dataset.join); };

net.on('room', (m) => {
  room = m.room;
  showRoom();
  if (room.status === 'play') go();
});
net.on('start', () => go());
net.on('error', (m) => err(m.msg));
net.on('left', () => { room = null; showRoom(); });
net.on('down', () => err('Нет связи с сервером — переподключаемся…'));
net.on('welcome', () => { err(''); net.send({ t: 'list' }); });

function go() { location.href = `play.html?room=${room.code}${qs.has('debug') ? '&debug' : ''}`; }

function showRoom() {
  $('room-panel').hidden = !room;
  $('lobby-main').style.display = room ? 'none' : 'contents';
  if (!room) return;
  $('room-code').textContent = room.code;
  $('room-where').textContent = `· ${mapName(room)} · ${levelName(room)}${room.pub ? '' : ' · только по коду'}`;
  $('room-players').innerHTML = room.players.map((p) => `<span class="p${p.online ? '' : ' off'}" style="--c:${p.color}">
    ${p.emoji} ${esc(p.name)}${p.id === room.host ? ' 👑' : ''}${p.id === net.id ? ' (ты)' : ''}</span>`).join('')
    + `<span class="empty">${room.players.length}/4</span>`;
  const host = room.host === net.id;
  $('btn-start').hidden = !host;
  $('room-wait').hidden = host;
}

function join(code) {
  code = String(code || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(code)) { err('Код — 4 буквы или цифры'); return; }
  err('');
  net.send({ t: 'join', code });
}
$('btn-join').onclick = () => join($('join-code').value);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('join-code').value); });
$('btn-create').onclick = () => {
  const map = $('map').value;
  const pub = document.querySelector('input[name=vis]:checked').value === 'pub';
  if (map === 'custom') net.send({ t: 'create', map: 'custom', lv: $('level').value, pub });
  else net.send({ t: 'create', map, level: Number($('level').value), pub });
};
$('btn-start').onclick = () => net.send({ t: 'start' });
$('btn-leave').onclick = () => net.send({ t: 'leave' });

await net.connect(profile);
if (qs.get('join')) join(qs.get('join'));
