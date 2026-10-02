/**
 * 앱 전체에서 쓰는 이름과 기본 문구.
 * 앱 이름을 바꾸려면 이 파일의 `name`, `shortName`만 고치면 된다.
 * (브라우저 탭 제목, 홈 화면 아이콘 이름(manifest), 화면 상단 표기에 모두 반영된다.)
 */
export const APP_CONFIG = {
  name: 'Murder Mystery Timer',
  /** 홈 화면 아이콘 아래 이름. 길면 잘리므로 짧게 둔다. */
  shortName: 'Murder Timer',
  description: '머더미스터리 진행용 단계 타이머',
  themeColor: '#202123',
  /** 목록 화면 맨 아래에 보이는 제작자 표기 */
  credit: '© 2026 제작: 김연경(earthssaem@gmail.com)',
} as const;
