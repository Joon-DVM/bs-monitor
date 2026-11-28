// GET /api/flow-messages : 플로우 '통화요청방'의 최근 메시지를 가져옵니다.
// 필요 환경변수: FLOW_API_KEY (원장님 개인 API 키)  / 선택: FLOW_ROOM_ID (기본 816685 = 통화요청방)
const { send, requireUser, missingEnv } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'GET only' });
  if (!(await requireUser(req, res))) return;
  if (missingEnv(res, ['FLOW_API_KEY'])) return;
  const roomId = process.env.FLOW_ROOM_ID || '816685';
  try {
    const r = await fetch(`https://api.flow.team/user/chats/${encodeURIComponent(roomId)}/messages?size=50`, {
      headers: { 'Content-Type': 'application/json', 'x-flow-api-key': process.env.FLOW_API_KEY },
    });
    const j = await r.json().catch(() => ({}));
    const resp = j.response || j;
    if (!r.ok || resp.success === false) {
      const msg = (resp.error && resp.error.message) || resp.message || `HTTP ${r.status}`;
      return send(res, 502, { ok: false, error: '플로우 조회 실패: ' + msg });
    }
    const list = (resp.data && resp.data.messages) || [];
    // 화면에 필요한 값만 전달
    const messages = list.map((m) => ({
      id: String(m.messageId), sender: m.registerName || '', senderId: m.registerId || '',
      text: m.contents || '', at: m.registeredDateTime || '',
    }));
    return send(res, 200, { ok: true, roomId, messages });
  } catch (e) {
    return send(res, 502, { ok: false, error: '플로우 연결 실패: ' + e.message });
  }
};
