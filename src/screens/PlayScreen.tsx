import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Icon, type IconName } from '../components/Icon';
import { InlineAlert } from '../components/InlineAlert';
import { Modal } from '../components/Modal';
import { settingsStore, useSettings } from '../data/settingsStore';
import {
  ADJUST_STEP_MS,
  WARNING_MS,
  adjustTime,
  canDecrease,
  checkAlerts,
  currentStage,
  goToStage,
  isLastStage,
  isRunning,
  nextStage,
  pause,
  previousStage,
  remainingMs,
  resume,
  segmentElapsedMs,
  stageProgress,
  totalRemainingMs,
  type AlertKind,
  type GameState,
} from '../game/engine';
import { endGame, gameStore, updateGame, useGameStore } from '../game/gameStore';
import { useFullscreen, useWakeLock, vibrate } from '../lib/device';
import { navigate } from '../lib/router';
import { playAlert } from '../lib/sound';
import { clockText, durationText, remainingSummaryText, timerText } from '../lib/time';
import './PlayScreen.css';

export function PlayScreen() {
  const { game, persistFailed } = useGameStore();

  useEffect(() => {
    if (!game) navigate({ name: 'list' }, { replace: true });
  }, [game]);

  if (!game) {
    return (
      <div className="screen">
        <EmptyState
          icon="clock"
          title="진행 중인 게임이 없어요"
          actions={
            <Button variant="primary" onClick={() => navigate({ name: 'list' }, { replace: true })}>
              시나리오 목록으로
            </Button>
          }
        />
      </div>
    );
  }
  return <PlayView game={game} persistFailed={persistFailed} />;
}

type ConfirmKind = 'prev' | 'next' | 'finishEarly' | 'end';
type PrimaryRole = 'pause' | 'resume' | 'next' | 'finish';
type Tone = 'normal' | 'warn' | 'over';

const TICK_MS = 250;

// 큰 숫자의 글자 칸 너비(em). 칸 너비를 고정해 숫자가 바뀌어도 흔들리지 않게 한다.
const DIGIT_EM = 0.6;
const COLON_EM = 0.32;

const PRIMARY: Record<PrimaryRole, { label: string; icon: IconName }> = {
  pause: { label: '일시정지', icon: 'pause' },
  resume: { label: '계속하기', icon: 'play' },
  next: { label: '다음 단계 시작', icon: 'skip-forward' },
  finish: { label: '게임 마치기', icon: 'flag' },
};

function PlayView({ game, persistFailed }: { game: GameState; persistFailed: boolean }) {
  const settings = useSettings();
  const fullscreen = useFullscreen();
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useWakeLock(settings.keepAwake);

  const running = isRunning(game);
  const remaining = remainingMs(game, now);
  const overtime = remaining <= 0;
  const warning = !overtime && remaining <= WARNING_MS;
  const tone: Tone = overtime ? 'over' : warning ? 'warn' : 'normal';
  const stage = currentStage(game);
  const next = nextStage(game);
  const prev = previousStage(game);
  const last = isLastStage(game);
  const role: PrimaryRole = overtime ? (last ? 'finish' : 'next') : running ? 'pause' : 'resume';

  /* 실행 중에는 0.25초마다 다시 그린다. 남은 시간은 항상 시각 차이로 계산하므로 지연돼도 어긋나지 않는다. */
  useEffect(() => {
    if (game.runningSince === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [game.runningSince]);

  useEffect(() => {
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    document.body.classList.add('is-playing');
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.body.classList.remove('is-playing');
    };
  }, []);

  /* 1분 전·시간 종료 알림 */
  useEffect(() => {
    const latest = gameStore.get().game;
    if (!latest) return;
    const { state, alerts } = checkAlerts(latest, Date.now());
    if (state === latest) return;
    updateGame(() => state);
    const s = settingsStore.get();
    alerts.forEach((kind: AlertKind) => {
      if (kind === 'timeUp') {
        if (s.timeUpSound) playAlert('timeUp');
        if (s.vibration) vibrate([220, 120, 220, 120, 320]);
        setPulse((p) => p + 1);
        setAnnouncement(isLastStage(state) ? '마지막 단계 시간이 끝났어요. 초과 시간을 세고 있어요.' : '단계 시간이 끝났어요. 초과 시간을 세고 있어요.');
      } else {
        if (s.warningSound) playAlert('warning');
        if (s.vibration) vibrate(160);
        setAnnouncement('1분 남았어요.');
      }
    });
  }, [game, now]);

  /* 주요 버튼 역할이 ‘다음 단계 시작’으로 바뀐 직후의 잘못된 터치를 막는다. */
  const [primaryLocked, setPrimaryLocked] = useState(false);
  const prevRole = useRef(role);
  useEffect(() => {
    const changedToAdvance = prevRole.current !== role && (role === 'next' || role === 'finish');
    prevRole.current = role;
    if (!changedToAdvance) return;
    setPrimaryLocked(true);
    const timer = window.setTimeout(() => setPrimaryLocked(false), 900);
    return () => window.clearTimeout(timer);
  }, [role]);

  const act = (change: (g: GameState, t: number) => GameState, message?: string) => {
    updateGame(change);
    setNow(Date.now());
    if (message) setAnnouncement(message);
  };

  const goNext = () => act((g, t) => goToStage(g, g.current + 1, t), '다음 단계를 시작했어요.');
  const goPrev = () => act((g, t) => goToStage(g, g.current - 1, t), '이전 단계를 다시 시작했어요.');
  const finish = () => {
    endGame();
    navigate({ name: 'result' }, { replace: true });
  };
  const togglePause = () =>
    running ? act((g, t) => pause(g, t), '일시정지했어요.') : act((g, t) => resume(g, t), '다시 진행해요.');

  const onPrimary = () => {
    if (primaryLocked) return;
    if (role === 'pause' || role === 'resume') togglePause();
    else if (role === 'next') goNext();
    else finish();
  };

  const onConfirm = () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === 'prev') goPrev();
    else if (kind === 'next') goNext();
    else if (kind === 'finishEarly' || kind === 'end') finish();
  };

  const { text } = timerText(remaining);
  const chars = Array.from(text);
  const timerEm = chars.reduce((sum, c) => sum + (c === ':' ? COLON_EM : DIGIT_EM), 0);
  const statusText = overtime
    ? running
      ? '시간 초과'
      : '일시정지 · 시간 초과'
    : !running
      ? '일시정지'
      : warning
        ? '진행 중 · 1분 이하'
        : '진행 중';
  const statusIcon: IconName = overtime ? 'alert' : !running ? 'pause' : warning ? 'clock' : 'play';
  const remainingWords = overtime ? `초과 ${durationText(Math.floor(-remaining / 1000))}` : `남은 시간 ${durationText(Math.ceil(remaining / 1000))}`;
  const total = totalRemainingMs(game, now);
  const progress = stageProgress(game, now);
  const primary = PRIMARY[role];

  return (
    <div className="screen play" data-tone={tone} data-paused={!running}>
      <header className="play-top">
        <div className="play-top__info">
          <p className="play-top__scenario">{game.scenarioName}</p>
          <p className="play-top__step">
            <span className="num">
              {game.current + 1} / {game.stages.length}
            </span>
            <span className="visually-hidden">단계</span>
          </p>
        </div>
        <div className="play-top__actions">
          {fullscreen.supported && (
            <Button
              variant="ghost"
              size="sm"
              icon={fullscreen.active ? 'minimize' : 'maximize'}
              className="play-top__fullscreen"
              aria-label={fullscreen.active ? '전체화면 끝내기' : '전체화면'}
              onClick={() => void fullscreen.toggle()}
            >
              <span className="play-top__fullscreen-label">{fullscreen.active ? '전체화면 끝내기' : '전체화면'}</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" icon="exit" className="play-top__end" onClick={() => setConfirm('end')}>
            게임 종료
          </Button>
        </div>
      </header>

      {persistFailed && (
        <p className="play-notice" role="status">
          <Icon name="alert" size={16} />
          이 기기에 진행 상황을 저장하지 못하고 있어요. 새로고침하면 진행 기록이 사라질 수 있어요.
        </p>
      )}

      <section className="play-center" aria-label="현재 단계">
        <div className="play-stage">
          <h1 className="play-stage__name">{stage.name}</h1>
        </div>

        <div className="play-timer">
          {pulse > 0 && <span key={pulse} className="play-timer__pulse" aria-hidden="true" />}
          <div
            key={`digits-${pulse}`}
            className={['play-timer__digits', 'num', pulse > 0 && 'play-timer__digits--pulse'].filter(Boolean).join(' ')}
            style={{ '--timer-em': timerEm } as CSSProperties}
            role="timer"
            aria-label={remainingWords}
          >
            {chars.map((c, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={c === ':' ? 'play-timer__colon' : c === '+' ? 'play-timer__sign' : 'play-timer__digit'}
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="play-status">
          <p className="play-status__label">
            <Icon name={statusIcon} size={18} />
            <span>{statusText}</span>
          </p>
          <div
            className="play-progress"
            role="progressbar"
            aria-label="현재 단계 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className="play-progress__fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
        </div>
      </section>

      <section className="play-side" aria-label="진행 정보와 조작">
        <div className="play-info">
          <div className="play-info__item">
            <span className="play-info__label">다음</span>
            <span className="play-info__value">{next ? next.name : '마지막 단계예요'}</span>
          </div>
          <div className="play-info__item play-info__item--end">
            <span className="play-info__label">전체 남은 시간</span>
            <span className="play-info__value num">{remainingSummaryText(total)}</span>
            {overtime && <span className="play-info__note">초과 시간 제외</span>}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon="list" className="play-list-button" onClick={() => setListOpen(true)}>
          단계 목록 보기
        </Button>

        <div className="play-controls">
          <div className="play-controls__row">
            <Button
              size="lg"
              icon="minus"
              aria-label="1분 줄이기"
              disabled={!canDecrease(game, now)}
              onClick={() => act((g, t) => adjustTime(g, -ADJUST_STEP_MS, t), '1분 줄였어요.')}
            >
              1분
            </Button>
            <Button
              size="lg"
              icon="plus"
              aria-label="1분 늘리기"
              onClick={() => act((g, t) => adjustTime(g, ADJUST_STEP_MS, t), '1분 늘렸어요.')}
            >
              1분
            </Button>
          </div>

          <Button
            variant="primary"
            size="xl"
            block
            icon={primary.icon}
            className="play-primary"
            aria-disabled={primaryLocked || undefined}
            data-locked={primaryLocked || undefined}
            onClick={onPrimary}
          >
            {primary.label}
          </Button>

          <div className="play-controls__row">
            <Button
              size="lg"
              icon="skip-back"
              className="play-weak"
              disabled={!prev}
              onClick={() => setConfirm('prev')}
            >
              이전 단계
            </Button>
            {overtime ? (
              <Button size="lg" icon={running ? 'pause' : 'play'} className="play-weak" onClick={togglePause}>
                {running ? '일시정지' : '계속하기'}
              </Button>
            ) : (
              <Button
                size="lg"
                iconEnd={last ? 'flag' : 'skip-forward'}
                className="play-weak"
                onClick={() => setConfirm(last ? 'finishEarly' : 'next')}
              >
                {last ? '게임 마치기' : '다음 단계'}
              </Button>
            )}
          </div>
        </div>
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <StageListSheet game={game} now={now} open={listOpen} onClose={() => setListOpen(false)} />

      <ConfirmDialog
        open={confirm === 'next'}
        title="다음 단계로 넘어갈까요?"
        confirmLabel="다음 단계로"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        <p>
          ‘{stage.name}’ 단계가 {overtime ? '이미 끝났어요' : `${durationText(Math.ceil(remaining / 1000))} 남아 있어요`}.{' '}
          {next && `‘${next.name}’ 단계가 바로 시작돼요.`}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'prev'}
        title="이전 단계로 돌아갈까요?"
        confirmLabel="이전 단계로"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        {prev && (
          <p>
            ‘{prev.name}’ 단계를 원래 계획 시간 <span className="num">{clockText(prev.plannedSec)}</span>부터 새로
            시작해요. 지금까지 진행한 시간은 결과의 실제 진행 시간에 그대로 쌓여요.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'finishEarly'}
        title="게임을 마칠까요?"
        confirmLabel="게임 마치기"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        <p>
          마지막 단계에 {durationText(Math.ceil(Math.max(0, remaining) / 1000))} 남아 있어요. 게임을 마치고 진행 결과
          화면으로 이동해요.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'end'}
        title="게임을 종료할까요?"
        confirmLabel="게임 종료"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={onConfirm}
      >
        <p>
          진행 결과 화면으로 이동해요. 아직 진행하지 않은 단계는 ‘미진행’으로 기록되고, 종료한 게임은 이어서 진행할
          수 없어요.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function StageListSheet({ game, now, open, onClose }: { game: GameState; now: number; open: boolean; onClose: () => void }) {
  const plannedTotal = game.stages.reduce((sum, s) => sum + s.plannedSec, 0);

  // 단계가 많아도 현재 단계가 바로 보이도록 스크롤한다.
  useEffect(() => {
    if (open) document.querySelector('.play-list__row--current')?.scrollIntoView({ block: 'center' });
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      title="단계 목록"
      subtitle={`${game.stages.length}단계 · 계획 ${durationText(plannedTotal)}`}
    >
      <ol className="play-list">
        {game.stages.map((s, i) => {
          const isCurrent = i === game.current;
          const actualMs = game.actualMs[i] + (isCurrent ? segmentElapsedMs(game, now) : 0);
          const state = isCurrent ? '진행 중' : game.visited[i] ? `진행함 · 실제 ${clockText(Math.round(actualMs / 1000))}` : '예정';
          return (
            <li key={s.id} className={['play-list__row', isCurrent && 'play-list__row--current'].filter(Boolean).join(' ')} aria-current={isCurrent ? 'step' : undefined}>
              <span className="play-list__index num">{i + 1}</span>
              <span className="play-list__text">
                <span className="play-list__name">{s.name}</span>
                <span className="play-list__state">{state}</span>
              </span>
              <span className="play-list__time num">{clockText(s.plannedSec)}</span>
            </li>
          );
        })}
      </ol>
      {game.stages.length > 0 && (
        <InlineAlert tone="info" className="play-list__note">
          단계를 바꾸려면 진행 화면의 ‘이전 단계’, ‘다음 단계’를 눌러 주세요.
        </InlineAlert>
      )}
    </Modal>
  );
}
