import { useRef, useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { InlineAlert } from '../components/InlineAlert';
import { Menu } from '../components/Menu';
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
import { TEMPLATES } from '../data/templates';
import type { Scenario } from '../data/types';
import { isOvertime, isRunning } from '../game/engine';
import { useGameStore } from '../game/gameStore';
import { quotedObject } from '../lib/korean';
import { navigate } from '../lib/router';
import { durationText, sumDurationSec, timeOfDayText } from '../lib/time';
import { RenameDialog } from './RenameDialog';
import { ScenarioDetailSheet } from './ScenarioDetailSheet';
import { SettingsModal } from './SettingsModal';
import './ListScreen.css';

export function ListScreen({ detailId }: { detailId: string | null }) {
  const list = useScenarioList();
  const { game } = useGameStore();
  const toast = useToast();
  const templatesRef = useRef<HTMLHeadingElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState<Scenario | null>(null);
  const [trashing, setTrashing] = useState<Scenario | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const showTemplates = () => {
    templatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    templatesRef.current?.focus({ preventScroll: true });
  };

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
  const isEmpty = hasList && list.items.length === 0;
  // 버건디로 채운 주요 버튼은 화면에 하나만: 진행 중인 게임이 있으면 ‘이어가기’, 없으면 ‘새 시나리오’
  const createVariant = game ? 'secondary' : 'primary';

  return (
    <div className="screen list-screen">
      <TopBar
        variant="brand"
        title={<span lang="en">{APP_CONFIG.name}</span>}
        right={<IconButton icon="settings" label="설정" onClick={() => setSettingsOpen(true)} />}
      />

      {/* 가로 화면: 왼쪽 진행 중인 게임·템플릿, 오른쪽 저장된 시나리오(ListScreen.css) */}
      <main className="screen__body list-layout">
        <ResumeGame />

        <section className="section list-saved" aria-labelledby="saved-title">
          <div className="section__head">
            <h2 id="saved-title" className="section__title">
              저장된 시나리오
              {hasList && <span className="list-count num">{list.items.length}</span>}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              loading={list.status === 'loading'}
              onClick={() => void refreshScenarios()}
            >
              새로고침
            </Button>
          </div>
          <SyncStatus list={list} />

          {actionError && (
            <InlineAlert tone="error" className="list-alert" onDismiss={() => setActionError(null)}>
              {actionError}
            </InlineAlert>
          )}

          {isEmpty && (
            <EmptyState
              icon="list"
              title="저장된 시나리오가 없어요"
              actions={
                <>
                  <Button variant={createVariant} size="lg" icon="plus" onClick={() => navigate({ name: 'new' })}>
                    새로 만들기
                  </Button>
                  <Button size="lg" icon="template" onClick={showTemplates}>
                    템플릿 사용
                  </Button>
                </>
              }
            >
              직접 단계를 만들거나 템플릿으로 시작해 보세요.
            </EmptyState>
          )}

          {!isEmpty && (
            <div className="list-new">
              <Button variant={createVariant} size="lg" icon="plus" block onClick={() => navigate({ name: 'new' })}>
                새 시나리오
              </Button>
            </div>
          )}

          {!hasList && list.status === 'loading' && <LoadingList />}

          {!hasList && list.status === 'offline' && (
            <EmptyState
              icon="offline"
              tone="error"
              title="목록을 불러오지 못했어요"
              actions={
                <Button size="lg" icon="refresh" onClick={() => void refreshScenarios()}>
                  다시 시도
                </Button>
              }
            >
              {list.error}
            </EmptyState>
          )}

          {hasList && list.items.length > 0 && (
            <>
              <ul className="scenario-list">
                {list.items.map((scenario) => (
                  <ScenarioRow
                    key={scenario.id}
                    scenario={scenario}
                    onRename={() => setRenaming(scenario)}
                    onDuplicate={() => void onDuplicate(scenario)}
                    onTrash={() => {
                      setTrashError(null);
                      setTrashing(scenario);
                    }}
                  />
                ))}
              </ul>
            </>
          )}

          <div className="list-footer">
            <Button variant="ghost" size="sm" icon="trash" onClick={() => navigate({ name: 'trash' })}>
              휴지통 보기
            </Button>
          </div>
        </section>

        <section className="section list-templates" aria-labelledby="template-title">
          <div className="section__head">
            <h2 id="template-title" className="section__title" ref={templatesRef} tabIndex={-1}>
              템플릿으로 만들기
            </h2>
          </div>
          <p className="section__desc template-desc">템플릿을 고르면 단계가 채워진 편집 화면이 열려요. 저장해야 목록에 추가돼요.</p>
          <ul className="template-list">
            {TEMPLATES.map((template) => (
              <li key={template.key} className="template-row">
                <div className="template-row__text">
                  <p className="template-row__name">{template.name}</p>
                  <p className="template-row__meta">
                    {template.stages.length}단계 · {durationText(sumDurationSec(template.stages))}
                  </p>
                  <p className="template-row__desc">{template.description}</p>
                </div>
                <Button
                  size="sm"
                  icon="template"
                  aria-label={`‘${template.name}’ 템플릿으로 만들기`}
                  onClick={() => navigate({ name: 'new', template: template.key })}
                >
                  만들기
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="list-credit">{APP_CONFIG.credit}</footer>

      <ScenarioDetailSheet id={detailId} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RenameDialog scenario={renaming} onClose={() => setRenaming(null)} />
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
    </div>
  );
}

function SyncStatus({ list }: { list: ScenarioListState }) {
  if (list.source !== 'none' && list.status === 'offline') {
    return (
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
        저장·수정은 연결된 뒤에 할 수 있어요. 게임은 지금도 시작할 수 있어요.
      </InlineAlert>
    );
  }
  return (
    <div className="sync-line">
      <p className="sync-line__state" role="status">
        {list.status === 'loading' ? '불러오는 중…' : list.syncedAt ? `${timeOfDayText(list.syncedAt)} 기준` : ''}
      </p>
    </div>
  );
}

function LoadingList() {
  return (
    <div className="list-loading loading-line" role="status">
      <Spinner size={22} />
      <span>불러오는 중…</span>
    </div>
  );
}

interface ScenarioRowProps {
  scenario: Scenario;
  onRename: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
}

function ScenarioRow({ scenario, onRename, onDuplicate, onTrash }: ScenarioRowProps) {
  const open = () => navigate({ name: 'detail', id: scenario.id });
  return (
    // 행 아무 곳이나 눌러도 ‘열기’와 같다(바로 게임이 시작되지는 않는다).
    <li className="scenario-row" onClick={open}>
      <div className="scenario-row__text">
        <p className="scenario-row__name serif">{scenario.name}</p>
        <p className="scenario-row__meta">
          {scenario.stages.length}단계 · 총 {durationText(sumDurationSec(scenario.stages))}
        </p>
      </div>
      <div className="scenario-row__actions" onClick={(event) => event.stopPropagation()}>
        <Button size="sm" onClick={open} aria-label={`‘${scenario.name}’ 열기`}>
          열기
        </Button>
        <Menu
          label={`‘${scenario.name}’ 더보기`}
          items={[
            { label: '이름 바꾸기', icon: 'edit', onSelect: onRename },
            { label: '복제', icon: 'copy', onSelect: onDuplicate },
            { type: 'separator' },
            { label: '휴지통으로 이동', icon: 'trash', tone: 'danger', onSelect: onTrash },
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
  const state = isOvertime(game, now) ? '시간 초과' : isRunning(game) ? '진행 중' : '일시정지';
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
      <Button variant="primary" size="lg" icon="play" onClick={() => navigate({ name: 'play' })}>
        이어가기
      </Button>
    </section>
  );
}
