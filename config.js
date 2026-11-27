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
  silentNames: [
    ['김형준', '원장'],
  ],

  // 의국에서 내원 알림에 완료/보류를 이 시간(초) 동안 누르지 않으면 자동으로 '보류' 처리합니다.
  autoHoldSec: 10,

  // 의국 카드에서 동선이 이 개수를 넘으면 카드가 2칸 너비로 넓어집니다.
  wideRouteSteps: 4,

  // 내부 확인이 이 시간(초) 이상 없으면 리셉션 화면에서 빨갛게 강조합니다.
  ackWarnSec: 60,

  // 상담대기중·면회대기중 경과 시간 경고 기준(분)
  waitWarnMin: 15,   // 주황
  waitAlertMin: 30,  // 빨강

  // 의국 화면에서 알림음을 울릴 상태 변경
  internalChimeStatuses: ['상담대기중', '면회대기중', '라운지콜완료', '외출콜완료'],
};
