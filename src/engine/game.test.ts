import { describe, expect, it } from 'vitest';
import {
  type GameState,
  HAND_SIZE,
  bestPile,
  canEndTurn,
  canPlay,
  cardsLeft,
  endTurn,
  isTrick,
  newGame,
  play,
  required,
  undo,
} from './game';

const fresh = (difficulty: GameState['difficulty'] = 'hard') =>
  newGame({ seed: 'TEST-SEED', difficulty, now: 0 });

/** Build a hand-crafted state for edge cases. */
function state(partial: Partial<GameState>): GameState {
  return { ...fresh(), turnMoves: [], ...partial };
}

describe('setup', () => {
  it.each(['easy', 'medium', 'hard'] as const)('%s deals 8 cards and keeps all 98', (d) => {
    const g = fresh(d);
    expect(g.hand).toHaveLength(HAND_SIZE);
    expect(g.deck).toHaveLength(90);
    const all = [...g.hand, ...g.deck].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 98 }, (_, i) => i + 2));
    expect(g.piles).toEqual([1, 1, 100, 100]);
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(fresh().hand).toEqual(fresh().hand);
    expect(newGame({ seed: 'OTHER', now: 0 }).deck).not.toEqual(fresh().deck);
  });

  it('easy mode deals from the low band first', () => {
    expect(fresh('easy').hand.every((c) => c <= 12)).toBe(true);
  });

  it('hand is sorted', () => {
    const h = fresh().hand;
    expect(h).toEqual([...h].sort((a, b) => a - b));
  });
});

describe('rules', () => {
  const piles = [30, 30, 70, 70];

  it('climbing piles take higher cards or exactly ten lower', () => {
    expect(canPlay(31, 0, piles)).toBe(true);
    expect(canPlay(29, 0, piles)).toBe(false);
    expect(canPlay(20, 0, piles)).toBe(true);
    expect(isTrick(20, 0, piles)).toBe(true);
  });

  it('falling piles take lower cards or exactly ten higher', () => {
    expect(canPlay(69, 2, piles)).toBe(true);
    expect(canPlay(71, 2, piles)).toBe(false);
    expect(canPlay(80, 2, piles)).toBe(true);
  });

  it('bestPile prefers a backwards trick, then the tightest gap', () => {
    const piles = [30, 40, 70, 60];
    expect(bestPile(state({ piles, hand: [20] }), 20)).toBe(0); // trick on 30
    expect(bestPile(state({ piles, hand: [50] }), 50)).toBe(1); // 40 -> 50 ties 60 -> 50, first wins
    expect(bestPile(state({ piles, hand: [25] }), 25)).toBe(3); // 60 -> 25 beats 70 -> 25
  });
});

describe('turns', () => {
  it('requires two plays before ending a turn, then refills to 8', () => {
    let g = fresh();
    expect(canEndTurn(g)).toBe(false);
    g = play(g, g.hand[0], 0);
    expect(canEndTurn(g)).toBe(false);
    g = play(g, g.hand[0], 1);
    expect(canEndTurn(g)).toBe(true);
    g = endTurn(g);
    expect(g.hand).toHaveLength(8);
    expect(g.deck).toHaveLength(88);
    expect(g.turn).toBe(2);
    expect(g.turnMoves).toHaveLength(0);
  });

  it('ignores illegal plays', () => {
    const g = state({ piles: [50, 50, 60, 60], hand: [55] });
    expect(play(g, 55, 2)).toEqual(play(g, 55, 2));
    expect(play(g, 40, 0)).toBe(g); // not in hand
  });

  it('undo steps back one move at a time', () => {
    let g = fresh();
    const [a, b] = g.hand;
    g = play(play(g, a, 0), b, 1);
    g = undo(g);
    expect(g.piles[1]).toBe(1);
    expect(g.piles[0]).toBe(a);
    expect(g.hand).toContain(b);
    g = undo(g);
    expect(g).toEqual({ ...fresh(), startedAt: g.startedAt });
  });

  it('drops the requirement to one card once the deck is empty', () => {
    const g = state({ deck: [], hand: [10, 20], piles: [1, 1, 100, 100] });
    expect(required(g)).toBe(1);
  });
});

describe('endings', () => {
  it('wins on the last card even mid-turn', () => {
    const g = play(state({ deck: [], hand: [42], piles: [1, 1, 100, 100] }), 42, 0, 5);
    expect(g.status).toBe('won');
    expect(g.endedAt).toBe(5);
    expect(cardsLeft(g)).toBe(0);
  });

  it('loses when stuck before meeting the minimum', () => {
    // After 60 goes on the first pile, 52 fits nowhere.
    const g = state({ deck: [3, 4], hand: [52, 60], piles: [55, 98, 45, 40] });
    const after = play(g, 60, 0);
    expect(after.status).toBe('lost');
  });

  it('is not lost when the minimum is met, even with no moves left', () => {
    const g = state({ deck: [3, 4], hand: [52, 60, 61], piles: [55, 98, 45, 40] });
    const after = play(play(g, 60, 0), 61, 0);
    expect(after.status).toBe('playing');
    expect(canEndTurn(after)).toBe(true);
  });

  it('loses after drawing a dead hand', () => {
    const g = state({ deck: [52], hand: [33, 60, 61], piles: [55, 98, 25, 20] });
    const mid = play(play(g, 60, 0), 61, 0);
    expect(mid.status).toBe('playing');
    const after = endTurn(mid);
    expect(after.hand).toEqual([33, 52]);
    expect(after.status).toBe('lost');
  });
});
