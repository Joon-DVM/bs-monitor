// BS 보호자 모니터 — 공통 로직 (상태 정의 · 저장소 · 알림음 · 유틸)
import { firebaseConfig, SETTINGS, authProxyHosts } from './config.js';
export { SETTINGS };

// ── 상태 정의 ────────────────────────────────────────────────
export const STATUS = {
  '진료대기중':   { group: 'wait',  color: '#b91c1c', bg: '#fee2e2' },
  '면회대기중':   { group: 'wait',  color: '#b91c1c', bg: '#fee2e2' },
  // 의국에서 면회대기중 알림을 확인하면 자동으로 바뀌는 상태 (리셉션 버튼에는 없음)
  '면회중':       { group: 'meet',  color: '#be185d', bg: '#fce7f3' },
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
  ['진료대기중', '면회대기중', '원내', '라운지', '외출'],
  ['라운지콜완료', '외출콜완료', '귀가', '수납후미귀가'],
  ['1진료실', '2진료실', '3진료실', '4진료실'],
];
export const WAIT_STATUSES = ['진료대기중', '면회대기중'];
// 이름이 바뀐 상태 (예전 기록도 새 이름으로 표시)
const RENAMED = { '상담대기중': '진료대기중' };
const ren = (s) => RENAMED[s] || s;
export function normalizePatients(data) {
  for (const p of Object.values(data || {})) {
    if (!p) continue;
    p.status = ren(p.status);
    if (p.alert && p.alert.status) p.alert.status = ren(p.alert.status);
    for (const l of Object.values(p.log || {})) if (l && l.s) l.s = ren(l.s);
  }
  return data;
}
export const INITIAL_STATUS = '원내';
const GROUP_ORDER = { wait: 0, room: 1, meet: 1, call: 2, place: 3, done: 4 };
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
// 동선 기록 한 줄: '상태' 또는 { s: '상태', undo: true } (귀가 되돌리기 표시)
const logEntry = (x) => (typeof x === 'string' ? { s: x } : { ...x });
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function createStore() {
  const forceDemo = new URLSearchParams(location.search).has('demo');
  if (firebaseConfig && !forceDemo) return createFirebaseStore();
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
  const callListeners = new Set();
  function emit() {
    const p = normalizePatients(clone(state.patients)); listeners.forEach((f) => f(p));
    const c = clone(state.calls || {}); callListeners.forEach((f) => f(c));
  }
  function commit() { state.ts = Date.now(); persist(); send({ type: 'state', state }); emit(); }
  setTimeout(() => send({ type: 'hello' }), 30);

  return {
    mode: 'demo',
    now: () => Date.now(),
    onPatients(cb) { listeners.add(cb); cb(normalizePatients(clone(state.patients))); },
    onConnection(cb) { cb(true); },
    async add({ cat, owner, memo, vet }) {
      const id = newId(); const t = Date.now();
      state.patients[id] = {
        cat, owner, memo: memo || '', vet: vet || '', status: INITIAL_STATUS, statusAt: t, createdAt: t,
        ackAt: null, call: null, log: { ['l' + t]: { s: INITIAL_STATUS, at: t } },
      };
      commit(); return id;
    },
    async update(id, fields, logStatus) {
      const p = state.patients[id]; if (!p) return;
      const t = Date.now();
      for (const k in fields) setPath(p, k, resolveNow(fields[k], t));
      if (logStatus) { p.log = p.log || {}; p.log['l' + t + Math.random().toString(36).slice(2, 5)] = { ...logEntry(logStatus), at: t }; }
      commit();
    },
    async remove(id) { delete state.patients[id]; commit(); },
    async restore(id, p) { state.patients[id] = p; commit(); },
    async ping() { return 0; },
    // 통화 요청 (플로우 연동)
    onCalls(cb) { callListeners.add(cb); cb(clone(state.calls || {})); },
    async ensureCall(id, obj) { state.calls = state.calls || {}; if (state.calls[id]) return; state.calls[id] = resolveNow(obj, Date.now()); commit(); },
    async updateCall(id, fields) { const c = (state.calls || {})[id]; if (!c) return; const t = Date.now(); for (const k in fields) setPath(c, k, resolveNow(fields[k], t)); commit(); },
    async tryLease() { return false; },
    // 여러 건을 한 번에: { patients: {id: null}, calls: {id: 값 또는 null} }
    async bulk({ patients = {}, calls = {}, visits = {} }) {
      state.visits = state.visits || {};
      for (const k in visits) state.visits[k] = visits[k];
      for (const id in patients) if (patients[id] === null) delete state.patients[id];
      state.calls = state.calls || {};
      for (const id in calls) { if (calls[id] === null) delete state.calls[id]; else state.calls[id] = calls[id]; }
      commit();
    },
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
  // 로그인 창을 우리 주소(/__/auth, vercel.json 에서 Firebase 로 연결)에서 열어
  // 팝업 차단·쿠키 차단 브라우저에서도 로그인이 되도록 합니다.
  const cfg = { ...firebaseConfig };
  if ((authProxyHosts || []).includes(location.host)) cfg.authDomain = location.host;
  const app = fa.initializeApp(cfg);
  const db = fd.getDatabase(app);
  const auth = fau.getAuth(app);
  const provider = new fau.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // 다른 페이지로 이동해서 로그인하고 돌아온 경우 결과 처리
  const redirectError = fau.getRedirectResult(auth).then(() => null, (e) => e);
  const { ref, onValue, push, set, update, remove, serverTimestamp, runTransaction } = fd;
  const ROOT = 'bsm/patients';
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });

  return {
    mode: 'firebase',
    now: () => Date.now() + offset,
    onPatients(cb, onError) { return onValue(ref(db, ROOT), (s) => cb(normalizePatients(s.val() || {})), onError); },
    onConnection(cb) { onValue(ref(db, '.info/connected'), (s) => cb(!!s.val())); },
    async add({ cat, owner, memo, vet }) {
      const r = push(ref(db, ROOT));
      const ts = serverTimestamp();
      await set(r, {
        cat, owner, memo: memo || '', vet: vet || '', status: INITIAL_STATUS, statusAt: ts, createdAt: ts,
        log: { l0: { s: INITIAL_STATUS, at: ts } },
      });
      return r.key;
    },
    async update(id, fields, logStatus) {
      const ts = serverTimestamp();
      const u = {};
      for (const k in fields) u[`${ROOT}/${id}/${k}`] = resolveNow(fields[k], ts) ?? null;
      if (logStatus) u[`${ROOT}/${id}/log/${push(ref(db)).key}`] = { ...logEntry(logStatus), at: ts };
      await update(ref(db), u);
    },
    async remove(id) { await remove(ref(db, `${ROOT}/${id}`)); },
    async restore(id, p) { await set(ref(db, `${ROOT}/${id}`), p); },
    // 통화 요청 (플로우 연동)
    onCalls(cb) { return onValue(ref(db, 'bsm/calls'), (s) => cb(s.val() || {})); },
    async ensureCall(id, obj) {
      const ts = serverTimestamp();
      await runTransaction(ref(db, `bsm/calls/${id}`), (cur) => (cur === null ? resolveNow(obj, ts) : undefined));
    },
    async updateCall(id, fields) {
      const ts = serverTimestamp(); const u = {};
      for (const k in fields) u[`bsm/calls/${id}/${k}`] = resolveNow(fields[k], ts) ?? null;
      await update(ref(db), u);
    },
    async bulk({ patients = {}, calls = {}, visits = {} }) {
      const u = {};
      for (const k in visits) u[`bsm/visits/${k}`] = visits[k];
      for (const id in patients) u[`${ROOT}/${id}`] = patients[id];
      for (const id in calls) u[`bsm/calls/${id}`] = calls[id];
      if (Object.keys(u).length) await update(ref(db), u);
    },
    // 여러 PC 중 한 대만 일정 간격으로 작업하도록 (성공하면 true)
    async tryLease(name, ms) {
      const r = await runTransaction(ref(db, `bsm/lease/${name}`), (cur) => {
        const now = Date.now() + offset;
        if (cur && now - cur < ms) return undefined;
        return now;
      });
      return r.committed;
    },
    async ping() {
      const t = performance.now();
      await set(ref(db, 'bsm/ping'), serverTimestamp());
      return Math.round(performance.now() - t);
    },
    auth: {
      onAuth: (cb) => fau.onAuthStateChanged(auth, cb),
      redirectError,
      async signIn() {
        try { return await fau.signInWithPopup(auth, provider); }
        catch (e) {
          // 팝업이 막히면 화면 전환 방식으로 로그인
          if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) {
            return fau.signInWithRedirect(auth, provider);
          }
          throw e;
        }
      },
      signInRedirect: () => fau.signInWithRedirect(auth, provider),
      idToken: () => (auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null)),
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
// ── 플로우 통화요청 메시지 해석 ──
// 형식: [입원/]보호자(고양이[/전화번호]) - 용건 [/ 담당 선생님]   (+ 다음 줄 '*메모')
// '<오늘 통화요청건>' 아래 줄은 남은 건 정리 목록이라 제외, '<내일 …>' 아래 줄은 '내일' 요청으로 표시
const CALL_RE = /^(입원\s*\/\s*)?([^()\/]+?)\s*\(\s*([^)\/]+?)\s*(?:\/\s*([^)]*?))?\s*\)\s*[-–]\s*(.+)$/;
// 손으로 쓰다 생기는 흔한 실수도 알아봄: 전각 괄호·대시, 전화번호 뒤 ')' 빠짐
const CALL_RE_LOOSE = /^(입원\s*\/\s*)?([^()\/]+?)\s*\(\s*([^)\/]+?)\s*\/\s*(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})\s*\)?\s*[-–]\s*(.+)$/;
function matchCallLine(line) {
  const t = line.replace(/（/g, '(').replace(/）/g, ')').replace(/[－—―]/g, '-');
  return t.match(CALL_RE) || t.match(CALL_RE_LOOSE);
}
export function parseFlowTime(s) {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : (Date.parse(s) || 0);
}
export function parseCallMessage(msg) {
  const text = String(msg.text || '');
  if (/^\s*(✅|↪|\[BS모니터\])/.test(text) || msg.sender === 'BS모니터') return [];
  const out = [];
  let header = '', lastReq = null;
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(/^<\s*(.+?)\s*>$/);
    if (h) { header = h[1]; lastReq = null; return; }
    if (line.startsWith('*')) { if (lastReq) lastReq.note = (lastReq.note ? lastReq.note + '\n' : '') + line.replace(/^\*\s*/, ''); return; }
    const m = matchCallLine(line);
    if (!m || /오늘/.test(header)) { lastReq = null; return; }
    let rest = m[5].trim(), doctor = '';
    const k = rest.lastIndexOf('/');
    if (k >= 0) { doctor = rest.slice(k + 1).trim(); rest = rest.slice(0, k).trim(); }
    lastReq = {
      owner: m[2].trim(), pet: m[3].trim(), phone: (m[4] || '').trim(), reason: rest, doctor,
      inpatient: !!m[1], tomorrow: /내일/.test(header), note: '',
    };
    out.push(lastReq);
  });
  return out.map((r, i) => ({ ...r, id: msg.id + (i ? '_' + i : ''), msgId: msg.id, sender: msg.sender || '', at: parseFlowTime(msg.at) }));
}

// 조용한 내원 (config.js silentNames): 알림·경과 시간 표시 안 함
export function isSilent(p) {
  if (!p) return false;
  const text = `${p.cat || ''} ${p.owner || ''}`.replace(/\s+/g, '');
  return (SETTINGS.silentNames || []).some((words) => words.length && words.every((w) => text.includes(String(w).replace(/\s+/g, ''))));
}
// '2시간 52분째' / '3분째' / '방금'
export function fmtStay(ms) { return (ms == null || ms < 60000) ? '방금' : fmtElapsed(ms) + '째'; }
// 내원 후 경과 + 마지막 상태 변경 후 경과
export function stayParts(p, now) {
  return {
    visit: `내원 후 ${fmtStay(now - visitStart(p))}`,
    status: `${statusLabel(p)} 후 ${fmtStay(now - (p.statusAt || now))}`,
    level: waitLevel(p, now),
  };
}
export function waitLevel(p, now) {
  if (!WAIT_STATUSES.includes(p.status)) return '';
  const m = (now - (p.statusAt || now)) / 60000;
  if (m >= SETTINGS.waitAlertMin) return 'alert';
  if (m >= SETTINGS.waitWarnMin) return 'warn';
  return '';
}
export const logList = (p) => Object.values(p.log || {}).filter((l) => l && l.at).sort((a, b) => a.at - b.at);
// 화면에 보여줄 동선
// - 첫 기록은 '내원'
// - 잠깐 거쳐 가는 상태(config transientStatuses, 원내 포함)는 마지막(현재) 상태일 때만 표시
// - 지난 진료실: 한 번이면 '진료/상담'(config pastRoomLabel), 두 번 이상이면 첫 번째 '진료/검사', 이후 '검사후 상담'
// - 숨긴 뒤 같은 상태가 연달아 남으면 하나로 합침 (먼저 시각 유지, 진료실은 재입실이므로 합치지 않음)
// 이번 방문의 기록만: 마지막 '귀가' 이후 (귀가를 되돌린 경우는 같은 방문으로 이어짐)
function visitLogs(p) {
  const all = logList(p);
  const logs = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].s === '귀가' && all[i + 1] && all[i + 1].undo) { i++; continue; }  // 되돌린 귀가: 둘 다 건너뜀
    logs.push(all[i]);
  }
  let start = 0;
  logs.forEach((l, i) => { if (l.s === '귀가' && i < logs.length - 1) start = i + 1; });
  return logs.slice(start);
}
// 막 내원해서 아직 상태가 한 번도 바뀌지 않았을 때의 표시
export const ARRIVAL_LABEL = '내원/진료준비중';
// 진료실을 거친 뒤 '원내'로 돌아온 경우의 표시 (지금 원내일 때만, 지나면 동선에서 숨김)
export const AFTER_ROOM_LABEL = '진료후 원내 대기중';
// 내원 후 진료실을 아직 거치지 않고 (라운지·외출 등에서) '원내'로 돌아온 경우의 표시
export const BEFORE_ROOM_LABEL = '원내(진료전)';
const hadRoomBefore = (logs, i) => logs.slice(0, i).some((l) => STATUS[l.s]?.group === 'room');
export function statusLabel(p) {
  if (!p) return '';
  if (isSilent(p)) return p.status;
  if (STATUS[p.status]?.group === 'room') { const lg = visitLogs(p); return hadMeetBefore(lg, lg.length - 1) ? AFTER_MEET_ROOM_LABEL : p.status; }
  if (p.status !== INITIAL_STATUS) return p.status;
  const logs = visitLogs(p);
  if (logs.length <= 1) return ARRIVAL_LABEL;
  return hadRoomBefore(logs, logs.length) ? AFTER_ROOM_LABEL : BEFORE_ROOM_LABEL;
}

// 대기 알림: 진료대기중·면회대기중으로 바뀔 때마다 새 알림 (p.alert = {at, status, ackAt, holdAt, holdAuto})
// 지금 상태와 같은 대기 알림만 유효 (다른 상태로 바뀌면 자동으로 끝)
export function alertOf(p) {
  const a = p && p.alert;
  return a && a.status === p.status && WAIT_STATUSES.includes(p.status) && !isSilent(p) ? a : null;
}
// 대기 알림 확인(완료): 면회대기중이면 상태를 '면회중'으로 바꾸고 기록에 남김 (면회 시간은 이때부터 계산)
export const MEET_STATUS = '면회중';
export const ackLabel = (p) => (alertOf(p)?.status === '면회대기중' ? '✓ 면회시작 · 보호자 안으로' : '✓ 완료');
// 원장님(특수 대상)은 맨 위 한 줄 전체, 그다음 다른 환자
export const silentFirst = (a, b) => isSilent(b) - isSilent(a);
export function ackAlert(store, id, p) {
  const a = alertOf(p); if (!a || a.ackAt) return;
  if (p.status === '면회대기중') return store.update(id, { 'alert/ackAt': NOW, status: MEET_STATUS, statusAt: NOW }, MEET_STATUS);
  return store.update(id, { 'alert/ackAt': NOW });
}
export const isAlertPending = (p) => { const a = alertOf(p); return !!a && !a.ackAt && !a.holdAt; };
export const isAlertHeld = (p) => { const a = alertOf(p); return !!a && !a.ackAt && !!a.holdAt; };
export const alertKey = (id, p) => `${id}:${(p && p.alert && p.alert.at) || ''}`;

// 이번 방문 시작 시각 (귀가 후 다시 원내로 바뀌면 그 시각)
export function visitStart(p) {
  const v = visitLogs(p);
  return (v[0] && v[0].at) || p.createdAt || Date.now();
}
export function routeSteps(p) {
  // 원장님 등 특수 대상: 동선 기록 없이 지금 상태만 (원내·라운지·외출·귀가 …)
  if (isSilent(p)) return [{ at: p.statusAt || p.createdAt, label: p.status, first: true }];
  const logs = visitLogs(p);
  const transient = SETTINGS.transientStatuses || [];
  const out = [];
  // 진료실 방문이 한 번이면 '진료/상담', 두 번 이상이면 첫 번째 '진료/검사', 이후 '검사후 상담'
  // 면회(면회대기중·면회중) 뒤의 진료실은 '면회 후 상담' (지금이든 지난 것이든), 그 진료실은 위 횟수에서 뺌
  const isRoom = (l) => STATUS[l.s]?.group === 'room';
  const roomCount = logs.filter((l, i) => isRoom(l) && !hadMeetBefore(logs, i)).length;
  let roomNo = 0, meetBreak = true;
  logs.forEach((l, i) => {
    if (!isMeet(l.s) && i > 0) meetBreak = true;
    const first = i === 0, last = i === logs.length - 1;
    const room = isRoom(l);
    const afterMeet = room && hadMeetBefore(logs, i);
    if (room && !afterMeet) roomNo++;
    // 지난 진료실은 위 이름으로, 지금 진료실이면 실제 이름 (1진료실 등)
    const pastRoom = roomCount < 2 ? (SETTINGS.pastRoomLabel || l.s) : roomNo === 1 ? FIRST_ROOM_LABEL : LATER_ROOM_LABEL;
    const label = first ? (logs.length === 1 ? ARRIVAL_LABEL : '내원')
      : afterMeet ? AFTER_MEET_ROOM_LABEL
      : l.s === MEET_STATUS && !last ? PAST_MEET_LABEL
      : room && !last ? pastRoom
      : last && l.s === INITIAL_STATUS ? (hadRoomBefore(logs, i) ? AFTER_ROOM_LABEL : BEFORE_ROOM_LABEL)
      : l.s;
    if (!first && !last && transient.includes(l.s)) return;
    // 같은 상태가 연달아 남으면 합침 (진료실은 진료 횟수이므로 합치지 않음)
    // (면회는 사이에 다른 상태가 있었으면 따로 셈)
    if (!first && !room && out.length && out[out.length - 1].label === label && !(label === PAST_MEET_LABEL && meetBreak)) return;
    if (label === PAST_MEET_LABEL) meetBreak = false;
    out.push({ at: l.at, label, first });
  });
  return out;
}
export const FIRST_ROOM_LABEL = '진료/검사';
export const AFTER_MEET_ROOM_LABEL = '면회 후 상담';
export const PAST_MEET_LABEL = '면회';
const isMeet = (s) => s === '면회대기중' || s === MEET_STATUS;
// 실제 면회는 의국 확인으로 '면회중'이 된 경우만 (면회대기중만 있고 확인 없이 넘어가면 면회 안 한 것으로 봄)
const hadMeetBefore = (logs, i) => logs.slice(0, i).some((l) => l.s === MEET_STATUS);
export const LATER_ROOM_LABEL = '검사후 상담';

// ── 귀가한 방문의 시간 분석 ─────────────────
// 총 방문(내원→귀가), 총 진료(진료실에 들어간 순간부터 다음 상태로 바뀔 때까지의 합),
// 진료 시작까지(내원→첫 진료실), 진료 종료 후 퇴원까지(마지막 진료실이 끝난 순간→귀가)
export function visitStats(p) {
  const logs = visitLogs(p);
  if (!logs.length || p.status !== '귀가') return null;
  const start = logs[0].at;
  const last = logs[logs.length - 1];
  const end = last.s === '귀가' ? last.at : (p.statusAt || last.at);
  let care = 0, rooms = 0, firstRoom = null, lastRoomEnd = null, meet = 0, meets = 0, firstMeet = null, inMeet = false;
  logs.forEach((l, i) => {
    // 면회: 면회대기중이 된 순간부터 다른 상태로 바뀔 때까지 (연달아 있으면 한 번으로)
    // 면회: 의국에서 [면회시작]을 눌러 '면회중'이 된 순간부터 다른 상태로 바뀔 때까지 (면회중이 없으면 면회 안 한 것)
    if (l.s === MEET_STATUS) {
      if (!inMeet) { meets++; inMeet = true; }  // 연달아 이어진 면회는 한 번으로
      const segEnd = logs[i + 1] ? logs[i + 1].at : end;
      meet += Math.max(0, segEnd - l.at);
      if (firstMeet == null) firstMeet = l.at;
      return;
    }
    if (l.s !== '면회대기중') inMeet = false;  // 면회 중 다시 누른 면회대기중은 같은 면회로
    if (STATUS[l.s]?.group !== 'room') return;
    const segEnd = logs[i + 1] ? logs[i + 1].at : end;
    rooms++;
    care += Math.max(0, segEnd - l.at);
    if (firstRoom == null) firstRoom = l.at;
    lastRoomEnd = segEnd;
  });
  return {
    start, end, total: Math.max(0, end - start), rooms, care, meet, meets,
    toFirst: firstRoom == null ? null : Math.max(0, firstRoom - start),
    toMeet: firstMeet == null ? null : Math.max(0, firstMeet - start),
    afterCare: lastRoomEnd == null ? null : Math.max(0, end - lastRoomEnd),
  };
}
// '1시간 5분' / '12분' / '1분 미만'
export function fmtDur(ms) {
  if (ms == null) return '-';
  const m = Math.floor(ms / 60000);
  if (m < 1) return '1분 미만';
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
}
export function visitStatsParts(p) {
  const v = visitStats(p); if (!v) return null;
  // 순서: 총체류 / 내원 후 진료시작까지(진료 없이 면회만이면 면회까지) / 수의사대면상담 / 진료종료후 귀가 / 총면회
  // 계산할 수 있는 것만 표시
  const items = [];
  if (v.rooms) items.push(`내원 후 진료시작까지 ${fmtDur(v.toFirst)}`);
  else if (v.meets) items.push(`내원 후 면회까지 ${fmtDur(v.toMeet)}`);
  if (v.rooms) {
    items.push(`수의사대면상담시간 ${fmtDur(v.care)}`);
    items.push(v.afterCare < 60000 ? '진료종료후 바로 귀가' : `진료종료후 ${fmtDur(v.afterCare)}후 귀가`);
  }
  if (v.meets) items.push(`총면회시간 ${fmtDur(v.meet)}${v.meets > 1 ? ` (${v.meets}번)` : ''}`);
  return { total: `총체류시간 ${fmtDur(v.total)}`, items };
}
// 둥근 사각형 칩으로 가로 배치 (창 너비에 따라 줄바꿈)
export function visitStatsHtml(p) {
  const vs = visitStatsParts(p); if (!vs) return '';
  return `<div class="vstats"><span class="vchip main">${esc(vs.total)}</span>${vs.items.map((x) => `<span class="vchip">${esc(x)}</span>`).join('')}</div>`;
}
const dateKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ── 한글 초성 자동완성 ───────────────────────
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const hParts = (ch) => { const c = (ch || '').charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 ? { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 } : null; };
const hJoin = (cho, jung, jong = 0) => String.fromCharCode(0xAC00 + cho * 588 + jung * 28 + jong);
// 입력 한 글자(q)가 이름 한 글자(n)와 맞는지: 같은 글자 / 초성만(ㄱ) / 받침 없이 치는 중(기 → 김)
function hCharMatch(q, n) {
  if (q === n) return true;
  const np = hParts(n); if (!np) return false;
  const ci = CHO.indexOf(q); if (ci >= 0) return np.cho === ci;
  const qp = hParts(q);
  return !!qp && qp.jong === 0 && qp.cho === np.cho && qp.jung === np.jung;
}
function hMatchAt(q, name, at) {
  if (q.length + at > name.length + 1) return false;
  for (let i = 0; i < q.length; i++) {
    const last = i === q.length - 1;
    if (at + i < name.length && hCharMatch(q[i], name[at + i])) continue;
    // 치는 중에 다음 글자 초성이 받침으로 붙은 경우 (유숨 → 유수민)
    const qp = last && hParts(q[i]);
    if (qp && qp.jong && at + i + 1 < name.length) {
      const ci = CHO.indexOf(JONG[qp.jong]);
      if (ci >= 0 && hCharMatch(hJoin(qp.cho, qp.jung), name[at + i]) && hParts(name[at + i + 1])?.cho === ci) continue;
    }
    return false;
  }
  return true;
}
// 성으로 시작하는 이름을 먼저, 그다음 이름 중간에서 맞는 것 ('형' → 김형준)
export function hangulSearch(query, names) {
  const q = String(query || '').replace(/\s+/g, '');
  if (!q) return [];
  const front = [], mid = [];
  for (const n of names) {
    if (hMatchAt(q, n, 0)) front.push(n);
    else if ([...Array(n.length).keys()].slice(1).some((i) => hMatchAt(q, n, i))) mid.push(n);
  }
  return [...front, ...mid];
}
// 입력칸 자동완성: 후보 목록이 아래에 뜨고 첫 후보가 선택됨.
// Tab = 선택 후 다음 칸으로, Enter = 선택 후 onEnter, ↑↓ = 후보 이동, Esc = 닫기. 후보에 없으면 친 그대로 둠.
export function setupAutocomplete(input, getNames, { onEnter } = {}) {
  const box = document.createElement('div');
  box.className = 'ac-box'; box.hidden = true;
  input.parentElement.style.position = 'relative';
  input.parentElement.appendChild(box);
  let items = [], idx = 0, lastEnter = 0;
  const paint = () => {
    box.hidden = !items.length;
    box.innerHTML = items.map((n, i) => `<div class="ac-item${i === idx ? ' on' : ''}" data-i="${i}">${esc(n)}</div>`).join('');
  };
  const update = () => { items = hangulSearch(input.value, getNames()); idx = 0; paint(); };
  const accept = () => {
    const pick = items[idx]; items = []; paint();
    if (pick) setTimeout(() => { input.value = pick; }, 0);  // 한글 조합이 끝난 뒤 값 바꿈
    return pick;
  };
  input.addEventListener('input', update);
  input.addEventListener('blur', () => setTimeout(() => { items = []; paint(); }, 150));
  box.addEventListener('mousedown', (e) => { const it = e.target.closest('.ac-item'); if (it) { idx = Number(it.dataset.i); accept(); e.preventDefault(); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { idx = (idx + 1) % items.length; paint(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp' && items.length) { idx = (idx - 1 + items.length) % items.length; paint(); e.preventDefault(); return; }
    if (e.key === 'Escape') { items = []; paint(); return; }
    if (e.key === 'Tab' && !e.shiftKey && items.length) { accept(); return; }  // 기본 Tab 동작으로 다음 칸 이동
    if (e.key === 'Enter') {
      e.preventDefault();
      const now = Date.now(); if (now - lastEnter < 80) return; lastEnter = now;  // 조합 중 Enter 중복 방지
      if (items.length) accept();
      if (onEnter) setTimeout(onEnter, 10);
    }
  });
  return { clear: () => { input.value = ''; items = []; paint(); } };
}

// ── 카드 격자 ───────────────────────────────
// 원장님 카드는 격자 밖 맨 위에 한 줄 전체, 나머지는 같은 너비·같은 높이의 격자
export function gridHtml(list, cardHtml, gridClass) {
  const pinned = list.filter(isSilent), rest = list.filter((p) => !isSilent(p));
  return (pinned.length ? `<div class="pinwrap">${pinned.map(cardHtml).join('')}</div>` : '')
    + (rest.length ? `<div class="${gridClass}">${rest.map(cardHtml).join('')}</div>` : '');
}
// 카드 최소 너비 = 귀가 시간 칩이 한 줄에 다 들어가는 너비 (없으면 기본값).
// 격자는 auto-fit 이라 남는 가로 공간은 카드들이 똑같이 나눠 가짐.
export function fitCards(grid, base) {
  if (!grid) return;
  let need = base;
  grid.querySelectorAll('.vstats').forEach((v) => {
    const chips = v.querySelectorAll('.vchip'); if (!chips.length) return;
    let w = 0; chips.forEach((c) => { w += c.getBoundingClientRect().width; });
    w += 6 * (chips.length - 1);
    const card = v.closest('.row, .pc');
    if (card) { const cs = getComputedStyle(card); w += ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((s, k) => s + (parseFloat(cs[k]) || 0), 0); }
    need = Math.max(need, Math.ceil(w + 6));
  });
  const val = need + 'px';
  if (grid.style.getPropertyValue('--cardmin') !== val) grid.style.setProperty('--cardmin', val);
}

// ── 매일 자정 정리 ─────────────────────────
// 어제 이전에 귀가한 환자 기록, 어제 이전에 완료한 통화 요청을 지움.
// 자정에 켜진 PC가 없으면 다음에 처음 켜지는 PC가 정리. (진행 중인 통화 요청·원내 환자는 그대로)
// 통화 요청은 플로우에서 다시 읽어 와 되살아나지 않도록 {gone, at} 표시만 남기고, 7일 뒤 완전히 삭제.
export const SHOW_DONE_MS = 60 * 1000;
export function todayStart(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function cleanupPlan(patients, calls, now) {
  const start = todayStart(now), WEEK = 7 * 86400000;
  const plan = { patients: {}, calls: {}, visits: {} };
  for (const [id, p] of Object.entries(patients || {})) {
    if (!(p && p.status === '귀가' && (p.statusAt || 0) < start)) continue;
    plan.patients[id] = null;
    // 지우기 전에 방문 요약을 남김 (나중에 병목·대기 시간 분석용, 원장님 제외)
    const v = visitStats(p);
    if (v && !isSilent(p)) {
      plan.visits[`${dateKey(v.start)}/${id}`] = {
        cat: p.cat || '', owner: p.owner || '', vet: p.vet || '', ...v,
        log: visitLogs(p).map((l) => ({ s: l.s, at: l.at })),
      };
    }
  }
  for (const [id, c] of Object.entries(calls || {})) {
    if (!c) continue;
    if (c.gone) { if ((c.at || 0) < start - WEEK) plan.calls[id] = null; continue; }
    if (c.status !== 'open' && (c.doneAt || 0) < start) plan.calls[id] = { gone: true, at: c.at || c.doneAt || now };
  }
  return plan;
}
export function startDailyCleanup(store) {
  let patients = null, calls = null, busy = false;
  store.onPatients((v) => { patients = v; });
  store.onCalls((v) => { calls = v; });
  const run = async () => {
    if (busy || !patients || !calls) return;
    const plan = cleanupPlan(patients, calls, store.now());
    if (!Object.keys(plan.patients).length && !Object.keys(plan.calls).length) return;  // visits는 patients와 함께만 생김
    busy = true;
    try {
      if (store.mode === 'firebase' && !(await store.tryLease('dailyCleanup', 50000))) return;
      await store.bulk(plan);
    } catch (e) { console.warn('cleanup', e); } finally { busy = false; }
  };
  setTimeout(run, 5000);
  setInterval(run, 60000);
}

export function routeHtml(p) {
  // 오늘이 아닌 기록은 날짜도 함께 표시 (예: 11/27 21:06)
  const today = new Date().toDateString();
  const when = (t) => { const d = new Date(t); return (d.toDateString() === today ? '' : `${d.getMonth() + 1}/${d.getDate()} `) + fmtHM(t); };
  return routeSteps(p).map((st, i) => `${i ? '<span class="arr">→</span>' : ''}<span class="step${st.first ? ' first' : ''}">${when(st.at)} ${esc(st.label)}</span>`).join('');
}
export const isToday = (t, now) => { const a = new Date(t), b = new Date(now); return a.toDateString() === b.toDateString(); };

export function badgeStyle(s) {
  const st = STATUS[s] || { color: '#334155', bg: '#e2e8f0' };
  return `color:${st.color};background:${st.bg}`;
}

// 새로고침 버튼 + 새 버전 감지
// 3분마다 화면 파일을 확인해서 바뀌었으면 버튼을 주황색 "새 버전 · 새로고침"으로 바꿈 (자동으로 새로고침하지는 않음)
export function setupRefresh(btn) {
  if (!btn) return;
  btn.onclick = () => location.reload();
  const files = [location.pathname, '/common.js', '/config.js', '/style.css', '/calls.js'];
  const snap = async () => {
    try {
      const texts = await Promise.all(files.map((f) => fetch(f, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''))));
      return texts.join('\u0000');
    } catch { return null; }
  };
  let base = null;
  snap().then((t) => { base = t; });
  setInterval(async () => {
    if (base == null) { base = await snap(); return; }
    const now = await snap();
    if (now != null && now !== base) {
      btn.classList.add('update');
      btn.textContent = '⟳ 새 버전 · 새로고침';
      btn.title = '프로그램이 수정되었습니다. 눌러서 새로 불러오세요.';
    }
  }, 3 * 60 * 1000);
}

// 확인 창 (화면 안에 띄움). 확인 → true, 취소/바깥 클릭/Esc → false
export function confirmDialog({ title, message, ok = '삭제', cancel = '취소' }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'confirm-bg';
    el.innerHTML = `<div class="confirm-box" role="dialog" aria-modal="true">
      <div class="confirm-t">${esc(title || '')}</div>
      <div class="confirm-m">${esc(message || '').replace(/\n/g, '<br>')}</div>
      <div class="confirm-a"><button class="btn" data-v="0">${esc(cancel)}</button><button class="btn danger" data-v="1">${esc(ok)}</button></div>
    </div>`;
    const done = (v) => { document.removeEventListener('keydown', onKey); el.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (b) done(b.dataset.v === '1'); else if (e.target === el) done(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    el.querySelector('button[data-v="0"]').focus();   // 기본 선택은 '취소'
  });
}
export const DELETE_WARNING = '정말 지울까요? 잘못 등록한 경우에만 지워 주세요.\n보호자가 돌아갔으면 지우지 말고 귀가로 바꿔 주세요. 귀가 기록은 매일 자정에 자동으로 정리됩니다.';

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
    el.innerHTML = `<div class="gate-box"><div class="gate-t">${esc(title)}</div><div class="gate-s" id="lg-msg">병원 구글 계정으로 로그인하세요</div><button class="btn primary" id="lg-btn" style="margin-top:16px">구글 계정으로 로그인</button><div><button class="btn" id="lg-alt" style="margin-top:10px;font-size:13px;padding:8px 14px">로그인 창이 안 뜨면 여기를 누르세요</button></div></div>`;
    document.body.appendChild(el);
    let done = false;
    store.auth.onAuth((u) => { if (u && !done) { done = true; el.remove(); resolve(u); } });
    el.querySelector('#lg-btn').onclick = async (e) => {
      e.stopPropagation(); Sound.unlock();
      try { await store.auth.signIn(); } catch (err) { el.querySelector('#lg-msg').textContent = '로그인 실패: ' + (err.code || err.message); }
    };
    el.querySelector('#lg-alt').onclick = async (e) => {
      e.stopPropagation();
      el.querySelector('#lg-msg').textContent = '구글 로그인 화면으로 이동합니다…';
      try { await store.auth.signInRedirect(); } catch (err) { el.querySelector('#lg-msg').textContent = '로그인 실패: ' + (err.code || err.message); }
    };
    store.auth.redirectError.then((err) => { if (err && !done) el.querySelector('#lg-msg').textContent = '로그인 실패: ' + (err.code || err.message); });
  });
}
