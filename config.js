// 집안 온도계 설정. 값만 바꾸면 되고 다른 파일은 건드릴 필요가 없어요.
export const CONFIG = {
  // Firebase 웹앱 설정을 여기에 붙여넣으면 거실 폰과 내 폰이 서로 동기화돼요.
  // 비워 두면(null) 이 기기 안에만 저장돼요. 방법은 README.md 참고.
  firebase: null,
  // 예: { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." }

  // 측정 시간 기본값(기기의 현지 시각 기준, 24시간제). 거실 폰 탭에서 폰마다 바꿀 수 있어요.
  window: { start: 18, end: 20 },

  // 몇 분마다 한 번씩 분석하고 원본 글자를 버릴지
  chunkMinutes: 10,

  // 온도계 범위. neutral은 "보통"으로 보는 온도
  tempRange: { min: 14, max: 30, neutral: 22 },

  // 음성 인식 언어
  lang: 'ko-KR',
};
