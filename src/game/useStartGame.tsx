import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { navigate } from '../lib/router';
import { discardGame, startNewGame, useGameStore } from './gameStore';

type StartInput = Parameters<typeof startNewGame>[0];

/**
 * 게임을 만들고 진행 화면으로 간다(카운트다운은 진행 화면의 ‘시작’으로 시작한다).
 * 이미 진행 중인 게임이 있으면 확인한 뒤 바꾼다.
 * replace: 지금 화면을 기록에서 바꿀지(결과 화면) 쌓을지(목록: 뒤로 가면 목록으로 돌아온다).
 */
export function useStartGame({ replace = true }: { replace?: boolean } = {}) {
  const { game } = useGameStore();
  const [pending, setPending] = useState<StartInput | null>(null);

  const start = (input: StartInput) => {
    startNewGame(input);
    navigate({ name: 'play' }, { replace });
  };

  const request = (input: StartInput) => {
    if (game) setPending(input);
    else start(input);
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null && game !== null}
      title="진행 중인 게임이 있어요"
      confirmLabel="새 게임 시작"
      tone="danger"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (!pending) return;
        discardGame();
        setPending(null);
        start(pending);
      }}
    >
      {game && (
        <p>
          ‘{game.scenarioName}’ 게임이 {game.current + 1} / {game.stages.length} 단계에서 진행 중이에요. 새 게임을
          시작하면 그 진행 기록은 사라져요.
        </p>
      )}
    </ConfirmDialog>
  );

  return { request, dialog };
}
