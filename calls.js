// BS 보호자 모니터 — 플로우 '통화요청방' 연동 패널 (리셉션·의국 공용)
//  · 플로우 → 여기: 통화요청방의 새 요청을 주기적으로 가져와 카드로 표시
//  · 여기 → 플로우: [통화 완료] + 처리자(필수) + 메모 → 'BS모니터' 봇이 통화요청방에 완료 메시지 작성
import { SETTINGS, Sound, NOW, esc, fmtHM, fmtElapsed, toast, desktopNotify, parseCallMessage } from './common.js';

const STAFF_KEY = 'bsm.callStaff';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// 플로우에 올라가는 완료 메시지 (플로우는 답장 지정이 안 되어 첫 줄에 원글을 짚어 줌)
//   ↪ 18:45 이승빈님 요청 (아이 상태 관련)
//   ✅ 통화완료 – 이승빈(햇반) / 통화: 김형준 선생님
//   문의사항 : *오늘 구토하였는데 …      ← 원글에 * 메모가 있을 때만
//   통화메모: …                          ← 완료할 때 메모를 쓴 경우만
export function completionText(c, who, memo) {
  const title = /님$/.test(who) ? who : `${who} 선생님`;
  const reason = (c.reason || '').trim();
  const lines = [
    `↪ ${fmtHM(c.at)} ${c.sender ? c.sender + '님 ' : ''}요청${reason ? ` (${reason})` : ''}`,
    `✅ 통화완료 – ${c.owner}(${c.pet}) / 통화: ${title}`,
  ];
  const note = (c.note || '').trim();
  if (note) lines.push(`문의사항 : ${note.split('\n').map((l) => '*' + l.trim()).join('\n')}`);
  if (memo) lines.push(`통화메모: ${memo}`);
  return lines.join('\n');
}

export function setupCalls({ store, mount }) {
  if (!mount) return;
  let calls = {}, first = true, formId = null, syncError = '', showDone = false;
  const since = Date.parse(SETTINGS.flowSince || '') || 0;

  // ── 서버 호출 (로그인 토큰 첨부) ──
  async function api(path, opts = {}) {
    const token = store.auth ? await store.auth.idToken() : null;
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  // ── 플로우 → 여기 (한 PC만 flowPollSec 간격으로) ──
  async function sync(force = false) {
    if (store.mode !== 'firebase') return;
    try {
      if (!force && !(await store.tryLease('flowSync', (SETTINGS.flowPollSec || 30) * 1000 - 2000))) return;
      const { messages } = await api('/api/flow-messages');
      for (const msg of messages) {
        for (const req of parseCallMessage(msg)) {
          if (req.at < since) continue;
          await store.ensureCall(req.id, { ...req, status: 'open', createdAt: NOW });
        }
      }
      if (syncError) { syncError = ''; render(); }
    } catch (e) {
      const msg = e.message || String(e);
      if (msg !== syncError) { syncError = msg; render(); }
    }
  }
  if (store.mode === 'firebase') { sync(); setInterval(() => sync(), 10000); }

  // ── 데이터 수신 ──
  store.onCalls((data) => {
    const prev = calls;
    calls = data || {};
    if (!first) {
      for (const [id, c] of Object.entries(calls)) {
        if (!prev[id] && c.status === 'open') {
          Sound.play('chime');
          toast(`📞 통화 요청 — ${c.owner}(${c.pet})${c.doctor ? ' / ' + c.doctor : ''}`);
          desktopNotify('📞 통화 요청', `${c.owner}(${c.pet}) ${c.reason}${c.doctor ? ' / ' + c.doctor : ''}`);
        }
      }
    }
    first = false;
    render();
  });

  // ── 처리자 목록 ──
  function staffList() {
    const names = new Set(SETTINGS.callStaff || []);
    for (const c of Object.values(calls)) {
      if (c.sender) names.add(c.sender);
      const d = String(c.doctor || '').replace(/\s*(대표)?(원장님|선생님|원장|쌤)\s*$/, '').trim();
      if (d && d.length <= 5 && !/통화|가능/.test(d)) names.add(d);
      if (c.doneBy) names.add(c.doneBy);
    }
    return [...names];
  }

  // ── 화면 ──
  function card(c) {
    const tags = [
      c.inpatient ? '<span class="ct ct-in">입원</span>' : '',
      c.tomorrow ? `<span class="ct ct-tm">내일 요청 · ${new Date(c.at).getMonth() + 1}/${new Date(c.at).getDate()} 접수</span>` : '',
    ].join('');
    const form = formId === c.id ? formHtml(c) : '';
    return `<div class="call-card${formId === c.id ? ' editing' : ''}" data-id="${esc(c.id)}">
      <div class="cc-h"><span class="cc-nm">📞 ${esc(c.owner)}(${esc(c.pet)})</span>${tags}<span class="cc-sp"></span>${c.doctor ? `<span class="cc-doc">${esc(c.doctor)}</span>` : ''}</div>
      <div class="cc-r">${esc(c.reason)}${c.phone ? ` · <span class="cc-ph">${esc(c.phone)}</span>` : ''}</div>
      ${c.note ? `<div class="cc-note">* ${esc(c.note)}</div>` : ''}
      <div class="cc-m">요청 ${fmtHM(c.at)} · ${esc(c.sender || '')} · <span class="tick" data-k="ago" data-t="${c.at}"></span> 전</div>
      ${form || `<div class="cc-acts"><button class="btn ok" data-cact="open" data-id="${esc(c.id)}">✓ 통화 완료</button><button class="btn" data-cact="flowdone" data-id="${esc(c.id)}" title="플로우 채팅방에서 이미 '통완'으로 처리한 건을 목록에서 정리합니다 (플로우에는 아무것도 올리지 않음)">플로우에서 이미 완료됨</button></div>`}
    </div>`;
  }
  function formHtml(c) {
    const last = lsGet(STAFF_KEY) || '';
    const list = staffList();
    const opts = ['<option value="">처리자 선택 (필수)</option>']
      .concat(list.map((n) => `<option ${n === last ? 'selected' : ''}>${esc(n)}</option>`))
      .concat(['<option value="__other">직접 입력…</option>']).join('');
    return `<div class="cc-form">
      <div class="cc-row"><select class="inp cc-who">${opts}</select><input class="inp cc-who-other" placeholder="처리자 이름" style="display:none"></div>
      <div class="cc-row"><input class="inp cc-memo" placeholder="통화 메모 (선택) — 예: 동일 용량 확인 안내"></div>
      <div class="cc-row"><button class="btn ok" data-cact="send" data-id="${esc(c.id)}">플로우에 완료 올리기</button><button class="btn" data-cact="cancel">취소</button></div>
    </div>`;
  }

  function render() {
    const all = Object.entries(calls).map(([id, c]) => ({ id, ...c }));
    const open = all.filter((c) => c.status === 'open').sort((a, b) => (a.tomorrow - b.tomorrow) || (a.at - b.at));
    const today = new Date().toDateString();
    const done = all.filter((c) => c.status !== 'open' && c.doneAt && new Date(c.doneAt).toDateString() === today).sort((a, b) => b.doneAt - a.doneAt);
    if (!open.length && !done.length && !syncError) { mount.innerHTML = ''; return; }
    // 입력 중인 내용 보존
    const keep = formId && mount.querySelector('.cc-form') ? {
      who: mount.querySelector('.cc-who')?.value, other: mount.querySelector('.cc-who-other')?.value, memo: mount.querySelector('.cc-memo')?.value,
    } : null;
    mount.innerHTML = `<div class="calls">
      <div class="calls-h"><b>📞 플로우 통화 요청</b> <span class="calls-n">${open.length}건</span>
        ${syncError ? `<span class="calls-err" title="${esc(syncError)}">⚠ 플로우 연결 오류: ${esc(syncError)}</span>` : ''}
        <span class="cc-sp"></span>
        ${done.length ? `<button class="btn calls-tg" data-cact="toggleDone">오늘 완료 ${done.length}건 ${showDone ? '숨기기' : '보기'}</button>` : ''}</div>
      ${open.length ? `<div class="calls-list">${open.map(card).join('')}</div>` : '<div class="calls-empty">남은 통화 요청이 없습니다</div>'}
      ${showDone && done.length ? `<div class="calls-done">${done.map((c) => `<div class="cd-row">✓ ${fmtHM(c.doneAt)} ${esc(c.owner)}(${esc(c.pet)})${c.doctor ? ' / ' + esc(c.doctor) : ''} · ${c.status === 'flowdone' ? '플로우에서 완료' : '처리: ' + esc(c.doneBy || '')}${c.doneMemo ? ' · ' + esc(c.doneMemo) : ''}</div>`).join('')}</div>` : ''}
    </div>`;
    if (keep) {
      const w = mount.querySelector('.cc-who'), o = mount.querySelector('.cc-who-other'), m = mount.querySelector('.cc-memo');
      if (w && keep.who != null) w.value = keep.who;
      if (o) { o.value = keep.other || ''; o.style.display = w && w.value === '__other' ? '' : 'none'; }
      if (m) m.value = keep.memo || '';
    }
    const now = store.now();
    mount.querySelectorAll('.tick[data-k="ago"]').forEach((el) => { el.textContent = fmtElapsed(now - Number(el.dataset.t)); });
  }
  setInterval(() => {
    const now = store.now();
    mount.querySelectorAll('.tick[data-k="ago"]').forEach((el) => { el.textContent = fmtElapsed(now - Number(el.dataset.t)); });
  }, 30000);

  // ── 동작 ──
  mount.addEventListener('change', (e) => {
    if (e.target.classList.contains('cc-who')) {
      const o = mount.querySelector('.cc-who-other');
      if (o) { o.style.display = e.target.value === '__other' ? '' : 'none'; if (e.target.value === '__other') o.focus(); }
    }
  });
  mount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.target.classList.contains('cc-memo')) {
      e.preventDefault(); mount.querySelector('[data-cact="send"]')?.click();
    }
  });
  mount.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-cact]'); if (!b) return;
    const act = b.dataset.cact, id = b.dataset.id, c = id && calls[id];
    if (act === 'toggleDone') { showDone = !showDone; render(); return; }
    if (act === 'cancel') { formId = null; render(); return; }
    if (act === 'open') { formId = id; render(); mount.querySelector('.cc-who')?.focus(); return; }
    if (!c) return;
    if (act === 'flowdone') {
      await store.updateCall(id, { status: 'flowdone', doneAt: NOW });
      toast(`${c.owner}(${c.pet}) 목록에서 정리됨`, { ms: 7000, action: { label: '되돌리기', run: () => store.updateCall(id, { status: 'open', doneAt: null }) } });
      return;
    }
    if (act === 'send') {
      const sel = mount.querySelector('.cc-who').value;
      const who = (sel === '__other' ? mount.querySelector('.cc-who-other').value : sel).trim();
      const memo = mount.querySelector('.cc-memo').value.trim();
      if (!who) { toast('처리자를 선택해 주세요'); mount.querySelector('.cc-who').focus(); return; }
      lsSet(STAFF_KEY, who);
      const text = completionText(c, who, memo);
      b.disabled = true; b.textContent = '올리는 중…';
      try {
        if (store.mode === 'firebase') await api('/api/flow-complete', { method: 'POST', body: JSON.stringify({ text }) });
        await store.updateCall(id, { status: 'done', doneAt: NOW, doneBy: who, doneMemo: memo });
        formId = null;
        toast(store.mode === 'firebase' ? '플로우 통화요청방에 완료를 올렸습니다' : '데모: 완료 처리 (플로우에는 올리지 않음)');
      } catch (err) {
        b.disabled = false; b.textContent = '플로우에 완료 올리기';
        toast('플로우에 올리지 못했습니다: ' + (err.message || err), { ms: 8000 });
      }
    }
  });

  render();
  return { sync: () => sync(true) };
}
