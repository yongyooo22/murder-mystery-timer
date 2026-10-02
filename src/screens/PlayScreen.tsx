import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, IconButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Icon, type IconName } from '../components/Icon';
import { APP_CONFIG } from '../config';
import { settingsStore, updateSettings, useSettings, type Settings } from '../data/settingsStore';
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
  stageProgress,
  totalRemainingMs,
  type AlertKind,
  type GameState,
} from '../game/engine';
import { endGame, gameStore, updateGame, useGameStore } from '../game/gameStore';
import { useFullscreen, useWakeLock, vibrate } from '../lib/device';
import { navigate } from '../lib/router';
import { playAlert, soundSupported } from '../lib/sound';
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
        <main className="screen__body">
          <EmptyState
            icon="clock"
            title="진행 중인 게임이 없어요"
            actions={
              <Button variant="primary" size="lg" onClick={() => navigate({ name: 'list' }, { replace: true })}>
                시나리오 목록으로
              </Button>
            }
          />
        </main>
      </div>
    );
  }
  return <PlayView game={game} persistFailed={persistFailed} />;
}

type ConfirmKind = 'prev' | 'next' | 'finishEarly' | 'end';
type PrimaryRole = 'pause' | 'resume' | 'next' | 'finish';
type Tone = 'normal' | 'warn' | 'over';

const TICK_MS = 250;
const PRIMARY_LOCK_MS = 800;

// 큰 숫자의 글자 칸 너비(em). 칸 너비를 고정해 숫자가 바뀌어도 흔들리지 않게 한다.
const DIGIT_EM = 0.6;
const COLON_EM = 0.32;

/** 현재 단계 이름이 이보다 길면 글자를 조금 줄여 두 줄 안에 들어가게 한다. */
const LONG_STAGE_NAME = 16;

const PRIMARY: Record<PrimaryRole, { label: string; icon: IconName }> = {
  pause: { label: '일시정지', icon: 'pause' },
  resume: { label: '계속하기', icon: 'play' },
  next: { label: '다음 단계 시작', icon: 'skip-forward' },
  finish: { label: '게임 마치기', icon: 'flag' },
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 진행 화면의 알림음 버튼으로 끄기 전의 설정. 다시 켤 때 그대로 되돌린다(새로고침하면 둘 다 켠다).
 * 저장 형식(설정 항목)은 그대로 두기 위해 기기에 따로 저장하지 않는다.
 */
let soundBeforeMute: Pick<Settings, 'timeUpSound' | 'warningSound'> | null = null;

function PlayView({ game, persistFailed }: { game: GameState; persistFailed: boolean }) {
  const settings = useSettings();
  const fullscreen = useFullscreen();
  const canPlaySound = soundSupported();
  const routeId = useId();
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const routeListRef = useRef<HTMLOListElement>(null);
  const routePanelRef = useRef<HTMLDivElement>(null);

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

  // 브라우저 탭·최근 앱 목록에서도 어떤 시나리오를 진행 중인지 보이게 한다.
  useEffect(() => {
    document.title = `${game.scenarioName} · ${APP_CONFIG.name}`;
  }, [game.scenarioName]);

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

  /*
   * 주요 버튼의 역할이 ‘다음 단계 시작/게임 마치기’로 바뀌거나 거기서 다른 역할로 바뀐 직후에는
   * 잠깐 누름을 무시한다. 시간이 끝나는 순간 일시정지를 누르려던 터치나 두 번 누름으로
   * 의도하지 않은 단계 이동·일시정지가 일어나지 않게 하기 위해서다.
   */
  const [primaryLocked, setPrimaryLocked] = useState(false);
  const prevRole = useRef(role);
  const lockedUntil = useRef(0);
  const unlockTimer = useRef<number | undefined>(undefined);
  // 화면에 새 역할이 그려지기 전에(useLayoutEffect) 잠가야 그 사이의 터치도 막을 수 있다.
  useLayoutEffect(() => {
    const before = prevRole.current;
    prevRole.current = role;
    const advancing = (r: PrimaryRole) => r === 'next' || r === 'finish';
    if (before === role || !(advancing(role) || advancing(before))) return;
    lockedUntil.current = Date.now() + PRIMARY_LOCK_MS;
    setPrimaryLocked(true);
    // 잠금 해제 타이머는 역할이 다시 바뀌어도 취소하지 않는다(새 잠금이면 새로 건다).
    window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => setPrimaryLocked(false), PRIMARY_LOCK_MS);
  }, [role]);
  useEffect(() => () => window.clearTimeout(unlockTimer.current), []);

  /*
   * 진행 순서 목록은 단계가 많으면 목록 영역만 스크롤된다. 단계가 바뀌거나, (세로 화면에서) 목록을 펼치거나,
   * 화면을 돌려 목록 높이가 바뀌면 현재 단계가 목록 가운데에 오도록 목록만 스크롤한다(페이지는 움직이지 않는다).
   */
  useEffect(() => {
    const list = routeListRef.current;
    if (!list) return;
    const centerCurrent = () => {
      const row = list.querySelector<HTMLElement>('[aria-current="step"]');
      if (!row || list.scrollHeight <= list.clientHeight + 1) return;
      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const top = rowRect.top - listRect.top + list.scrollTop - (list.clientHeight - rowRect.height) / 2;
      list.scrollTo({ top: Math.max(0, top) });
    };
    centerCurrent();
    if (typeof ResizeObserver === 'undefined') return;
    // 사용자가 목록을 직접 스크롤한 것은 그대로 두고, 목록 높이가 바뀔 때만 다시 맞춘다.
    let height = list.clientHeight;
    const observer = new ResizeObserver(() => {
      if (list.clientHeight === height) return;
      height = list.clientHeight;
      centerCurrent();
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [game.current, routeOpen]);

  const toggleRoute = () => {
    const opening = !routeOpen;
    setRouteOpen(opening);
    // 세로 화면에서는 펼친 목록이 화면 아래에 생기므로 보이는 곳까지 내려 준다.
    if (opening) {
      window.requestAnimationFrame(() => routePanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  };

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
    if (Date.now() < lockedUntil.current) return;
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

  // 알림음 켜기·끄기: 설정의 ‘시간 종료 알림음’, ‘1분 전 알림음’을 함께 바꾼다.
  const soundOn = settings.timeUpSound || settings.warningSound;
  const toggleSound = () => {
    if (soundOn) {
      soundBeforeMute = { timeUpSound: settings.timeUpSound, warningSound: settings.warningSound };
      updateSettings({ timeUpSound: false, warningSound: false });
      setAnnouncement('알림음을 껐어요.');
    } else {
      updateSettings(soundBeforeMute ?? { timeUpSound: true, warningSound: true });
      soundBeforeMute = null;
      setAnnouncement('알림음을 켰어요.');
    }
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
  const plannedTotal = game.stages.reduce((sum, s) => sum + s.plannedSec, 0);

  return (
    <main className="play" data-tone={tone} data-paused={!running}>
      {/* 왼쪽 위(가로) · 맨 위(세로): 앱 이름과 시나리오 */}
      <header className="play-brand">
        <p className="play-brand__app" lang="en">
          {APP_CONFIG.name}
        </p>
        <div className="play-brand__scenario">
          <p className="play-brand__label">시나리오</p>
          {/* 시나리오(머더미스터리) 이름은 진행 중 항상 보인다. 길면 줄을 바꿔 모두 보여 준다. */}
          <p className="play-brand__name serif" title={game.scenarioName}>
            {game.scenarioName}
          </p>
        </div>
      </header>

      {/* 소리·전체화면: 오른쪽 위에 작게(터치 영역은 44×44) */}
      <div className="play-tools">
        {canPlaySound && (
          <IconButton
            icon={soundOn ? 'volume' : 'volume-off'}
            label={soundOn ? '알림음 끄기' : '알림음 켜기'}
            size={20}
            onClick={toggleSound}
          />
        )}
        {fullscreen.supported && (
          <IconButton
            icon={fullscreen.active ? 'minimize' : 'maximize'}
            label={fullscreen.active ? '전체화면 끝내기' : '전체화면'}
            size={20}
            onClick={() => void fullscreen.toggle()}
          />
        )}
      </div>

      {/* 오른쪽(가로) · 가운데(세로): 현재 단계, 남은 시간, 조작 */}
      <section className="play-main" aria-label="현재 단계와 조작">
        {persistFailed && (
          <p className="play-notice" role="status">
            <Icon name="alert" size={16} />
            이 기기에 진행 상황을 저장하지 못하고 있어요. 새로고침하면 진행 기록이 사라질 수 있어요.
          </p>
        )}

        <div className="play-head">
          <p className="play-meta">
            <span className="play-step num" aria-label={`전체 ${game.stages.length}단계 중 ${game.current + 1}단계`}>
              {pad2(game.current + 1)} / {pad2(game.stages.length)}
            </span>
            <span className="play-status">
              <Icon name={statusIcon} size={16} />
              <span className="play-status__label">{statusText}</span>
            </span>
          </p>
          {/* 가로 화면에서 단계 이름 위에 시나리오 이름을 한 번 더 보여 준다(세로는 바로 위 머리글에 있어 숨김). */}
          <p className="play-head__scenario serif" aria-hidden="true" title={game.scenarioName}>
            {game.scenarioName}
          </p>
          {/* 이름이 한 줄이든 두 줄이든 높이를 같게 잡아 숫자 위치가 흔들리지 않게 한다. */}
          <div className="play-stage" data-long={[...stage.name].length > LONG_STAGE_NAME || undefined}>
            <h1 className="play-stage__name serif">{stage.name}</h1>
          </div>
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

        {/* 다음 단계 | 전체 남은 시간: 한 줄에 나란히, 가운데 얇은 세로선 */}
        <dl className="play-info">
          <div className="play-info__item">
            <dt className="play-info__label">다음 단계</dt>
            <dd className="play-info__value" title={next?.name}>
              {next ? next.name : '마지막 단계예요'}
            </dd>
          </div>
          <div className="play-info__item">
            <dt className="play-info__label">전체 남은 시간</dt>
            <dd className="play-info__value">
              <span className="num">{remainingSummaryText(total)}</span>
              {overtime && <span className="play-info__note">초과 시간 제외</span>}
            </dd>
          </div>
        </dl>

        <div className="play-controls">
          {/* −1분 / 일시정지 / +1분 */}
          <div className="play-controls__main">
            <Button
              size="lg"
              className="play-adjust"
              aria-label="1분 줄이기"
              disabled={!canDecrease(game, now)}
              onClick={() => act((g, t) => adjustTime(g, -ADJUST_STEP_MS, t), '1분 줄였어요.')}
            >
              <span aria-hidden="true">−</span>1분
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={primary.icon}
              className="play-primary"
              aria-disabled={primaryLocked || undefined}
              data-locked={primaryLocked || undefined}
              onClick={onPrimary}
            >
              {primary.label}
            </Button>
            <Button
              size="lg"
              className="play-adjust"
              aria-label="1분 늘리기"
              onClick={() => act((g, t) => adjustTime(g, ADJUST_STEP_MS, t), '1분 늘렸어요.')}
            >
              <span aria-hidden="true">+</span>1분
            </Button>
          </div>

          {/* 이전 단계 / 다음 단계(시간 초과 중에는 일시정지·계속하기) */}
          <div className="play-controls__nav">
            <Button size="lg" icon="skip-back" className="play-nav" disabled={!prev} onClick={() => setConfirm('prev')}>
              이전 단계
            </Button>
            {overtime ? (
              <Button size="lg" icon={running ? 'pause' : 'play'} className="play-nav" onClick={togglePause}>
                {running ? '일시정지' : '계속하기'}
              </Button>
            ) : (
              <Button
                size="lg"
                iconEnd={last ? 'flag' : 'skip-forward'}
                className="play-nav"
                onClick={() => setConfirm(last ? 'finishEarly' : 'next')}
              >
                {last ? '게임 마치기' : '다음 단계'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 왼쪽 아래(가로) · 맨 아래(세로, 접어 둠): 진행 순서, 전체 계획 시간, 게임 종료 */}
      <section className="play-route" aria-label="진행 순서" data-open={routeOpen}>
        <div className="play-route__bar">
          <button
            type="button"
            className="play-route__toggle"
            aria-expanded={routeOpen}
            aria-controls={`${routeId}-panel`}
            onClick={toggleRoute}
          >
            <span>진행 순서 보기</span>
            <span className="play-route__count num" aria-hidden="true">
              {pad2(game.current + 1)} / {pad2(game.stages.length)}
            </span>
            <Icon name="chevron-down" size={18} className="play-route__chevron" />
          </button>
          <Button variant="secondary" size="sm" icon="exit" className="play-end" onClick={() => setConfirm('end')}>
            게임 종료
          </Button>
        </div>

        <div id={`${routeId}-panel`} ref={routePanelRef} className="play-route__panel">
          <ol ref={routeListRef} className="route-list">
            {game.stages.map((s, i) => {
              const state = i === game.current ? 'current' : game.visited[i] ? 'done' : 'todo';
              return (
                <li
                  key={s.id}
                  className={`route-row route-row--${state}`}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <span className="route-row__mark" aria-hidden="true" />
                  <span className="route-row__index num" aria-hidden="true">
                    {pad2(i + 1)}
                  </span>
                  <span className="route-row__name">
                    {s.name}
                    {state !== 'todo' && (
                      <span className="visually-hidden">{state === 'current' ? ' (현재 단계)' : ' (진행함)'}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="play-route__total">
            <span className="play-route__total-label">전체 계획</span>
            <span className="play-route__total-value num">{durationText(plannedTotal)}</span>
          </p>
        </div>
      </section>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

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
    </main>
  );
}
