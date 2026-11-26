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

export const firebaseConfig = null;

// 2) 동작 설정
export const SETTINGS = {
  // 알림음 반복 간격(초): 내부 확인 / 콜요청 알림을 누를 때까지 이 간격으로 다시 울립니다.
  alarmRepeatSec: 5,

  // 내부 확인이 이 시간(초) 이상 없으면 리셉션 화면에서 빨갛게 강조합니다.
  ackWarnSec: 60,

  // 상담대기중·면회대기중 경과 시간 경고 기준(분)
  waitWarnMin: 15,   // 주황
  waitAlertMin: 30,  // 빨강

  // 의국 화면에서 알림음을 울릴 상태 변경
  internalChimeStatuses: ['상담대기중', '면회대기중', '라운지콜완료', '외출콜완료'],
};
