import { useMemo, useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { InlineAlert } from '../components/InlineAlert';
import { Menu } from '../components/Menu';
import { SearchField } from '../components/SearchField';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { APP_CONFIG } from '../config';
import { errorMessage } from '../data/api';
import {
  duplicateScenario,
  refreshScenarios,
  restoreScenario,
  trashScenario,
  useScenarioList,
  type ScenarioListState,
} from '../data/scenarioStore';
import { SCENARIO_SORTS, sortLabel, sortScenarios } from '../data/scenarioSort';
import { updateSettings, useSettings } from '../data/settingsStore';
import type { Scenario } from '../data/types';
import { hasStarted, isOvertime, isRunning } from '../game/engine';
import { useGameStore } from '../game/gameStore';
import { useStartGame } from '../game/useStartGame';
import { quotedObject } from '../lib/korean';
import { navigate } from '../lib/router';
import { matchesSearch, searchTerms } from '../lib/search';
import { durationText, sumDurationSec, timeOfDayText } from '../lib/time';
import { NewScenarioDialog } from './NewScenarioDialog';
import { SettingsModal } from './SettingsModal';
import './ListScreen.css';

/**
 * 첫 화면: 저장된 시나리오 목록 하나를 가운데 한 열로 보여 준다.
 * 설명·시간·버튼은 고딕(ui-gothic), 앱 이름·시나리오 제목만 명조.
 */
export function ListScreen() {
  const list = useScenarioList();
  const toast = useToast();
  const startGame = useStartGame({ replace: false });
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashing, setTrashing] = useState<Scenario | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 검색어는 이 화면에 있는 동안만 둔다(다른 화면에 다녀오면 전체 목록부터 보여 준다).
  const [query, setQuery] = useState('');
  const searching = searchTerms(query).length > 0;
  // 정렬 기준은 이 기기에 저장해 다음에 열 때도 그대로 쓴다.
  const { listSort } = useSettings();
  const shown = useMemo(
    () => sortScenarios(list.items.filter((it) => matchesSearch(it.name, query)), listSort),
    [list.items, query, listSort],
  );

  const onDuplicate = async (scenario: Scenario) => {
    setActionError(null);
    try {
      const copy = await duplicateScenario(scenario.id);
      toast.show({ message: `${quotedObject(copy.name)} 만들었어요.` });
    } catch (error) {
      setActionError(`${quotedObject(scenario.name)} 복제하지 못했어요. ${errorMessage(error)}`);
    }
  };

  const onConfirmTrash = async () => {
    if (!trashing) return;
    setTrashBusy(true);
    setTrashError(null);
    try {
      const item = await trashScenario(trashing.id);
      setTrashing(null);
      toast.show({
        message: `${quotedObject(item.name)} 휴지통으로 옮겼어요.`,
        action: {
          label: '되돌리기',
          onClick: () => {
            restoreScenario(item.id).catch((error) =>
              setActionError(`${quotedObject(item.name)} 되돌리지 못했어요. ${errorMessage(error)} 휴지통에서 복원할 수 있어요.`),
            );
          },
        },
      });
    } catch (error) {
      setTrashError(errorMessage(error));
    } finally {
      setTrashBusy(false);
    }
  };

  const hasList = list.source !== 'none';
  const offline = list.status === 'offline';

  return (
    <div className="screen list-screen ui-gothic">
      <TopBar
        variant="brand"
        title={<span lang="en">{APP_CONFIG.name}</span>}
        right={<IconButton icon="settings" label="설정" size={20} onClick={() => setSettingsOpen(true)} />}
      />

      <main className="screen__body list-body">
        <ResumeGame />

        <section className="list-section" aria-labelledby="saved-title">
          <div className="list-head">
            <h2 id="saved-title" className="list-head__title">
              내 시나리오
              {hasList && (
                <span className="list-head__count">
                  {list.items.length}
                  <span className="visually-hidden">개</span>
                </span>
              )}
            </h2>
            <Button variant="primary" icon="plus" className="list-head__new" onClick={() => setCreating(true)}>
              새 시나리오
            </Button>
          </div>

          {hasList && list.items.length > 0 && (
            <div className="list-tools">
              <SearchField
                label="시나리오 이름 검색"
                placeholder="이름·초성 검색"
                className="list-tools__search"
                value={query}
                onChange={setQuery}
              />
              <Menu
                label="정렬 기준"
                className="ui-gothic"
                trigger={{
                  icon: 'sort',
                  text: sortLabel(listSort),
                  buttonLabel: `정렬 기준: ${sortLabel(listSort)}`,
                  className: 'list-tools__sort',
                }}
                items={SCENARIO_SORTS.map((option) => ({
                  label: option.label,
                  checked: option.value === listSort,
                  onSelect: () => updateSettings({ listSort: option.value }),
                }))}
              />
            </div>
          )}

          {hasList && offline && (
            <InlineAlert
              tone="offline"
              className="list-alert"
              title="오프라인 · 저장된 목록 표시 중"
              actions={
                <Button size="sm" icon="refresh" onClick={() => void refreshScenarios()}>
                  다시 연결
                </Button>
              }
            >
              {list.syncedAt ? `${timeOfDayText(list.syncedAt)}에 받아 둔 목록이에요. ` : ''}
              저장·수정은 연결된 뒤에 할 수 있어요. 게임은 지금도 실행할 수 있어요.
            </InlineAlert>
          )}

          {actionError && (
            <InlineAlert tone="error" className="list-alert" onDismiss={() => setActionError(null)}>
              {actionError}
            </InlineAlert>
          )}

          <div className="list-panel">
            {!hasList && list.status === 'loading' && (
              <div className="list-loading loading-line" role="status">
                <Spinner size={22} />
                <span>불러오는 중…</span>
              </div>
            )}

            {!hasList && offline && (
              <EmptyState
                icon="offline"
                tone="error"
                title="목록을 불러오지 못했어요"
                actions={
                  <Button icon="refresh" onClick={() => void refreshScenarios()}>
                    다시 시도
                  </Button>
                }
              >
                {list.error}
              </EmptyState>
            )}

            {hasList && list.items.length === 0 && (
              <div className="list-empty">
                <p className="list-empty__title">저장된 시나리오가 없어요</p>
                <p className="list-empty__body">‘새 시나리오’에서 템플릿을 고르거나 직접 구성해 보세요.</p>
              </div>
            )}

            {hasList && list.items.length > 0 && shown.length === 0 && (
              <div className="list-empty">
                <p className="list-empty__title">‘{query.trim()}’ 검색 결과가 없어요</p>
                <p className="list-empty__body">초성(예: ㅈㅌ → 저택)으로도 찾을 수 있어요.</p>
                <Button size="sm" className="list-empty__action" onClick={() => setQuery('')}>
                  전체 목록 보기
                </Button>
              </div>
            )}

            {shown.length > 0 && (
              <ul className="scenario-list">
                {shown.map((scenario) => (
                  <ScenarioRow
                    key={scenario.id}
                    scenario={scenario}
                    onRun={() => startGame.request({ id: scenario.id, name: scenario.name, stages: scenario.stages })}
                    onDuplicate={() => void onDuplicate(scenario)}
                    onTrash={() => {
                      setTrashError(null);
                      setTrashing(scenario);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* 입력할 때마다 걸러진 개수를 화면 낭독기에 알린다(목록 자체가 보이는 결과다). */}
          <p className="visually-hidden" role="status">
            {hasList && list.items.length > 0 && searching ? `검색 결과 ${shown.length}개` : ''}
          </p>

          <div className="list-foot">
            <SyncStatus list={list} />
            <Button variant="ghost" size="sm" icon="trash" className="list-foot__trash" onClick={() => navigate({ name: 'trash' })}>
              휴지통
            </Button>
          </div>
        </section>
      </main>

      <footer className="list-credit">{APP_CONFIG.credit}</footer>

      <NewScenarioDialog open={creating} onClose={() => setCreating(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConfirmDialog
        open={trashing !== null}
        title="휴지통으로 옮길까요?"
        confirmLabel="휴지통으로 이동"
        tone="danger"
        busy={trashBusy}
        error={trashError}
        onCancel={() => setTrashing(null)}
        onConfirm={() => void onConfirmTrash()}
      >
        <p>
          {trashing && quotedObject(trashing.name)} 휴지통으로 옮겨요. 모든 사용자의 목록에서 사라지며, 휴지통에서 다시
          복원할 수 있어요.
        </p>
      </ConfirmDialog>
      {startGame.dialog}
    </div>
  );
}

/** 목록 아래 왼쪽: 작은 새로고침 버튼과 마지막으로 불러온 시각 */
function SyncStatus({ list }: { list: ScenarioListState }) {
  const loading = list.status === 'loading';
  const text = loading
    ? '불러오는 중…'
    : list.status === 'offline'
      ? '오프라인'
      : list.syncedAt
        ? `${timeOfDayText(list.syncedAt)} 기준`
        : '';
  return (
    <div className="list-sync">
      <Button
        variant="ghost"
        size="sm"
        icon="refresh"
        className="list-sync__refresh"
        aria-label="목록 새로고침"
        title="목록 새로고침"
        loading={loading}
        onClick={() => void refreshScenarios()}
      />
      <span className="list-sync__state" role="status">
        {text}
      </span>
    </div>
  );
}

interface ScenarioRowProps {
  scenario: Scenario;
  onRun: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
}

function ScenarioRow({ scenario, onRun, onDuplicate, onTrash }: ScenarioRowProps) {
  return (
    <li className="scenario-row">
      <div className="scenario-row__text">
        <p className="scenario-row__name serif">{scenario.name}</p>
        <p className="scenario-row__meta">
          {scenario.stages.length}단계 · 총 {durationText(sumDurationSec(scenario.stages))}
        </p>
      </div>
      <div className="scenario-row__actions">
        {/* 진행 화면으로 이동만 한다. 카운트다운은 진행 화면의 ‘시작’으로 시작한다. */}
        <Button icon="play" className="scenario-row__run" aria-label={`‘${scenario.name}’ 실행`} onClick={onRun}>
          실행
        </Button>
        <Menu
          label={`‘${scenario.name}’ 더보기`}
          className="ui-gothic"
          items={[
            { label: '편집', icon: 'edit', onSelect: () => navigate({ name: 'edit', id: scenario.id }) },
            { label: '복제', icon: 'copy', onSelect: onDuplicate },
            { type: 'separator' },
            { label: '삭제', icon: 'trash', tone: 'danger', onSelect: onTrash },
          ]}
        />
      </div>
    </li>
  );
}

function ResumeGame() {
  const { game } = useGameStore();
  if (!game) return null;
  const now = Date.now();
  const stage = game.stages[game.current];
  const state = !hasStarted(game)
    ? '시작 전'
    : isOvertime(game, now)
      ? '시간 초과'
      : isRunning(game)
        ? '진행 중'
        : '일시정지';
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return (
    <section className="resume" aria-labelledby="resume-title">
      <div className="resume__text">
        <h2 id="resume-title" className="resume__eyebrow">
          진행 중인 게임
        </h2>
        <p className="resume__name serif">{game.scenarioName}</p>
        <p className="resume__meta">
          <span className="num" aria-label={`전체 ${game.stages.length}단계 중 ${game.current + 1}단계`}>
            {pad2(game.current + 1)} / {pad2(game.stages.length)}
          </span>
          <span aria-hidden="true"> · </span>
          {stage.name} · {state}
        </p>
      </div>
      <Button icon="play" className="resume__go" onClick={() => navigate({ name: 'play' })}>
        이어가기
      </Button>
    </section>
  );
}
