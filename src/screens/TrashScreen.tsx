import { useCallback, useEffect, useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { InlineAlert } from '../components/InlineAlert';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { ApiError, api, errorMessage } from '../data/api';
import { restoreScenario } from '../data/scenarioStore';
import type { Scenario } from '../data/types';
import { quotedObject } from '../lib/korean';
import { goBack } from '../lib/router';
import { durationText, relativeTimeText, sumDurationSec } from '../lib/time';
import './TrashScreen.css';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: Scenario[]; retentionDays: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function TrashScreen() {
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [purging, setPurging] = useState<Scenario | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .listTrash()
      .then(({ items, retentionDays }) => setState({ status: 'ready', items, retentionDays }))
      .catch((error) => setState({ status: 'error', message: errorMessage(error) }));
  }, []);

  // 화면을 열 때 한 번 불러온다. 이후에는 새로고침 버튼으로만 다시 불러온다.
  useEffect(load, [load]);

  const removeLocal = (id: string) =>
    setState((s) => (s.status === 'ready' ? { ...s, items: s.items.filter((it) => it.id !== id) } : s));

  const onRestore = async (scenario: Scenario) => {
    setBusyId(scenario.id);
    setActionError(null);
    try {
      await restoreScenario(scenario.id);
      removeLocal(scenario.id);
      toast.show({ message: `${quotedObject(scenario.name)} 목록으로 복원했어요.` });
    } catch (error) {
      setActionError(`${quotedObject(scenario.name)} 복원하지 못했어요. ${errorMessage(error)}`);
    } finally {
      setBusyId(null);
    }
  };

  const onPurge = async () => {
    if (!purging) return;
    setPurgeBusy(true);
    setPurgeError(null);
    try {
      await api.purgeScenario(purging.id);
      removeLocal(purging.id);
      toast.show({ message: `${quotedObject(purging.name)} 영구 삭제했어요.` });
      setPurging(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // 다른 기기에서 이미 지운 경우
        removeLocal(purging.id);
        setPurging(null);
      } else {
        setPurgeError(errorMessage(error));
      }
    } finally {
      setPurgeBusy(false);
    }
  };

  const retentionDays = state.status === 'ready' ? state.retentionDays : null;

  return (
    <div className="screen trash-screen">
      <TopBar
        left={<IconButton icon="arrow-left" label="뒤로" onClick={() => goBack({ name: 'list' })} />}
        title="휴지통"
        right={
          <Button size="sm" variant="ghost" icon="refresh" loading={state.status === 'loading'} onClick={load}>
            새로고침
          </Button>
        }
      />
      <main className="screen__body">
        <p className="trash-desc">
          휴지통도 모든 사용자에게 공유돼요.
          {retentionDays !== null && ` 휴지통에 들어온 지 ${retentionDays}일이 지나면 자동으로 영구 삭제돼요.`}
        </p>

        {actionError && (
          <InlineAlert tone="error" className="trash-alert" onDismiss={() => setActionError(null)}>
            {actionError}
          </InlineAlert>
        )}

        {state.status === 'loading' && (
          <div className="trash-loading" role="status">
            <Spinner size={22} />
            <span>불러오는 중…</span>
          </div>
        )}

        {state.status === 'error' && (
          <EmptyState
            icon="offline"
            tone="error"
            title="휴지통을 불러오지 못했어요"
            actions={
              <Button variant="primary" icon="refresh" onClick={load}>
                다시 시도
              </Button>
            }
          >
            {state.message}
          </EmptyState>
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <EmptyState icon="trash" title="휴지통이 비어 있어요">
            목록에서 휴지통으로 옮긴 시나리오가 이곳에 보여요.
          </EmptyState>
        )}

        {state.status === 'ready' && state.items.length > 0 && (
          <ul className="trash-list">
            {state.items.map((scenario) => {
              const deletedAt = scenario.deletedAt ?? scenario.updatedAt;
              const daysLeft = Math.max(0, Math.ceil((Date.parse(deletedAt) + state.retentionDays * DAY_MS - Date.now()) / DAY_MS));
              return (
                <li key={scenario.id} className="trash-row">
                  <div className="trash-row__text">
                    <p className="trash-row__name">{scenario.name}</p>
                    <p className="trash-row__meta">
                      {scenario.stages.length}단계 · {durationText(sumDurationSec(scenario.stages))} ·{' '}
                      {relativeTimeText(deletedAt)} 삭제
                    </p>
                    <p className="trash-row__meta">{daysLeft > 0 ? `${daysLeft}일 뒤 영구 삭제` : '곧 영구 삭제'}</p>
                  </div>
                  <div className="trash-row__actions">
                    <Button
                      size="sm"
                      icon="restore"
                      loading={busyId === scenario.id}
                      disabled={busyId !== null && busyId !== scenario.id}
                      aria-label={`${quotedObject(scenario.name)} 복원`}
                      onClick={() => void onRestore(scenario)}
                    >
                      복원
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-outline"
                      icon="trash"
                      disabled={busyId !== null}
                      aria-label={`${quotedObject(scenario.name)} 영구 삭제`}
                      onClick={() => {
                        setPurgeError(null);
                        setPurging(scenario);
                      }}
                    >
                      영구 삭제
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <ConfirmDialog
        open={purging !== null}
        title="영구 삭제할까요?"
        confirmLabel="영구 삭제"
        tone="danger"
        busy={purgeBusy}
        error={purgeError}
        onCancel={() => setPurging(null)}
        onConfirm={() => void onPurge()}
      >
        <p>
          {purging && quotedObject(purging.name)} 영구 삭제하면 되돌릴 수 없어요. 모든 사용자의 휴지통에서 사라져요.
        </p>
      </ConfirmDialog>
    </div>
  );
}
