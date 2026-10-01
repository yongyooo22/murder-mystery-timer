import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { navigate } from '../lib/router';
import { discardGame, startNewGame, useGameStore } from './gameStore';

type StartInput = Parameters<typeof startNewGame>[0];

/** 게임 시작. 이미 진행 중인 게임이 있으면 확인한 뒤 시작한다. */
export function useStartGame() {
  const { game } = useGameStore();
  const [pending, setPending] = useState<StartInput | null>(null);

  const start = (input: StartInput) => {
    startNewGame(input);
    navigate({ name: 'play' }, { replace: true });
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
