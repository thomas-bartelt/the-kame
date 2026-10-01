/**
 * The Kame rules engine. Pure functions over plain data: no DOM, no storage.
 *
 * Rules
 * - 98 cards numbered 2 to 99. Four piles: two climb from 1, two fall from 100.
 * - You hold 8 cards. Each turn you must play at least 2 (only 1 once the draw
 *   pile is empty), then refill your hand.
 * - A climbing pile takes any higher card, or exactly 10 lower (the "backwards
 *   trick"). A falling pile takes any lower card, or exactly 10 higher.
 * - You win by playing all 98 cards. You lose when you cannot complete a turn.
 */

import { Rng, seedFromString } from './rng';

export const HAND_SIZE = 8;
export const LOWEST = 2;
export const HIGHEST = 99;

export type Direction = 'up' | 'down';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Status = 'playing' | 'won' | 'lost';

export const PILES: readonly { dir: Direction; start: number }[] = [
  { dir: 'up', start: 1 },
  { dir: 'up', start: 1 },
  { dir: 'down', start: 100 },
  { dir: 'down', start: 100 },
];

export interface Move {
  card: number;
  pile: number;
  previous: number;
}

export interface GameState {
  version: 2;
  seed: string;
  difficulty: Difficulty;
  daily: boolean;
  /** Remaining draw pile. The next card drawn is the last element. */
  deck: number[];
  hand: number[];
  piles: number[];
  /** Moves made this turn, oldest first. Cleared when the turn ends. */
  turnMoves: Move[];
  turn: number;
  rng: number;
  status: Status;
  startedAt: number;
  endedAt: number | null;
}

export interface NewGameOptions {
  seed: string;
  difficulty?: Difficulty;
  daily?: boolean;
  now?: number;
}

export const DIFFICULTIES: Record<Difficulty, { label: string; blurb: string }> = {
  easy: {
    label: 'Easy',
    blurb: 'The deck is banded. Low and high cards come first, the messy middle last.',
  },
  medium: {
    label: 'Medium',
    blurb: 'Draws lean toward cards that unlock a backwards trick.',
  },
  hard: {
    label: 'Hard',
    blurb: 'A fair shuffle. The original game, no help at all.',
  },
};

// ---------------------------------------------------------------------------
// Setup

function fullDeck(): number[] {
  const cards: number[] = [];
  for (let c = LOWEST; c <= HIGHEST; c++) cards.push(c);
  return cards;
}

/**
 * Easy mode deck: shuffled inside value bands, bands ordered so the edges
 * (cards that sit comfortably on fresh piles) arrive first.
 * Returned in draw order (index 0 drawn first); caller reverses for storage.
 */
function bandedOrder(rng: Rng): number[] {
  const bands: [number, number][] = [
    [2, 12],
    [88, 99],
    [13, 35],
    [65, 87],
    [36, 64],
  ];
  return bands.flatMap(([lo, hi]) => rng.shuffle(fullDeck().filter((c) => c >= lo && c <= hi)));
}

export function newGame({ seed, difficulty = 'hard', daily = false, now = Date.now() }: NewGameOptions): GameState {
  const rng = new Rng(seedFromString(`${seed}:${difficulty}`));
  const drawOrder = difficulty === 'easy' ? bandedOrder(rng) : rng.shuffle(fullDeck());

  const state: GameState = {
    version: 2,
    seed,
    difficulty,
    daily,
    deck: drawOrder.reverse(),
    hand: [],
    piles: PILES.map((p) => p.start),
    turnMoves: [],
    turn: 1,
    rng: rng.state,
    status: 'playing',
    startedAt: now,
    endedAt: null,
  };
  return refill(state);
}

// ---------------------------------------------------------------------------
// Queries

export function canPlay(card: number, pile: number, piles: readonly number[]): boolean {
  const top = piles[pile];
  return PILES[pile].dir === 'up'
    ? card > top || card === top - 10
    : card < top || card === top + 10;
}

/** True when this play moves a pile backwards (the ±10 trick). */
export function isTrick(card: number, pile: number, piles: readonly number[]): boolean {
  const top = piles[pile];
  return PILES[pile].dir === 'up' ? card === top - 10 : card === top + 10;
}

export function playablePiles(state: GameState, card: number): number[] {
  return PILES.map((_, i) => i).filter((i) => canPlay(card, i, state.piles));
}

export function hasAnyMove(state: GameState): boolean {
  return state.hand.some((c) => playablePiles(state, c).length > 0);
}

/** Cards required per turn: 2 while the deck lasts, then 1. */
export function required(state: GameState): number {
  return state.deck.length > 0 ? 2 : 1;
}

export function playedThisTurn(state: GameState): number {
  return state.turnMoves.length;
}

export function canEndTurn(state: GameState): boolean {
  return state.status === 'playing' && playedThisTurn(state) >= required(state);
}

/** Cards still not played. 0 is a perfect game; this is the official score. */
export function cardsLeft(state: GameState): number {
  return state.deck.length + state.hand.length;
}

/**
 * How much "room" a pile has left: how far it is from its far end.
 * A fresh climbing pile has 98 cards of room, a pile on 99 has 0.
 */
export function pileRoom(state: GameState, pile: number): number {
  const top = state.piles[pile];
  return PILES[pile].dir === 'up' ? Math.max(0, HIGHEST - top) : Math.max(0, top - LOWEST);
}

/**
 * The gap a play would burn: how many values the pile jumps over.
 * Negative for a backwards trick (it gives room back).
 */
export function cost(card: number, pile: number, piles: readonly number[]): number {
  const top = piles[pile];
  return PILES[pile].dir === 'up' ? card - top - 1 : top - card - 1;
}

/** The cheapest legal play for a card, or null. Used by hints and the tap shortcut. */
export function bestPile(state: GameState, card: number): number | null {
  let best: number | null = null;
  let bestCost = Infinity;
  for (const p of playablePiles(state, card)) {
    const c = cost(card, p, state.piles);
    if (c < bestCost) {
      best = p;
      bestCost = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Actions. Each returns a new state, or the same object when the action is illegal.

export function play(state: GameState, card: number, pile: number, now = Date.now()): GameState {
  if (state.status !== 'playing') return state;
  if (!state.hand.includes(card) || !canPlay(card, pile, state.piles)) return state;

  const piles = [...state.piles];
  const previous = piles[pile];
  piles[pile] = card;

  const next: GameState = {
    ...state,
    piles,
    hand: state.hand.filter((c) => c !== card),
    turnMoves: [...state.turnMoves, { card, pile, previous }],
  };
  return settle(next, now);
}

/** Take back the most recent move of this turn. Drawn cards are never undone. */
export function undo(state: GameState): GameState {
  if (state.status !== 'playing' || state.turnMoves.length === 0) return state;
  const last = state.turnMoves[state.turnMoves.length - 1];
  const piles = [...state.piles];
  piles[last.pile] = last.previous;
  return {
    ...state,
    piles,
    hand: [...state.hand, last.card].sort((a, b) => a - b),
    turnMoves: state.turnMoves.slice(0, -1),
  };
}

export function endTurn(state: GameState, now = Date.now()): GameState {
  if (!canEndTurn(state)) return state;
  const next = refill({ ...state, turnMoves: [], turn: state.turn + 1 });
  return settle(next, now);
}

// ---------------------------------------------------------------------------
// Internals

function refill(state: GameState): GameState {
  const deck = [...state.deck];
  const hand = [...state.hand];
  const rng = new Rng(state.rng);

  while (hand.length < HAND_SIZE && deck.length > 0) {
    if (state.difficulty === 'medium') {
      hand.push(...deck.splice(weightedIndex(deck, state.piles, rng), 1));
    } else {
      hand.push(deck.pop()!);
    }
  }
  hand.sort((a, b) => a - b);
  return { ...state, deck, hand, rng: rng.state };
}

/** Medium mode: cards that would enable a backwards trick are 3x as likely. */
function weightedIndex(deck: readonly number[], piles: readonly number[], rng: Rng): number {
  const weights = deck.map((card) => (PILES.some((_, p) => isTrick(card, p, piles)) ? 3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.float() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return deck.length - 1;
}

/** Decide whether the game is over after any change. */
function settle(state: GameState, now: number): GameState {
  if (state.hand.length === 0 && state.deck.length === 0) {
    return { ...state, status: 'won', endedAt: now };
  }
  // Stuck: the turn cannot be completed and there is nothing to play.
  // (If the minimum is already met, the player can still end the turn.)
  if (playedThisTurn(state) < required(state) && !hasAnyMove(state)) {
    return { ...state, status: 'lost', endedAt: now };
  }
  return state;
}

/** A one-word verdict for the end screen. */
export function rating(left: number): string {
  if (left === 0) return 'Perfect';
  if (left <= 5) return 'Outstanding';
  if (left <= 10) return 'Excellent';
  if (left <= 20) return 'Solid';
  if (left <= 35) return 'Getting there';
  return 'The deck won';
}
