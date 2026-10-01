import { createId } from '../lib/id';
import { LIMITS, charLength } from './limits';
import type { Scenario, ScenarioInput, Stage } from './types';

/** 편집 화면에서 쓰는 단계. 분·초는 입력 중인 문자열 그대로 보관한다. */
export interface StageDraft {
  /** 화면 목록용 고유 키(저장되지 않음) */
  key: string;
  id: string;
  name: string;
  minutes: string;
  seconds: string;
}

export interface ScenarioDraft {
  name: string;
  stages: StageDraft[];
}

export interface StageErrors {
  name?: string;
  time?: string;
}

export interface DraftErrors {
  name?: string;
  stages?: string;
  /** key: StageDraft.key */
  stage: Record<string, StageErrors>;
}

export function stageToDraft(stage: Pick<Stage, 'name' | 'durationSec'> & { id?: string }): StageDraft {
  const minutes = Math.floor(stage.durationSec / 60);
  const seconds = stage.durationSec % 60;
  return {
    key: createId(),
    id: stage.id ?? createId(),
    name: stage.name,
    minutes: String(minutes),
    seconds: String(seconds).padStart(2, '0'),
  };
}

export function emptyStageDraft(): StageDraft {
  return { key: createId(), id: createId(), name: '', minutes: '10', seconds: '00' };
}

export function scenarioToDraft(scenario: Pick<Scenario, 'name' | 'stages'>): ScenarioDraft {
  return { name: scenario.name, stages: scenario.stages.map(stageToDraft) };
}

/** 입력 중인 분·초를 초로 바꾼다. 숫자가 아니면 null. */
export function draftDurationSec(stage: Pick<StageDraft, 'minutes' | 'seconds'>): number | null {
  const m = stage.minutes.trim() === '' ? 0 : Number(stage.minutes);
  const s = stage.seconds.trim() === '' ? 0 : Number(stage.seconds);
  if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0) return null;
  return m * 60 + s;
}

export function validateStage(stage: StageDraft): StageErrors {
  const errors: StageErrors = {};
  const name = stage.name.trim();
  if (!name) errors.name = '단계 이름을 입력해주세요.';
  else if (charLength(name) > LIMITS.stageNameMax) errors.name = `단계 이름은 ${LIMITS.stageNameMax}자 이내로 입력해주세요.`;

  const m = stage.minutes.trim();
  const s = stage.seconds.trim();
  if (m === '' && s === '') errors.time = '시간을 입력해주세요.';
  else if (!/^\d*$/.test(m) || !/^\d*$/.test(s)) errors.time = '분과 초는 숫자로 입력해주세요.';
  else if (Number(m) > LIMITS.stageMaxMinutes) errors.time = `분은 ${LIMITS.stageMaxMinutes} 이하로 입력해주세요.`;
  else if (Number(s) > 59) errors.time = '초는 0~59 사이로 입력해주세요.';
  else if (draftDurationSec(stage) === 0) errors.time = '시간은 1초 이상이어야 해요.';
  return errors;
}

export function validateDraft(draft: ScenarioDraft): { errors: DraftErrors; count: number } {
  const errors: DraftErrors = { stage: {} };
  let count = 0;
  const name = draft.name.trim();
  if (!name) errors.name = '시나리오 이름을 입력해주세요.';
  else if (charLength(name) > LIMITS.scenarioNameMax) errors.name = `시나리오 이름은 ${LIMITS.scenarioNameMax}자 이내로 입력해주세요.`;
  if (errors.name) count++;

  if (draft.stages.length === 0) {
    errors.stages = '단계를 하나 이상 추가해주세요.';
    count++;
  } else if (draft.stages.length > LIMITS.stagesMax) {
    errors.stages = `단계는 최대 ${LIMITS.stagesMax}개까지 만들 수 있어요.`;
    count++;
  }
  for (const stage of draft.stages) {
    const stageErrors = validateStage(stage);
    if (stageErrors.name || stageErrors.time) {
      errors.stage[stage.key] = stageErrors;
      count += (stageErrors.name ? 1 : 0) + (stageErrors.time ? 1 : 0);
    }
  }
  return { errors, count };
}

/** 검사를 통과한 초안을 저장 형식으로 바꾼다. */
export function draftToInput(draft: ScenarioDraft): ScenarioInput {
  return {
    name: draft.name.trim(),
    stages: draft.stages.map((s) => ({ id: s.id, name: s.name.trim(), durationSec: draftDurationSec(s) ?? 0 })),
  };
}

export function draftTotalSec(draft: ScenarioDraft): number {
  return draft.stages.reduce((sum, s) => sum + (draftDurationSec(s) ?? 0), 0);
}

/** 저장된 내용과 비교해 바뀐 것이 있는지 확인한다(빈칸·앞뒤 공백 차이는 무시). */
export function isDraftChanged(draft: ScenarioDraft, saved: ScenarioDraft): boolean {
  const normalize = (d: ScenarioDraft) =>
    JSON.stringify({
      name: d.name.trim(),
      stages: d.stages.map((s) => [s.id, s.name.trim(), draftDurationSec(s)]),
    });
  return normalize(draft) !== normalize(saved);
}
