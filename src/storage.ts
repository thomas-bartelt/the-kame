/**
 * Persistence: the in-progress game, lifetime stats and settings.
 * Every access is guarded, since storage can be unavailable (private mode, quotas).
 */

import { type Difficulty, type GameState, cardsLeft } from './engine/game';
import { randomSeed, seedFromString } from './engine/rng';

const KEYS = {
  save: 'kame:save:v2',
  stats: 'kame:stats:v1',
  settings: 'kame:settings:v1',
  legacy: 'theGameSave',
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the game still works, it just won't persist */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Game

export function saveGame(state: GameState): void {
  if (state.status === 'playing') write(KEYS.save, state);
  else remove(KEYS.save);
}

export function loadGame(): GameState | null {
  const saved = read<GameState>(KEYS.save);
  if (saved?.version === 2 && saved.status === 'playing') return saved;
  return migrateLegacy();
}

/** Shape written by the original single-file version (v1). */
interface LegacySave {
  deck: number[];
  hand: number[];
  piles: number[];
  turnMoves?: { card: number; pileIndex: number; previousValue: number }[];
  gameOver?: boolean;
}

/** Carry a game in progress over from the old index.html, once. */
function migrateLegacy(): GameState | null {
  const old = read<LegacySave>(KEYS.legacy);
  remove(KEYS.legacy);
  if (!old || old.gameOver || !Array.isArray(old.deck) || !Array.isArray(old.hand)) return null;
  const seed = randomSeed();
  return {
    version: 2,
    seed,
    difficulty: 'hard',
    daily: false,
    // v1 drew with deck.pop(), same as v2, so the order carries over as-is.
    deck: old.deck,
    hand: [...old.hand].sort((a, b) => a - b),
    piles: old.piles,
    turnMoves: (old.turnMoves ?? []).map((m) => ({ card: m.card, pile: m.pileIndex, previous: m.previousValue })),
    turn: 1,
    rng: seedFromString(seed),
    status: 'playing',
    startedAt: Date.now(),
    endedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Stats

export interface Stats {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  /** Fewest cards left, per difficulty. */
  best: Partial<Record<Difficulty, number>>;
  /** Daily deal results by seed, so each day is recorded once. */
  daily: Record<string, number>;
}

const emptyStats = (): Stats => ({ played: 0, won: 0, streak: 0, bestStreak: 0, best: {}, daily: {} });

export function loadStats(): Stats {
  return { ...emptyStats(), ...read<Stats>(KEYS.stats) };
}

/** Record a finished game. Returns the updated stats and whether it set a record. */
export function recordResult(state: GameState): { stats: Stats; record: boolean } {
  const stats = loadStats();
  const left = cardsLeft(state);
  const won = state.status === 'won';

  stats.played += 1;
  if (won) {
    stats.won += 1;
    stats.streak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  } else {
    stats.streak = 0;
  }

  const prev = stats.best[state.difficulty];
  const record = prev === undefined || left < prev;
  if (record) stats.best[state.difficulty] = left;

  if (state.daily && !(state.seed in stats.daily)) stats.daily[state.seed] = left;

  write(KEYS.stats, stats);
  return { stats, record: record && prev !== undefined };
}

// ---------------------------------------------------------------------------
// Settings

export type Theme = 'auto' | 'dark' | 'light';

export interface Settings {
  hints: boolean;
  theme: Theme;
  sound: boolean;
  haptics: boolean;
  difficulty: Difficulty;
  /** Has the player dismissed the first-run rules sheet? */
  onboarded: boolean;
}

const defaultSettings: Settings = {
  hints: false,
  theme: 'auto',
  sound: true,
  haptics: true,
  difficulty: 'hard',
  onboarded: false,
};

export function loadSettings(): Settings {
  return { ...defaultSettings, ...read<Settings>(KEYS.settings) };
}

export function saveSettings(settings: Settings): void {
  write(KEYS.settings, settings);
}
