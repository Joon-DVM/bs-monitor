// BS 보호자 모니터 — 공통 로직 (상태 정의 · 저장소 · 알림음 · 유틸)
import { firebaseConfig, SETTINGS } from './config.js';
export { SETTINGS };

// ── 상태 정의 ────────────────────────────────────────────────
export const STATUS = {
  '상담대기중':   { group: 'wait',  color: '#b91c1c', bg: '#fee2e2' },
  '면회대기중':   { group: 'wait',  color: '#b91c1c', bg: '#fee2e2' },
  '원내':         { group: 'place', color: '#c2410c', bg: '#ffedd5' },
  '라운지':       { group: 'place', color: '#6d28d9', bg: '#ede9fe' },
  '외출':         { group: 'place', color: '#1d4ed8', bg: '#dbeafe' },
  '라운지콜완료': { group: 'call',  color: '#0f766e', bg: '#ccfbf1' },
  '외출콜완료':   { group: 'call',  color: '#0f766e', bg: '#ccfbf1' },
  '귀가':         { group: 'done',  color: '#475569', bg: '#e2e8f0' },
  '수납후미귀가': { group: 'done',  color: '#a16207', bg: '#fef3c7' },
  '1진료실':      { group: 'room',  color: '#15803d', bg: '#dcfce7' },
  '2진료실':      { group: 'room',  color: '#15803d', bg: '#dcfce7' },
  '3진료실':      { group: 'room',  color: '#15803d', bg: '#dcfce7' },
  '4진료실':      { group: 'room',  color: '#15803d', bg: '#dcfce7' },
};
export const BUTTON_ROWS = [
  ['상담대기중', '면회대기중', '원내', '라운지', '외출'],
  ['라운지콜완료', '외출콜완료', '귀가', '수납후미귀가'],
  ['1진료실', '2진료실', '3진료실', '4진료실'],
];
export const WAIT_STATUSES = ['상담대기중', '면회대기중'];
export const INITIAL_STATUS = '원내';
const GROUP_ORDER = { wait: 0, room: 1, call: 2, place: 3, done: 4 };
export const groupRank = (s) => GROUP_ORDER[(STATUS[s] || {}).group] ?? 9;

// ── 저장소 ───────────────────────────────────────────────────
// 값 자리에 NOW 를 넣으면 저장 시각(서버 시각)으로 바뀝니다.
export const NOW = { __now: true };

function resolveNow(v, nowVal) {
  if (v === NOW) return nowVal;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = {};
    for (const k in v) o[k] = resolveNow(v[k], nowVal);
    return o;
  }
  return v;
}
function setPath(obj, path, val) {
  const parts = path.split('/');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (val === null || val === undefined) delete cur[last];
  else cur[last] = val;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function createStore() {
  if (firebaseConfig) return createFirebaseStore();
  return createLocalStore();
}

// 데모 모드: 같은 브라우저 안의 탭·창·iframe 끼리만 공유됩니다.
function createLocalStore() {
  const KEY = 'bsm.demo.v1';
  let state = { patients: {}, ts: 0 };
  try { const s = localStorage.getItem(KEY); if (s) state = JSON.parse(s); } catch {}
  const listeners = new Set();
  const me = Math.random().toString(36).slice(2);
  const seen = new Set();
  let bc = null;
  try { bc = new BroadcastChannel('bsm-demo'); } catch {}

  function send(msg) {
    msg.from = me;
    msg.mid = me + ':' + Date.now() + ':' + Math.random();
    seen.add(msg.mid);
    try { bc && bc.postMessage(msg); } catch {}
    try { if (window.parent !== window) window.parent.postMessage({ bsm: msg }, '*'); } catch {}
  }
  function receive(msg) {
    if (!msg || msg.from === me || seen.has(msg.mid)) return;
    seen.add(msg.mid);
    if (msg.type === 'hello') send({ type: 'state', state });
    else if (msg.type === 'state' && msg.state && msg.state.ts > state.ts) {
      state = msg.state; persist(); emit();
    }
  }
  if (bc) bc.onmessage = (e) => receive(e.data);
  window.addEventListener('message', (e) => { if (e.data && e.data.bsm) receive(e.data.bsm); });
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { const s = JSON.parse(e.newValue); if (s.ts > state.ts) { state = s; emit(); } } catch {}
  });
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  function emit() { const p = clone(state.patients); listeners.forEach((f) => f(p)); }
  function commit() { state.ts = Date.now(); persist(); send({ type: 'state', state }); emit(); }
  setTimeout(() => send({ type: 'hello' }), 30);

  return {
    mode: 'demo',
    now: () => Date.now(),
    onPatients(cb) { listeners.add(cb); cb(clone(state.patients)); },
    onConnection(cb) { cb(true); },
    async add({ cat, owner, memo }) {
      const id = newId(); const t = Date.now();
      state.patients[id] = {
        cat, owner, memo: memo || '', status: INITIAL_STATUS, statusAt: t, createdAt: t,
        ackAt: null, call: null, log: { ['l' + t]: { s: INITIAL_STATUS, at: t } },
      };
      commit(); return id;
    },
    async update(id, fields, logStatus) {
      const p = state.patients[id]; if (!p) return;
      const t = Date.now();
      for (const k in fields) setPath(p, k, resolveNow(fields[k], t));
      if (logStatus) { p.log = p.log || {}; p.log['l' + t + Math.random().toString(36).slice(2, 5)] = { s: logStatus, at: t }; }
      commit();
    },
    async remove(id) { delete state.patients[id]; commit(); },
    async restore(id, p) { state.patients[id] = p; commit(); },
    async ping() { return 0; },
    auth: null,
  };
}

async function createFirebaseStore() {
  const CDN = 'https://www.gstatic.com/firebasejs/10.12.2';
  const [fa, fd, fau] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-database.js`),
    import(`${CDN}/firebase-auth.js`),
  ]);
  const app = fa.initializeApp(firebaseConfig);
  const db = fd.getDatabase(app);
  const auth = fau.getAuth(app);
  const { ref, onValue, push, set, update, remove, serverTimestamp } = fd;
  const ROOT = 'bsm/patients';
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });

  return {
    mode: 'firebase',
    now: () => Date.now() + offset,
    onPatients(cb, onError) { return onValue(ref(db, ROOT), (s) => cb(s.val() || {}), onError); },
    onConnection(cb) { onValue(ref(db, '.info/connected'), (s) => cb(!!s.val())); },
    async add({ cat, owner, memo }) {
      const r = push(ref(db, ROOT));
      const ts = serverTimestamp();
      await set(r, {
        cat, owner, memo: memo || '', status: INITIAL_STATUS, statusAt: ts, createdAt: ts,
        log: { l0: { s: INITIAL_STATUS, at: ts } },
      });
      return r.key;
    },
    async update(id, fields, logStatus) {
      const ts = serverTimestamp();
      const u = {};
      for (const k in fields) u[`${ROOT}/${id}/${k}`] = resolveNow(fields[k], ts) ?? null;
      if (logStatus) u[`${ROOT}/${id}/log/${push(ref(db)).key}`] = { s: logStatus, at: ts };
      await update(ref(db), u);
    },
    async remove(id) { await remove(ref(db, `${ROOT}/${id}`)); },
    async restore(id, p) { await set(ref(db, `${ROOT}/${id}`), p); },
    async ping() {
      const t = performance.now();
      await set(ref(db, 'bsm/ping'), serverTimestamp());
      return Math.round(performance.now() - t);
    },
    auth: {
      onAuth: (cb) => fau.onAuthStateChanged(auth, cb),
      signIn: () => fau.signInWithPopup(auth, new fau.GoogleAuthProvider()),
      signOut: () => fau.signOut(auth),
    },
  };
}

// ── 알림음 (Web Audio, 파일 없이 합성) ───────────────────────
export const Sound = {
  ctx: null,
  enabled: (() => { try { return localStorage.getItem('bsm.sound') !== '0'; } catch { return true; } })(),
  get ready() { return !!this.ctx && this.ctx.state === 'running'; },
  unlock() {
    try {
      if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
  },
  setEnabled(v) { this.enabled = v; try { localStorage.setItem('bsm.sound', v ? '1' : '0'); } catch {} },
  tone(freq, start, dur, type = 'sine', vol = 0.3) {
    const c = this.ctx, t0 = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  play(kind, force = false) {
    if ((!this.enabled && !force) || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const T = (f, s, d, ty, v) => this.tone(f, s, d, ty, v);
    if (kind === 'arrival') {        // 딩-동 딩-동 (내원)
      [[0, 880], [0.38, 698], [0.95, 880], [1.33, 698]].forEach(([s, f]) => { T(f, s, 1.0, 'sine', 0.4); T(f * 2, s, 0.35, 'sine', 0.08); });
    } else if (kind === 'call') {    // 삐삐삐 x2 (콜요청 → 리셉션)
      [0, 0.16, 0.32, 0.75, 0.91, 1.07].forEach((s) => T(1318, s, 0.12, 'square', 0.1));
    } else if (kind === 'chime') {   // 띵 (상태 변경)
      T(1046, 0, 0.7, 'sine', 0.28); T(1568, 0.12, 0.8, 'sine', 0.14);
    } else if (kind === 'done') {    // 도-솔 (콜완료)
      T(784, 0, 0.35, 'triangle', 0.3); T(1046, 0.16, 0.6, 'triangle', 0.3);
    }
  },
};

// 일정 간격으로 반복 울리는 알람 (확인 전까지)
export class RepeatingAlarm {
  constructor(kind) { this.kind = kind; this.timer = null; }
  update(active, ringNow = false) {
    if (active && (!this.timer || ringNow)) Sound.play(this.kind);
    if (active && !this.timer) this.timer = setInterval(() => Sound.play(this.kind), SETTINGS.alarmRepeatSec * 1000);
    if (!active && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

// ── 데스크톱 알림 (창이 가려져 있을 때) ──────────────────────
export function desktopNotify(title, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    const n = new Notification(title, { body, tag: title + body, requireInteraction: false });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}
export async function requestNotify() {
  try { if ('Notification' in window) return await Notification.requestPermission(); } catch {}
  return 'denied';
}
export const notifyState = () => { try { return ('Notification' in window) ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; } };

// ── 유틸 ─────────────────────────────────────────────────────
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const displayName = (p) => p.owner ? `${p.cat}(${p.owner})` : p.cat;
export function fmtClock(t) {
  if (!t) return '';
  const d = new Date(t); let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? '오전' : '오후'; h = h % 12 || 12;
  return `${ap} ${h}:${m}`;
}
export function fmtHM(t) { if (!t) return ''; const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
export function fmtElapsed(ms) {
  if (ms == null || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
export function fmtSec(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function waitLevel(p, now) {
  if (!WAIT_STATUSES.includes(p.status)) return '';
  const m = (now - (p.statusAt || now)) / 60000;
  if (m >= SETTINGS.waitAlertMin) return 'alert';
  if (m >= SETTINGS.waitWarnMin) return 'warn';
  return '';
}
export const logList = (p) => Object.values(p.log || {}).filter((l) => l && l.at).sort((a, b) => a.at - b.at);
export const isToday = (t, now) => { const a = new Date(t), b = new Date(now); return a.toDateString() === b.toDateString(); };

export function badgeStyle(s) {
  const st = STATUS[s] || { color: '#334155', bg: '#e2e8f0' };
  return `color:${st.color};background:${st.bg}`;
}

// 토스트
export function toast(msg, opts = {}) {
  let wrap = document.getElementById('toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (opts.action) {
    const b = document.createElement('button'); b.textContent = opts.action.label;
    b.onclick = () => { opts.action.run(); el.remove(); };
    el.appendChild(b);
  }
  wrap.appendChild(el);
  setTimeout(() => el.remove(), opts.ms || 4000);
}

// 알림음 켜기 안내 (브라우저 정책상 첫 클릭이 있어야 소리가 납니다)
export function soundGate(text) {
  const el = document.createElement('div');
  el.className = 'gate';
  el.innerHTML = `<div class="gate-box"><div class="gate-ico">🔊</div><div class="gate-t">${esc(text)}</div><div class="gate-s">브라우저 정책상 첫 클릭 후부터 알림음이 울립니다</div></div>`;
  const go = () => { Sound.unlock(); Sound.play('chime', true); el.remove(); };
  el.addEventListener('click', go);
  document.body.appendChild(el);
  // 이미 사용자 동작이 있었던 창이면 바로 해제 시도
  Sound.unlock();
  setTimeout(() => { if (Sound.ready) el.remove(); }, 300);
}

// 로그인 화면 (Firebase 모드)
export function loginScreen(store, title) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'gate';
    el.innerHTML = `<div class="gate-box"><div class="gate-t">${esc(title)}</div><div class="gate-s" id="lg-msg">병원 구글 계정으로 로그인하세요</div><button class="btn primary" id="lg-btn" style="margin-top:16px">구글 계정으로 로그인</button></div>`;
    document.body.appendChild(el);
    let done = false;
    store.auth.onAuth((u) => { if (u && !done) { done = true; el.remove(); resolve(u); } });
    el.querySelector('#lg-btn').onclick = async (e) => {
      e.stopPropagation(); Sound.unlock();
      try { await store.auth.signIn(); } catch (err) { el.querySelector('#lg-msg').textContent = '로그인 실패: ' + (err.code || err.message); }
    };
  });
}
