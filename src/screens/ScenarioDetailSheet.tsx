import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { useScenarioList } from '../data/scenarioStore';
import { useStartGame } from '../game/useStartGame';
import { goBack, navigate } from '../lib/router';
import { clockText, durationText, relativeTimeText, sumDurationSec } from '../lib/time';
import './ScenarioDetailSheet.css';

/** ‘열기’: 단계 구성과 시간을 확인하고 편집 또는 게임 시작을 고른다. */
export function ScenarioDetailSheet({ id }: { id: string | null }) {
  const list = useScenarioList();
  const startGame = useStartGame();
  const close = () => goBack({ name: 'list' });

  if (id === null) return null;
  const scenario = list.items.find((it) => it.id === id);

  if (!scenario) {
    const loading = list.status === 'loading';
    return (
      <Modal
        open
        variant="sheet"
        onClose={close}
        title={loading ? '불러오는 중' : '시나리오를 찾을 수 없어요'}
        footer={
          <Button size="lg" onClick={close}>
            목록으로
          </Button>
        }
      >
        {loading ? (
          <div className="detail-loading" role="status">
            <Spinner size={22} />
            <span>불러오는 중…</span>
          </div>
        ) : (
          <p>다른 기기에서 휴지통으로 옮겼거나 삭제했을 수 있어요. 목록에서 새로고침해 보세요.</p>
        )}
      </Modal>
    );
  }

  const total = sumDurationSec(scenario.stages);
  return (
    <>
      <Modal
        open
        variant="sheet"
        onClose={close}
        title={<span className="serif detail-title">{scenario.name}</span>}
        subtitle={
          <>
            {scenario.stages.length}단계 · 총 {durationText(total)}
            <span className="detail-updated"> · {relativeTimeText(scenario.updatedAt)} 수정</span>
          </>
        }
        footer={
          <>
            <Button size="lg" icon="edit" onClick={() => navigate({ name: 'edit', id: scenario.id })}>
              편집
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon="play"
              onClick={() => startGame.request({ id: scenario.id, name: scenario.name, stages: scenario.stages })}
            >
              게임 시작
            </Button>
          </>
        }
      >
        <ol
          className={['stage-preview', scenario.stages.length > 6 && 'stage-preview--columns'].filter(Boolean).join(' ')}
          aria-label="단계 구성"
        >
          {scenario.stages.map((stage, index) => (
            <li key={stage.id} className="stage-preview__row">
              <span className="stage-preview__index num">{String(index + 1).padStart(2, '0')}</span>
              <span className="stage-preview__name">{stage.name}</span>
              <span className="stage-preview__time num">{clockText(stage.durationSec)}</span>
            </li>
          ))}
        </ol>
      </Modal>
      {startGame.dialog}
    </>
  );
}
