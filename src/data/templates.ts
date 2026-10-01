/** 기본 템플릿. 저장된 시나리오와 별도로 ‘템플릿으로 만들기’에 보인다. */
export interface Template {
  key: string;
  name: string;
  description: string;
  stages: Array<{ name: string; durationSec: number }>;
}

const m = (minutes: number) => minutes * 60;

export const TEMPLATES: Template[] = [
  {
    key: 'standard',
    name: '기본 구성',
    description: '조사와 토론을 두 번씩 진행하는 일반적인 흐름',
    stages: [
      { name: '오프닝 · 캐릭터 소개', durationSec: m(10) },
      { name: '1차 조사', durationSec: m(20) },
      { name: '1차 토론', durationSec: m(15) },
      { name: '2차 조사', durationSec: m(20) },
      { name: '2차 토론', durationSec: m(15) },
      { name: '최종 추리 · 범인 지목', durationSec: m(10) },
      { name: '엔딩 · 해설', durationSec: m(10) },
    ],
  },
  {
    key: 'short',
    name: '짧은 게임',
    description: '1시간 안에 끝나는 간단한 흐름',
    stages: [
      { name: '사건 소개', durationSec: m(5) },
      { name: '조사', durationSec: m(15) },
      { name: '토론', durationSec: m(15) },
      { name: '범인 지목', durationSec: m(5) },
      { name: '해설', durationSec: m(10) },
    ],
  },
  {
    key: 'long',
    name: '긴 게임',
    description: '조사 3회와 쉬는 시간이 있는 3시간 흐름',
    stages: [
      { name: '오프닝', durationSec: m(15) },
      { name: '캐릭터 숙지', durationSec: m(15) },
      { name: '1차 조사', durationSec: m(25) },
      { name: '1차 토론', durationSec: m(20) },
      { name: '쉬는 시간', durationSec: m(10) },
      { name: '2차 조사', durationSec: m(25) },
      { name: '2차 토론', durationSec: m(20) },
      { name: '3차 조사', durationSec: m(15) },
      { name: '최종 토론', durationSec: m(15) },
      { name: '범인 지목', durationSec: m(10) },
      { name: '엔딩 · 해설', durationSec: m(15) },
    ],
  },
];

export const findTemplate = (key: string | undefined) => TEMPLATES.find((t) => t.key === key);
