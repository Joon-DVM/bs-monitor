// POST /api/flow-complete {text} : 'BS모니터' 봇 이름으로 통화요청방에 메시지를 올립니다 (플로우 웹훅).
// 필요 환경변수: FLOW_WEBHOOK_TOKEN  / 선택: FLOW_HOOK_ID (기본: '통화요청방 완료알림' 웹훅)
const { send, requireUser, missingEnv, readJson } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
  const email = await requireUser(req, res);
  if (!email) return;
  if (missingEnv(res, ['FLOW_WEBHOOK_TOKEN'])) return;
  const hookId = process.env.FLOW_HOOK_ID || '4d7b79c7-441f-49fc-b743-7cf28872a1b3';
  const body = await readJson(req);
  const text = String(body.text || '').trim().slice(0, 2000);
  if (!text) return send(res, 400, { ok: false, error: '보낼 내용이 없습니다' });
  try {
    const r = await fetch(`https://api.flow.team/webhook/${encodeURIComponent(hookId)}/service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-flow-webhook-token': process.env.FLOW_WEBHOOK_TOKEN },
      body: JSON.stringify({ text }),
    });
    const raw = await r.text();
    if (!r.ok) return send(res, 502, { ok: false, error: `플로우 전송 실패 (HTTP ${r.status}) ${raw.slice(0, 200)}` });
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 502, { ok: false, error: '플로우 연결 실패: ' + e.message });
  }
};
