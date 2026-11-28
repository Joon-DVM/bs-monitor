// 서버 공통: 로그인 확인 + 응답 도우미 (Vercel 서버리스 함수에서 사용)
// '_'로 시작하는 파일은 Vercel 이 주소(엔드포인트)로 만들지 않습니다.

// Firebase 웹 API 키 (공개값, config.js 와 동일)
const FIREBASE_WEB_API_KEY = 'AIzaSyCh6OcS4h2Y8SaELU0Xm-HnlV3kxyER8uY';

// 이 기능을 쓸 수 있는 계정 (Firebase 보안 규칙의 허용 계정과 같게 유지)
// Vercel 환경변수 ALLOWED_EMAILS 에 쉼표로 넣으면 그 값이 우선합니다.
const DEFAULT_ALLOWED = ['dvmppiru@gmail.com', 'bscat5653@gmail.com'];

function allowedEmails() {
  const env = process.env.ALLOWED_EMAILS;
  return env ? env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : DEFAULT_ALLOWED;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// 요청 헤더의 Firebase 로그인 토큰을 Google 에 확인해서 허용 계정인지 검사
async function requireUser(req, res) {
  const h = req.headers.authorization || '';
  const idToken = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!idToken) { send(res, 401, { ok: false, error: '로그인이 필요합니다' }); return null; }
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    const j = await r.json();
    const u = j && j.users && j.users[0];
    const email = u && String(u.email || '').toLowerCase();
    if (!r.ok || !u || !u.emailVerified || !allowedEmails().includes(email)) {
      send(res, 403, { ok: false, error: '허용되지 않은 계정입니다' }); return null;
    }
    return email;
  } catch (e) {
    send(res, 502, { ok: false, error: '로그인 확인 실패: ' + e.message }); return null;
  }
}

function missingEnv(res, names) {
  const miss = names.filter((n) => !process.env[n]);
  if (miss.length) { send(res, 500, { ok: false, error: `Vercel 환경변수 없음: ${miss.join(', ')}`, missing: miss }); return true; }
  return false;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

module.exports = { send, requireUser, missingEnv, readJson };
