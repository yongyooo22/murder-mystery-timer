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
    key: 'investigation2',
    name: '조사 2회',
    description: '조사 단계가 2회인 경우',
    stages: [
      { name: '오프닝 · 캐릭터 소개', durationSec: m(10) },
      { name: '1차 조사', durationSec: m(20) },
      { name: '1차 토론', durationSec: m(15) },
      { name: '2차 조사', durationSec: m(20) },
      { name: '최종 토론', durationSec: m(15) },
      { name: '범인 지목', durationSec: m(10) },
      { name: '엔딩 · 해설', durationSec: m(10) },
    ],
  },
  {
    key: 'investigation3',
    name: '조사 3회',
    description: '조사 단계가 3회인 경우',
    stages: [
      { name: '오프닝 · 캐릭터 소개', durationSec: m(10) },
      { name: '1차 조사', durationSec: m(20) },
      { name: '1차 토론', durationSec: m(15) },
      { name: '2차 조사', durationSec: m(20) },
      { name: '2차 토론', durationSec: m(15) },
      { name: '3차 조사', durationSec: m(15) },
      { name: '최종 토론', durationSec: m(15) },
      { name: '범인 지목', durationSec: m(10) },
      { name: '엔딩 · 해설', durationSec: m(10) },
    ],
  },
];

export const findTemplate = (key: string | undefined) => TEMPLATES.find((t) => t.key === key);
