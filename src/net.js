/**
 * Связь с сервером командной игры: одно WebSocket-соединение на вкладку.
 * Токен игрока живёт в sessionStorage — при переходе «лобби → игра» и при обрыве связи
 * сервер узнаёт того же игрока и возвращает его место в комнате.
 */
export const COLORS = ['#ffd447', '#ff6f91', '#8fd0ff', '#9be37a', '#c7b0ff', '#ffa45c'];
export const EMOJIS = ['🦊', '🐱', '🐬', '🐢', '🦄', '🐝', '🐙', '🐸'];

export function me() {
  let m = {};
  try { m = JSON.parse(localStorage.getItem('tg.me') || '{}'); } catch (e) { /* */ }
  return {
    name: m.name || '',
    color: COLORS.includes(m.color) ? m.color : COLORS[0],
    emoji: EMOJIS.includes(m.emoji) ? m.emoji : EMOJIS[0],
  };
}
export function saveMe(m) { try { localStorage.setItem('tg.me', JSON.stringify(m)); } catch (e) { /* */ } }

const tokenKey = 'tg.token';
const getToken = () => { try { return sessionStorage.getItem(tokenKey) || ''; } catch (e) { return ''; } };
const setToken = (t) => { try { sessionStorage.setItem(tokenKey, t); } catch (e) { /* */ } };

export class Net {
  constructor() {
    this.handlers = {};
    this.id = 0;
    this.queue = [];
    this.closedByUs = false;
    this.retry = 0;
    this.open = false;
  }

  on(t, fn) { (this.handlers[t] ||= []).push(fn); return this; }
  emit(t, m) { for (const fn of this.handlers[t] || []) fn(m); }

  connect(profile) {
    this.profile = profile;
    // сервер командной игры: в Android-приложении (страницы из appassets) — spacecode.business/tails/play,
    // в браузере — рядом со страницей (/ws на корне или /tails/play/ws за nginx)
    const app = location.host.endsWith('androidplatform.net');
    const dir = location.pathname.replace(/[^/]*$/, '');
    const url = window.TAILS_WS || (app ? 'wss://spacecode.business/tails/play/ws'
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${dir}ws`);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', token: getToken(), ...this.profile }));
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'welcome') {
        this.id = m.id;
        setToken(m.token);
        const q = this.queue; this.queue = [];
        for (const x of q) ws.send(x);
      }
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      this.open = false;
      this.emit('down', {});
      if (this.closedByUs) return;
      const wait = Math.min(5000, 400 * 2 ** this.retry++);
      setTimeout(() => this.connect(this.profile), wait);
    };
    return new Promise((resolve) => { const h = () => resolve(this); this.on('welcome', h); });
  }

  send(m) {
    const s = JSON.stringify(m);
    if (this.ws && this.ws.readyState === 1 && this.id) this.ws.send(s);
    else if (m.t !== 'act' && m.t !== 'snap') this.queue.push(s);
  }

  close() { this.closedByUs = true; try { this.ws.close(); } catch (e) { /* */ } }
}
