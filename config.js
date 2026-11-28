// ─────────────────────────────────────────────────────────────
// BS 보호자 모니터 — 설정 파일
// ─────────────────────────────────────────────────────────────
//
// 1) firebaseConfig
//    null 로 두면 "데모 모드"로 동작합니다. (같은 컴퓨터·같은 브라우저 안의 탭끼리만 공유)
//    실제로 여러 컴퓨터에서 쓰려면 Firebase 콘솔의 "웹 앱 설정" 값을 아래에 붙여넣으세요.
//    (설치안내.md 참고)
//
// export const firebaseConfig = {
//   apiKey: "....",
//   authDomain: "xxxx.firebaseapp.com",
//   databaseURL: "https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
//   projectId: "xxxx",
//   appId: "....",
// };

export const firebaseConfig = {
  apiKey: "AIzaSyCh6OcS4h2Y8SaELU0Xm-HnlV3kxyER8uY",
  authDomain: "bs-monitor-45946.firebaseapp.com",
  databaseURL: "https://bs-monitor-45946-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bs-monitor-45946",
  storageBucket: "bs-monitor-45946.firebasestorage.app",
  messagingSenderId: "706414454444",
  appId: "1:706414454444:web:c29a9a0176591a08e8a109",
};
// 이 주소에서는 로그인 창을 같은 주소(/__/auth)에서 엽니다 (vercel.json 에서 Firebase 로 연결).
// 새 주소를 추가하면 Google Cloud 의 OAuth 클라이언트에 https://(주소)/__/auth/handler 도 등록해야 합니다.
export const authProxyHosts = ['bs-monitor-sandy.vercel.app'];
// 주소 끝에 ?demo=1 을 붙이면 Firebase 대신 데모 모드로 동작합니다 (demo.html 에서 사용).

// 2) 동작 설정
export const SETTINGS = {
  // 알림음 반복 간격(초): 리셉션의 콜요청 알림을 누를 때까지 이 간격으로 다시 울립니다.
  // (의국의 내원 알림음은 내원 1건당 한 번만 울립니다)
  alarmRepeatSec: 5,

  // 조용한 내원: 고양이 이름·보호자 이름에 한 묶음의 단어가 모두 들어 있으면
  // 알림음·내원 배너·자동 보류·경과 시간 표시를 하지 않습니다.
  // 예) ['김형준', '원장'] → "김형준(원장님)" 처럼 두 단어가 모두 있으면 적용
  //     ['원장님']         → 어느 칸이든 "원장님"이 들어 있으면 적용
  silentNames: [
    ['김형준', '원장'],
    ['원장님'],
  ],

  // ── 플로우 '통화요청방' 연동 ──
  // 이 시각 이후에 올라온 통화 요청만 가져옵니다 (연동 이전 요청은 제외)
  flowSince: '2026-11-28T18:20:00+09:00',
  // 플로우 새 메시지 확인 간격(초). 여러 PC가 켜져 있어도 이 간격에 한 번만 확인합니다.
  flowPollSec: 30,
  // 완료 처리자 목록 (그 방에서 글을 올린 사람·담당 선생님도 자동으로 추가됨)
  callStaff: ['김형준', '조문주', '송애라', '유수민', '정소연', '이승빈', '김수현', '차영미', '양은서'],

  // 리셉션 '수의사' 칸 자동완성 후보 (성·초성만 쳐도 찾음: '김', 'ㄱㅎ', '형' 등)
  vets: ['김형준', '조문주', '송애라', '유수민', '정소연'],
  // 카드에 보이는 수의사 표시 이름 (대소문자 그대로). 여기에 없는 이름은 입력한 그대로 표시
  vetShort: { '김형준': 'Joon', '조문주': 'Jo', '송애라': 'Song', '유수민': 'Yu', '정소연': 'So' },

  // 의국에서 대기 알림(진료대기중·면회대기중)에 완료/보류를 이 시간(초) 동안 누르지 않으면 자동으로 '보류' 처리합니다.
  autoHoldSec: 10,

  // 잠깐 거쳐 가는 상태: 지금 상태일 때만 동선에 보이고, 다른 상태로 바뀌면 동선에서 숨깁니다.
  // (기록은 그대로 남아 있고 화면에서만 숨김)
  transientStatuses: ['진료대기중', '면회대기중', '라운지콜완료', '외출콜완료', '원내'],

  // 지나간 진료실(1~4진료실)은 동선에서 이 이름으로 통일해 표시합니다. (지금 진료실에 있으면 실제 진료실 이름)
  pastRoomLabel: '진료/상담',

  // 의국 카드에서 동선이 이 개수를 넘으면 카드가 2칸 너비로 넓어집니다.
  wideRouteSteps: 4,

  // 내부 확인이 이 시간(초) 이상 없으면 리셉션 화면에서 빨갛게 강조합니다.
  ackWarnSec: 60,

  // 진료대기중·면회대기중 경과 시간 경고 기준(분)
  waitWarnMin: 15,   // 주황
  waitAlertMin: 30,  // 빨강

  // 의국 화면에서 알림음을 울릴 상태 변경
  // (진료대기중·면회대기중은 별도의 '대기 알림'(딩동 + 완료/보류)이 울립니다)
  internalChimeStatuses: ['라운지콜완료', '외출콜완료'],
};
