import { beforeEach, describe, expect, test } from 'bun:test';
import {
  createPuzzleGame,
  expirePuzzleGames,
  getActivePuzzleGames,
  getPuzzleGameById,
} from '../../engine-memory/queries/puzzles';
import { resetStore } from '../../engine-memory/store';

describe('puzzle queries', () => {
  beforeEach(() => {
    resetStore();
  });

  test('treats open and active games as active puzzle work', async () => {
    await createPuzzleGame({
      id: 'open-game',
      gameType: 'fragment-chase',
      status: 'open',
      solution: 'alpha',
      createdAtTick: 1,
    });
    await createPuzzleGame({
      id: 'active-game',
      gameType: 'fragment-chase',
      status: 'active',
      solution: 'beta',
      createdAtTick: 2,
    });
    await createPuzzleGame({
      id: 'completed-game',
      gameType: 'fragment-chase',
      status: 'completed',
      solution: 'gamma',
      createdAtTick: 3,
    });
    await createPuzzleGame({
      id: 'expired-game',
      gameType: 'fragment-chase',
      status: 'expired',
      solution: 'delta',
      createdAtTick: 4,
    });

    const activeIds = (await getActivePuzzleGames()).map((game) => game.id).sort();

    expect(activeIds).toEqual(['active-game', 'open-game']);
  });

  test('expires open and active games at their end tick only', async () => {
    await createPuzzleGame({
      id: 'open-expired',
      gameType: 'fragment-chase',
      status: 'open',
      solution: 'alpha',
      createdAtTick: 1,
      endsAtTick: 4,
    });
    await createPuzzleGame({
      id: 'active-expired',
      gameType: 'fragment-chase',
      status: 'active',
      solution: 'beta',
      createdAtTick: 2,
      endsAtTick: 5,
    });
    await createPuzzleGame({
      id: 'open-future',
      gameType: 'fragment-chase',
      status: 'open',
      solution: 'gamma',
      createdAtTick: 3,
      endsAtTick: 6,
    });
    await createPuzzleGame({
      id: 'completed-past',
      gameType: 'fragment-chase',
      status: 'completed',
      solution: 'delta',
      createdAtTick: 4,
      endsAtTick: 1,
    });

    expect(await expirePuzzleGames(5)).toBe(2);

    expect((await getPuzzleGameById('open-expired'))?.status).toBe('expired');
    expect((await getPuzzleGameById('active-expired'))?.status).toBe('expired');
    expect((await getPuzzleGameById('open-future'))?.status).toBe('open');
    expect((await getPuzzleGameById('completed-past'))?.status).toBe('completed');
  });
});
