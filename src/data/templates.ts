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
    key: 'round3',
    name: '3차 조사까지',
    description: '조사와 토론을 세 번 진행하는 흐름',
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
  {
    key: 'round4',
    name: '4차 조사까지',
    description: '조사와 토론을 네 번 진행하는 흐름',
    stages: [
      { name: '오프닝 · 캐릭터 소개', durationSec: m(10) },
      { name: '1차 조사', durationSec: m(20) },
      { name: '1차 토론', durationSec: m(15) },
      { name: '2차 조사', durationSec: m(20) },
      { name: '2차 토론', durationSec: m(15) },
      { name: '3차 조사', durationSec: m(20) },
      { name: '3차 토론', durationSec: m(15) },
      { name: '4차 조사', durationSec: m(15) },
      { name: '최종 토론', durationSec: m(15) },
      { name: '범인 지목', durationSec: m(10) },
      { name: '엔딩 · 해설', durationSec: m(10) },
    ],
  },
];

export const findTemplate = (key: string | undefined) => TEMPLATES.find((t) => t.key === key);
