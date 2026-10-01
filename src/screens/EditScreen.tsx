import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { ActionDialog, ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { InlineAlert } from '../components/InlineAlert';
import { Spinner } from '../components/Spinner';
import { FieldError, TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { ApiError, errorMessage } from '../data/api';
import {
  draftToInput,
  draftTotalSec,
  emptyStageDraft,
  isDraftChanged,
  scenarioToDraft,
  stageToDraft,
  validateDraft,
  type ScenarioDraft,
  type StageDraft,
} from '../data/draft';
import { LIMITS } from '../data/limits';
import { applyServerCopy, createScenario, forgetScenario, updateScenario, useScenarioList } from '../data/scenarioStore';
import { findTemplate, type Template } from '../data/templates';
import type { Scenario } from '../data/types';
import { createId } from '../lib/id';
import { quotedObject } from '../lib/korean';
import { useSoftKeyboardOpen } from '../lib/device';
import { QUICK_INPUT_EXAMPLE, parseQuickInput, type ParseError, type ParsedStage } from '../lib/quickInput';
import { goBack, navigate, setLeaveGuard, type Route } from '../lib/router';
import { durationText, relativeTimeText } from '../lib/time';
import { StageRow } from './StageRow';
import { useDragReorder } from './useDragReorder';
import './EditScreen.css';

interface EditScreenProps {
  scenarioId?: string;
  templateKey?: string;
}

/** 편집할 시나리오를 찾은 뒤 편집기를 띄운다. 한 번 띄운 편집기는 목록이 바뀌어도 내용을 유지한다. */
export function EditScreen({ scenarioId, templateKey }: EditScreenProps) {
  const list = useScenarioList();
  const found = scenarioId ? list.items.find((it) => it.id === scenarioId) : undefined;
  const [frozen, setFrozen] = useState<Scenario | undefined>(found);

  useEffect(() => {
    if (!frozen && found) setFrozen(found);
  }, [frozen, found]);

  if (!scenarioId) return <ScenarioEditor template={findTemplate(templateKey)} />;
  const scenario = frozen ?? found;
  if (scenario) return <ScenarioEditor scenario={scenario} />;

  const back = () => goBack({ name: 'list' });
  return (
    <div className="screen">
      <TopBar
        left={<IconButton icon="arrow-left" label="뒤로" onClick={back} />}
        title="시나리오 편집"
      />
      <main className="screen__body">
        {list.status === 'loading' ? (
          <div className="edit-loading" role="status">
            <Spinner size={22} />
            <span>불러오는 중…</span>
          </div>
        ) : (
          <EmptyState
            icon="alert"
            title="시나리오를 찾을 수 없어요"
            actions={
              <Button variant="primary" onClick={() => navigate({ name: 'list' }, { replace: true })}>
                시나리오 목록으로
              </Button>
            }
          >
            다른 기기에서 휴지통으로 옮겼거나 삭제했을 수 있어요.
          </EmptyState>
        )}
      </main>
    </div>
  );
}

type FieldKey = string; // 'name' | `${stageKey}:name` | `${stageKey}:time`
type LeaveTarget = { kind: 'back' } | { kind: 'route'; route: Route };

function initialDraft(scenario?: Scenario, template?: Template): ScenarioDraft {
  if (scenario) return scenarioToDraft(scenario);
  if (template) return { name: template.name, stages: template.stages.map(stageToDraft) };
  return { name: '', stages: [] };
}

function ScenarioEditor({ scenario, template }: { scenario?: Scenario; template?: Template }) {
  const toast = useToast();
  const quickId = useId();
  const keyboardOpen = useSoftKeyboardOpen();
  const barRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<ScenarioDraft>(() => initialDraft(scenario, template));
  // 저장된 내용(변경 여부 비교 기준). 템플릿으로 만든 새 시나리오는 아직 저장 전이므로 빈 초안이 기준이다.
  const [baseline] = useState<ScenarioDraft>(() => (scenario ? scenarioToDraft(scenario) : { name: '', stages: [] }));
  const [rev, setRev] = useState(scenario?.rev ?? null);
  const scenarioId = scenario?.id ?? null;

  const [touched, setTouched] = useState<Set<FieldKey>>(() => new Set());
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<FieldKey, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Scenario | null>(null);
  const [gone, setGone] = useState<'trashed' | 'not_found' | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<LeaveTarget | null>(null);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickErrors, setQuickErrors] = useState<ParseError[]>([]);
  const [quickPending, setQuickPending] = useState<ParsedStage[] | null>(null);
  const [quickDone, setQuickDone] = useState<string | null>(null);

  const [focusRequest, setFocusRequest] = useState<{ key: string; field: string } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const dirty = isDraftChanged(draft, baseline);
  const { errors, count: errorCount } = validateDraft(draft);
  const totalSec = draftTotalSec(draft);
  const atStageLimit = draft.stages.length >= LIMITS.stagesMax;

  const visible = (field: FieldKey) => showAllErrors || touched.has(field);
  const nameError = serverErrors.name ?? (visible('name') ? errors.name : undefined);
  const stagesError = showAllErrors ? errors.stages : undefined;

  /* ---------- 나가기 전 확인 ---------- */

  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard((next) => {
      setLeaveTarget({ kind: 'route', route: next });
      return false;
    });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const fallbackRoute: Route = scenarioId ? { name: 'detail', id: scenarioId } : { name: 'list' };

  const leave = (target: LeaveTarget) => {
    setLeaveGuard(null);
    setLeaveTarget(null);
    // 브라우저 뒤로 가기로 나가려던 경우에도 기록을 한 칸 되돌려 이동한다.
    goBack(target.kind === 'back' ? fallbackRoute : target.route);
  };

  const requestBack = () => (dirty ? setLeaveTarget({ kind: 'back' }) : goBack(fallbackRoute));

  /* ---------- 초점 이동 ---------- */

  useLayoutEffect(() => {
    if (!focusRequest) return;
    const row = document.querySelector<HTMLElement>(`[data-stage-key="${focusRequest.key}"]`);
    const target = row?.querySelector<HTMLElement>(`[data-field="${focusRequest.field}"], [data-tool="${focusRequest.field}"]`);
    if (target && !(target as HTMLButtonElement).disabled) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      row?.querySelector<HTMLElement>('.stage-row__handle')?.focus({ preventScroll: true });
    }
    setFocusRequest(null);
  }, [focusRequest]);

  useEffect(() => {
    if (!scenario && !template) nameRef.current?.focus();
  }, [scenario, template]);

  /* ---------- 단계 편집 ---------- */

  const clearServerError = (field: FieldKey) =>
    setServerErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const touch = (field: FieldKey) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  // 오류는 값을 고친 뒤(또는 저장을 누른 뒤)에만 보여 준다. 초점이 빠질 때 오류가 새로 생기면
  // 아래 요소가 밀려 바로 다음 터치가 빗나갈 수 있기 때문이다.
  const updateStage = (key: string, patch: Partial<StageDraft>) => {
    setDraft((d) => ({ ...d, stages: d.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
    if ('name' in patch) {
      touch(`${key}:name`);
      clearServerError(`${key}:name`);
    }
    if ('minutes' in patch || 'seconds' in patch) {
      touch(`${key}:time`);
      clearServerError(`${key}:time`);
    }
    setSaveError(null);
  };

  const moveStage = useCallback((from: number, to: number) => {
    setDraft((d) => {
      if (to < 0 || to >= d.stages.length) return d;
      const stages = [...d.stages];
      const [moved] = stages.splice(from, 1);
      stages.splice(to, 0, moved);
      return { ...d, stages };
    });
    setAnnouncement(`${from + 1}번 단계를 ${to + 1}번째로 옮겼어요.`);
  }, []);

  const moveBy = (key: string, delta: -1 | 1) => {
    const from = draft.stages.findIndex((s) => s.key === key);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= draft.stages.length) return;
    moveStage(from, to);
    setFocusRequest({ key, field: delta < 0 ? 'up' : 'down' });
  };

  const addStage = () => {
    if (atStageLimit) return;
    const stage = emptyStageDraft();
    setDraft((d) => ({ ...d, stages: [...d.stages, stage] }));
    setFocusRequest({ key: stage.key, field: 'name' });
  };

  const duplicateStage = (key: string) => {
    if (atStageLimit) return;
    const index = draft.stages.findIndex((s) => s.key === key);
    if (index === -1) return;
    const copy = { ...draft.stages[index], key: createId(), id: createId() };
    setDraft((d) => {
      const stages = [...d.stages];
      stages.splice(index + 1, 0, copy);
      return { ...d, stages };
    });
    setFocusRequest({ key: copy.key, field: 'name' });
    setAnnouncement(`${index + 1}번 단계를 복제했어요.`);
  };

  const deleteStage = (key: string) => {
    const index = draft.stages.findIndex((s) => s.key === key);
    if (index === -1) return;
    const removed = draft.stages[index];
    setDraft((d) => ({ ...d, stages: d.stages.filter((s) => s.key !== key) }));
    const neighbor = draft.stages[index + 1] ?? draft.stages[index - 1];
    if (neighbor) setFocusRequest({ key: neighbor.key, field: 'name' });
    const removedName = removed.name.trim();
    toast.show({
      message: removedName
        ? `${index + 1}번 단계 ${quotedObject(removedName)} 삭제했어요.`
        : `${index + 1}번 단계를 삭제했어요.`,
      action: {
        label: '되돌리기',
        onClick: () => {
          setDraft((d) => {
            if (d.stages.some((s) => s.key === removed.key)) return d;
            const stages = [...d.stages];
            stages.splice(Math.min(index, stages.length), 0, removed);
            return { ...d, stages };
          });
          setFocusRequest({ key: removed.key, field: 'name' });
        },
      },
    });
  };

  const dragKeys = draft.stages.map((s) => s.key);
  const barHeight = keyboardOpen ? 0 : (barRef.current?.offsetHeight ?? 0);
  const { drag, registerRow, handleProps, rowStyle } = useDragReorder(dragKeys, moveStage, barHeight);

  /* ---------- 빠른 입력 ---------- */

  const applyQuick = (parsed: ParsedStage[], mode: 'append' | 'replace') => {
    const created = parsed.map((p) => stageToDraft({ name: p.name, durationSec: p.durationSec }));
    if (mode === 'append' && draft.stages.length + created.length > LIMITS.stagesMax) {
      setQuickPending(null);
      setQuickErrors([
        { line: 0, text: '', message: `단계는 최대 ${LIMITS.stagesMax}개까지예요. 지금 ${draft.stages.length}개가 있어요.` },
      ]);
      return;
    }
    setDraft((d) => ({ ...d, stages: mode === 'append' ? [...d.stages, ...created] : created }));
    setQuickPending(null);
    setQuickText('');
    setQuickErrors([]);
    setQuickDone(
      mode === 'append' ? `단계 ${created.length}개를 뒤에 추가했어요.` : `단계 ${created.length}개로 바꿨어요.`,
    );
    setSaveError(null);
  };

  const convertQuick = () => {
    setQuickDone(null);
    const { stages, errors: parseErrors } = parseQuickInput(quickText);
    if (parseErrors.length > 0) return setQuickErrors(parseErrors);
    if (stages.length === 0) {
      return setQuickErrors([{ line: 0, text: '', message: '변환할 내용이 없어요. 한 줄에 한 단계씩 적어주세요.' }]);
    }
    if (stages.length > LIMITS.stagesMax) {
      return setQuickErrors([{ line: 0, text: '', message: `단계는 최대 ${LIMITS.stagesMax}개까지 만들 수 있어요.` }]);
    }
    setQuickErrors([]);
    // 기존 단계가 있으면 말없이 덮어쓰지 않고 추가/교체를 고르게 한다.
    if (draft.stages.length > 0) setQuickPending(stages);
    else applyQuick(stages, 'replace');
  };

  /* ---------- 저장 ---------- */

  const focusFirstError = () => {
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>('.edit-screen [aria-invalid="true"], .edit-screen [data-error-anchor]');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus?.({ preventScroll: true });
    }, 0);
  };

  const finishSave = (item: Scenario, isNew: boolean) => {
    setLeaveGuard(null);
    setRev(item.rev);
    toast.show({ message: '저장했어요.' });
    if (isNew) navigate({ name: 'detail', id: item.id }, { replace: true });
    else goBack({ name: 'detail', id: item.id });
  };

  const handleSaveError = (error: unknown) => {
    if (error instanceof ApiError && error.kind === 'http') {
      if (error.code === 'conflict' && error.item) return setConflict(error.item);
      if (error.code === 'trashed' || error.code === 'not_found') {
        if (error.item) applyServerCopy(error.item);
        else if (scenarioId) forgetScenario(scenarioId);
        return setGone(error.code);
      }
      if (error.code === 'validation' && error.fields) {
        const mapped: Record<FieldKey, string> = {};
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === 'name') {
            mapped.name = message;
            continue;
          }
          const match = field.match(/^stages\.(\d+)\.(name|durationSec)$/);
          const stage = match && draft.stages[Number(match[1])];
          if (stage) mapped[`${stage.key}:${match[2] === 'name' ? 'name' : 'time'}`] = message;
        }
        setServerErrors(mapped);
        setShowAllErrors(true);
        if (Object.keys(mapped).length === 0) setSaveError(error.message);
        focusFirstError();
        return;
      }
    }
    setSaveError(errorMessage(error));
  };

  const runSave = async (action: () => Promise<Scenario>, isNew: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      finishSave(await action(), isNew);
    } catch (error) {
      handleSaveError(error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const save = () => {
    if (errorCount > 0) {
      setShowAllErrors(true);
      focusFirstError();
      return;
    }
    const input = draftToInput(draft);
    if (scenarioId && rev !== null) void runSave(() => updateScenario(scenarioId, input, rev), false);
    else void runSave(() => createScenario(input), true);
  };

  const overwrite = () => {
    if (!conflict || !scenarioId) return;
    const serverRev = conflict.rev;
    setConflict(null);
    void runSave(() => updateScenario(scenarioId, draftToInput(draft), serverRev), false);
  };

  const saveAsNew = () => {
    setGone(null);
    void runSave(() => createScenario(draftToInput(draft)), true);
  };

  /* ---------- 화면 ---------- */

  const stageErrorsFor = (stage: StageDraft) => {
    const local = errors.stage[stage.key] ?? {};
    return {
      name: serverErrors[`${stage.key}:name`] ?? (visible(`${stage.key}:name`) ? local.name : undefined),
      time: serverErrors[`${stage.key}:time`] ?? (visible(`${stage.key}:time`) ? local.time : undefined),
    };
  };
  const shownErrorCount = showAllErrors ? errorCount + Object.keys(serverErrors).length : 0;

  return (
    <div className="screen edit-screen">
      <TopBar
        left={<IconButton icon="arrow-left" label="뒤로" onClick={requestBack} />}
        title={scenarioId ? '시나리오 편집' : '새 시나리오'}
      />

      <main className="screen__body edit-body">
        <section className="edit-section">
          <TextField
            ref={nameRef}
            label="시나리오 이름"
            value={draft.name}
            placeholder="예: 저택의 밤"
            maxChars={LIMITS.scenarioNameMax}
            error={nameError}
            autoComplete="off"
            enterKeyHint="next"
            onChange={(name) => {
              setDraft((d) => ({ ...d, name }));
              touch('name');
              clearServerError('name');
              setSaveError(null);
            }}
          />
        </section>

        <section className="edit-section" aria-labelledby="stages-title">
          <div className="edit-section__head">
            <h2 id="stages-title" className="section__title">
              단계 <span className="list-count num">{draft.stages.length}</span>
            </h2>
            {draft.stages.length > 1 && <p className="edit-section__hint">손잡이(⋮⋮)를 끌어 순서를 바꿀 수 있어요.</p>}
          </div>

          {draft.stages.length === 0 ? (
            <div className="stage-empty" data-error-anchor={stagesError ? true : undefined} tabIndex={-1}>
              <p>아직 단계가 없어요.</p>
              <p className="text-3">‘단계 추가’를 누르거나 빠른 입력으로 여러 단계를 한 번에 만들 수 있어요.</p>
              {stagesError && <FieldError>{stagesError}</FieldError>}
            </div>
          ) : (
            <ol className={['stage-list', drag && 'stage-list--dragging'].filter(Boolean).join(' ')}>
              {draft.stages.map((stage, index) => (
                <StageRow
                  key={stage.key}
                  stage={stage}
                  index={index}
                  total={draft.stages.length}
                  errors={stageErrorsFor(stage)}
                  canDuplicate={!atStageLimit}
                  dragging={drag?.key === stage.key}
                  style={rowStyle(stage.key, index)}
                  rowRef={registerRow(stage.key)}
                  handleProps={handleProps(stage.key)}
                  onChange={(patch) => updateStage(stage.key, patch)}
                  onMove={(delta) => moveBy(stage.key, delta)}
                  onDuplicate={() => duplicateStage(stage.key)}
                  onDelete={() => deleteStage(stage.key)}
                />
              ))}
            </ol>
          )}

          <Button block icon="plus" className="add-stage" onClick={addStage} disabled={atStageLimit}>
            단계 추가
          </Button>
          {atStageLimit && <p className="field__hint">단계는 최대 {LIMITS.stagesMax}개까지 만들 수 있어요.</p>}

          <div className="quick">
            <button
              type="button"
              className="quick__toggle"
              aria-expanded={quickOpen}
              aria-controls={quickId}
              onClick={() => setQuickOpen((v) => !v)}
            >
              <Icon name="list" size={20} />
              <span className="quick__toggle-text">
                <span className="quick__title">빠른 입력</span>
                <span className="quick__subtitle">여러 단계를 글로 한 번에 만들기</span>
              </span>
              <Icon name={quickOpen ? 'chevron-up' : 'chevron-down'} size={20} />
            </button>
            <div id={quickId} className="quick__panel" hidden={!quickOpen}>
              <p className="quick__help">
                한 줄에 한 단계씩 <strong>이름</strong>과 <strong>시간</strong>을 적어 주세요. 시간은 <code>20</code>(분),{' '}
                <code>15:30</code>(분:초), <code>7분 30초</code>처럼 쓸 수 있어요.
              </p>
              <div className="quick__example">
                <p className="quick__example-title">입력 예시</p>
                <pre>{QUICK_INPUT_EXAMPLE}</pre>
              </div>
              <label className="visually-hidden" htmlFor={`${quickId}-text`}>
                빠른 입력 내용
              </label>
              <textarea
                id={`${quickId}-text`}
                className="input quick__textarea"
                rows={6}
                value={quickText}
                placeholder="여기에 입력하거나 붙여 넣으세요"
                aria-invalid={quickErrors.length > 0 ? true : undefined}
                aria-describedby={quickErrors.length > 0 ? `${quickId}-errors` : undefined}
                onChange={(event) => {
                  setQuickText(event.target.value);
                  setQuickErrors([]);
                  setQuickDone(null);
                }}
              />
              {quickErrors.length > 0 && (
                <ul id={`${quickId}-errors`} className="quick__errors" role="alert">
                  {quickErrors.map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      <FieldError>
                        {e.line > 0 && <strong>{e.line}번째 줄</strong>}
                        {e.line > 0 && e.text && <span className="quick__error-text"> ‘{e.text}’</span>}
                        {e.line > 0 && ': '}
                        {e.message}
                      </FieldError>
                    </li>
                  ))}
                </ul>
              )}
              {quickDone && (
                <p className="quick__done" role="status">
                  <Icon name="check" size={16} /> {quickDone}
                </p>
              )}
              <div className="quick__actions">
                <Button icon="check" onClick={convertQuick} disabled={quickText.trim() === ''}>
                  단계로 변환
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div
          ref={barRef}
          className={['edit-bar', keyboardOpen && 'edit-bar--static'].filter(Boolean).join(' ')}
        >
          {saveError && (
            <InlineAlert
              tone="error"
              className="edit-bar__alert"
              title="저장하지 못했어요. 입력한 내용은 그대로 있어요."
              onDismiss={() => setSaveError(null)}
            >
              {saveError}
            </InlineAlert>
          )}
          {shownErrorCount > 0 && (
            <button type="button" className="edit-bar__errors" onClick={focusFirstError}>
              <Icon name="alert" size={16} />
              입력 오류 {shownErrorCount}개를 확인해 주세요
            </button>
          )}
          <div className="edit-bar__row">
            <div className="edit-bar__total">
              <span className="edit-bar__label">총 계획 시간</span>
              <span className="edit-bar__value">
                {durationText(totalSec)}
                <span className="edit-bar__count"> · {draft.stages.length}단계</span>
              </span>
            </div>
            <Button
              variant="primary"
              size="lg"
              icon={saveError ? 'refresh' : 'check'}
              loading={saving}
              onClick={save}
              className="edit-bar__save"
            >
              {saving ? '저장 중…' : saveError ? '다시 저장' : '저장'}
            </Button>
          </div>
        </div>
      </main>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <ActionDialog
        open={quickPending !== null}
        title="기존 단계가 있어요"
        stacked
        onClose={() => setQuickPending(null)}
        actions={[
          { label: '취소', onClick: () => setQuickPending(null), autoFocus: true },
          {
            label: `전체 교체 (기존 ${draft.stages.length}개 삭제)`,
            variant: 'danger-outline',
            onClick: () => quickPending && applyQuick(quickPending, 'replace'),
          },
          {
            label: '뒤에 추가',
            variant: 'primary',
            onClick: () => quickPending && applyQuick(quickPending, 'append'),
          },
        ]}
      >
        <p>
          지금 단계가 {draft.stages.length}개 있어요. 빠른 입력으로 만든 단계 {quickPending?.length ?? 0}개를 어떻게
          넣을까요?
        </p>
      </ActionDialog>

      <ActionDialog
        open={leaveTarget !== null}
        title="저장하지 않은 변경 사항이 있어요"
        onClose={() => setLeaveTarget(null)}
        actions={[
          { label: '계속 편집', onClick: () => setLeaveTarget(null), autoFocus: true },
          { label: '저장하지 않고 나가기', variant: 'danger', onClick: () => leaveTarget && leave(leaveTarget) },
        ]}
      >
        <p>지금 나가면 변경한 내용이 사라져요.</p>
      </ActionDialog>

      <ConfirmDialog
        open={conflict !== null}
        title="다른 기기에서 먼저 수정했어요"
        confirmLabel="내 내용으로 덮어쓰기"
        cancelLabel="편집 계속"
        tone="danger"
        onCancel={() => setConflict(null)}
        onConfirm={overwrite}
      >
        <p>
          편집을 시작한 뒤 다른 기기에서 이 시나리오가 저장됐어요
          {conflict && ` (${relativeTimeText(conflict.updatedAt)}, ${conflict.stages.length}단계)`}. 덮어쓰면 그
          변경 내용은 사라져요.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={gone !== null}
        title={gone === 'trashed' ? '이 시나리오는 휴지통으로 이동됐어요' : '이 시나리오는 삭제됐어요'}
        confirmLabel="새 시나리오로 저장"
        onCancel={() => setGone(null)}
        onConfirm={saveAsNew}
      >
        <p>
          다른 기기에서 {gone === 'trashed' ? '휴지통으로 옮긴' : '영구 삭제한'} 시나리오예요. 지금 편집한 내용을 새
          시나리오로 저장할 수 있어요.
        </p>
      </ConfirmDialog>
    </div>
  );
}
