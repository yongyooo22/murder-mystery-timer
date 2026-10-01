import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { useScenarioList } from '../data/scenarioStore';
import { useGameStore } from '../game/gameStore';
import { useStartGame } from '../game/useStartGame';
import { goBack } from '../lib/router';
import { clockText, diffSentence, durationText, signedClockText, timeOfDayText } from '../lib/time';
import './ResultScreen.css';

export function ResultScreen() {
  const { result } = useGameStore();
  const list = useScenarioList();
  const startGame = useStartGame();
  // 결과 화면은 진행 화면을 대신한 기록이므로 한 칸 되돌리면 목록이다.
  const toList = () => goBack({ name: 'list' });

  if (!result) {
    return (
      <div className="screen">
        <main className="screen__body">
          <EmptyState
            icon="flag"
            title="표시할 진행 결과가 없어요"
            actions={
              <Button variant="primary" size="lg" onClick={toList}>
                시나리오 목록으로
              </Button>
            }
          >
            게임을 마치면 이곳에서 계획 시간과 실제 진행 시간을 비교할 수 있어요.
          </EmptyState>
        </main>
      </div>
    );
  }

  const diff = result.actualTotalSec - result.plannedTotalSec;
  const unplayed = result.stages.filter((s) => !s.visited).length;

  // 다시 시작할 때는 지금 목록에 있는 최신 구성을 쓰고, 목록에 없으면 이번 게임의 구성을 그대로 쓴다.
  const restart = () => {
    const latest = result.scenarioId ? list.items.find((it) => it.id === result.scenarioId) : undefined;
    startGame.request(
      latest
        ? { id: latest.id, name: latest.name, stages: latest.stages }
        : {
            id: result.scenarioId,
            name: result.scenarioName,
            stages: result.stages.map((s) => ({ id: s.id, name: s.name, durationSec: s.plannedSec })),
          },
    );
  };

  return (
    <div className="screen result-screen">
      <main className="screen__body result-layout">
        <header className="result-head">
          <p className="result-head__eyebrow">게임 종료</p>
          <h1 className="result-head__title">{result.scenarioName}</h1>
          <p className="result-head__meta num">
            {timeOfDayText(result.startedAt)} 시작 · {timeOfDayText(result.endedAt)} 종료
          </p>
        </header>

        <dl className="result-summary">
          <div className="result-summary__item">
            <dt>전체 계획 시간</dt>
            <dd>{durationText(result.plannedTotalSec)}</dd>
          </div>
          <div className="result-summary__item">
            <dt>실제 진행 시간</dt>
            <dd>{durationText(result.actualTotalSec)}</dd>
          </div>
          <div className="result-summary__item">
            <dt>차이</dt>
            <dd>
              <span className="num">{signedClockText(diff)}</span>
              <span className="result-summary__sentence">{diffSentence(diff)}</span>
            </dd>
          </div>
        </dl>
        <p className="result-note">실제 진행 시간은 일시정지한 시간을 빼고, 초과한 시간을 포함해요.</p>

        <section className="result-stages" aria-labelledby="result-stages-title">
          <div className="section__head">
            <h2 id="result-stages-title" className="section__title">
              단계별 시간
            </h2>
            {unplayed > 0 && <span className="result-stages__unplayed">미진행 {unplayed}단계</span>}
          </div>
          <div className="result-table" role="table" aria-label="단계별 계획 시간과 실제 진행 시간">
            <div className="result-table__head" role="row">
              <span role="columnheader">단계</span>
              <span role="columnheader">계획</span>
              <span role="columnheader">실제</span>
              <span role="columnheader">차이</span>
            </div>
            {result.stages.map((s, i) => (
              <div
                key={s.id}
                className={['result-row', !s.visited && 'result-row--unplayed'].filter(Boolean).join(' ')}
                role="row"
              >
                <span className="result-row__name" role="cell">
                  <span className="result-row__index num">{i + 1}</span>
                  {s.name}
                </span>
                <span className="result-row__cell" role="cell">
                  <span className="result-row__label">계획</span>
                  <span className="num">{clockText(s.plannedSec)}</span>
                </span>
                <span className="result-row__cell" role="cell">
                  <span className="result-row__label">실제</span>
                  {s.visited ? <span className="num">{clockText(s.actualSec)}</span> : <span>미진행</span>}
                </span>
                <span className="result-row__cell result-row__diff" role="cell">
                  <span className="result-row__label">차이</span>
                  {s.visited ? (
                    <span className="num">{signedClockText(s.actualSec - s.plannedSec)}</span>
                  ) : (
                    <>
                      <span aria-hidden="true">–</span>
                      <span className="visually-hidden">없음</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="result-actions">
          <Button size="lg" icon="restore" onClick={restart}>
            같은 시나리오 다시 시작
          </Button>
          <Button variant="primary" size="lg" icon="list" onClick={toList}>
            시나리오 목록으로
          </Button>
        </div>
      </main>
      {startGame.dialog}
    </div>
  );
}
