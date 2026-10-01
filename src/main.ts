import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './styles/tokens.css';
import './styles/app.css';

import { registerSW } from 'virtual:pwa-register';
import {
  DIFFICULTIES,
  type Difficulty,
  type GameState,
  canEndTurn,
  cardsLeft,
  endTurn,
  isTrick,
  newGame,
  play,
  playedThisTurn,
  rating,
  required,
  undo,
} from './engine/game';
import { dailySeed, randomSeed } from './engine/rng';
import { type Stats, type Theme, loadGame, loadSettings, loadStats, recordResult, saveGame, saveSettings } from './storage';
import { Board } from './ui/board';
import { confetti } from './ui/confetti';
import { configureFeedback, fx } from './ui/feedback';
import { hydrateIcons } from './ui/icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------------------
// State

const settings = loadSettings();
let state: GameState = startingGame();
let selected: number | null = null;
let dealt = new Set<number>(state.hand);
let pickDifficulty: Difficulty = state.difficulty;

function startingGame(): GameState {
  const params = new URLSearchParams(location.search);
  const sharedSeed = params.get('seed');
  if (sharedSeed) {
    history.replaceState(null, '', location.pathname);
    const d = params.get('d') as Difficulty | null;
    return newGame({
      seed: sharedSeed.slice(0, 40),
      difficulty: d && d in DIFFICULTIES ? d : 'hard',
      daily: sharedSeed.startsWith('DAILY-'),
    });
  }
  return loadGame() ?? newGame({ seed: randomSeed(), difficulty: settings.difficulty });
}

// ---------------------------------------------------------------------------
// Board

const board = new Board(
  {
    line: $('line'),
    lineOpen: $('line-open'),
    piles: $('piles'),
    hand: $('hand'),
    dragLayer: $('drag-layer'),
  },
  {
    tapCard(card) {
      selected = selected === card ? null : card;
      if (selected !== null) fx.pick();
      render();
    },
    tapPile(pile) {
      if (selected === null) {
        if (state.status === 'playing') toast('Pick a card first');
        return;
      }
      tryPlay(selected, pile, board.rectOf(selected));
    },
    dropCard(card, pile, from) {
      return tryPlay(card, pile, from);
    },
    dragStart(card) {
      selected = card;
      fx.pick();
      render();
    },
  },
);

function tryPlay(card: number, pile: number, from: DOMRect | null): boolean {
  const trick = isTrick(card, pile, state.piles);
  const next = play(state, card, pile);
  if (next === state) {
    fx.invalid();
    board.bad(pile);
    announce(`${card} does not fit on that pile`);
    return false;
  }
  selected = null;
  commit(next);
  trick ? fx.trick() : fx.place();
  announce(trick ? `${card}, backwards trick` : `Played ${card}`);
  if (from) void board.fly(card, pile, from, trick);
  return true;
}

function doUndo(): void {
  const next = undo(state);
  if (next === state) return;
  selected = null;
  fx.undo();
  commit(next);
}

function doEndTurn(): void {
  if (state.status !== 'playing') {
    openMenu();
    return;
  }
  if (!canEndTurn(state)) {
    fx.invalid();
    const need = required(state) - playedThisTurn(state);
    toast(`Play ${need} more card${need === 1 ? '' : 's'} first`);
    return;
  }
  const before = new Set(state.hand);
  const next = endTurn(state);
  dealt = new Set(next.hand.filter((c) => !before.has(c)));
  selected = null;
  if (dealt.size) fx.deal();
  commit(next);
}

function startGame(opts: { seed?: string; difficulty?: Difficulty; daily?: boolean } = {}): void {
  const difficulty = opts.difficulty ?? pickDifficulty;
  state = newGame({ seed: opts.seed ?? randomSeed(), difficulty, daily: opts.daily ?? false });
  settings.difficulty = difficulty;
  saveSettings(settings);
  selected = null;
  dealt = new Set(state.hand);
  saveGame(state);
  closeAll();
  fx.deal();
  render();
  dealt = new Set();
}

function commit(next: GameState): void {
  const was = state.status;
  state = next;
  saveGame(state);
  render();
  dealt = new Set();
  if (was === 'playing' && state.status !== 'playing') finish();
}

// ---------------------------------------------------------------------------
// Render the chrome around the board

const endBtn = $<HTMLButtonElement>('end-btn');
const endLabel = $('end-label');
const undoBtn = $<HTMLButtonElement>('undo-btn');
const hintsBtn = $<HTMLButtonElement>('hints-btn');

function render(): void {
  board.render(state, { selected, hints: settings.hints, dealt });

  $('deck-count').textContent = String(state.deck.length);
  $('deck-count').parentElement!.parentElement!.dataset.empty = String(state.deck.length === 0);

  // The primary button never goes truly disabled: tapping it early explains what is missing.
  const need = Math.max(0, required(state) - playedThisTurn(state));
  const waiting = state.status === 'playing' && need > 0;
  if (state.status !== 'playing') endLabel.textContent = 'New game';
  else if (waiting) endLabel.innerHTML = `Play <span class="count">${need}</span> more`;
  else endLabel.textContent = state.deck.length ? 'End turn' : 'Next turn';
  endBtn.classList.toggle('is-waiting', waiting);
  endBtn.setAttribute('aria-disabled', String(waiting));

  undoBtn.disabled = state.status !== 'playing' || state.turnMoves.length === 0;
  hintsBtn.setAttribute('aria-pressed', String(settings.hints));
}

// ---------------------------------------------------------------------------
// End of game

function finish(): void {
  const { stats, record } = recordResult(state);
  const won = state.status === 'won';
  const left = cardsLeft(state);

  setTimeout(
    () => {
      won ? fx.win() : fx.lose();
      if (won) confetti();
    },
    won ? 300 : 500,
  );

  const sheet = $('result');
  sheet.dataset.won = String(won);
  $('result-kicker').textContent = state.daily
    ? `Daily deal, ${state.seed.slice(6)}`
    : `${DIFFICULTIES[state.difficulty].label} game`;
  $('result-left').textContent = String(left);
  $('result-title').textContent = won ? 'Cleared. Every card.' : rating(left);
  $('result-detail').textContent = won
    ? `All 98 cards in ${state.turn} turns.`
    : `${left} card${left === 1 ? '' : 's'} left with nowhere to go.${record ? ' A new personal best.' : ''}`;
  renderStats($('result-stats'), stats);

  setTimeout(() => open(sheet), won ? 1100 : 900);
}

function renderStats(el: HTMLElement, stats: Stats): void {
  const best = stats.best[state.difficulty];
  const cells: [string, string | number][] = [
    ['Played', stats.played],
    ['Won', stats.played ? `${Math.round((stats.won / stats.played) * 100)}%` : '0%'],
    ['Streak', stats.streak],
    [`Best (${DIFFICULTIES[state.difficulty].label.toLowerCase()})`, best ?? '-'],
  ];
  el.innerHTML = cells.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
}

async function share(): Promise<void> {
  const left = cardsLeft(state);
  const what = state.daily ? `Daily deal ${state.seed.slice(6)}` : `${DIFFICULTIES[state.difficulty].label} deal`;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('seed', state.seed);
  url.searchParams.set('d', state.difficulty);
  const text = left === 0 ? `The Kame, ${what}: cleared all 98 cards.` : `The Kame, ${what}: ${left} cards left. Can you beat it?`;

  try {
    if (navigator.share) {
      await navigator.share({ title: 'The Kame', text, url: url.href });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url.href}`);
    toast('Copied to clipboard');
  } catch {
    /* share sheet dismissed */
  }
}

// ---------------------------------------------------------------------------
// Sheets

function open(dialog: HTMLElement): void {
  const d = dialog as HTMLDialogElement;
  if (!d.open) d.showModal();
}

function closeAll(): void {
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => d.close());
}

document.querySelectorAll<HTMLDialogElement>('dialog').forEach((d) => {
  // Tap on the backdrop closes the sheet.
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  });
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
});

$('rules').addEventListener('close', () => {
  if (!settings.onboarded) {
    settings.onboarded = true;
    saveSettings(settings);
  }
});

function openMenu(): void {
  pickDifficulty = state.status === 'playing' ? state.difficulty : settings.difficulty;
  renderDifficulty();
  renderStats($('stats'), loadStats());
  $<HTMLInputElement>('set-hints').checked = settings.hints;
  $<HTMLInputElement>('set-sound').checked = settings.sound;
  $<HTMLInputElement>('set-haptics').checked = settings.haptics;
  $('seed-label').textContent = state.daily ? state.seed.slice(6) : state.seed;
  const today = dailySeed();
  $<HTMLButtonElement>('daily-btn').lastChild!.textContent = today in loadStats().daily ? 'Daily (done)' : 'Daily deal';
  open($('menu'));
}

const difficultyEl = $('difficulty');
(Object.keys(DIFFICULTIES) as Difficulty[]).forEach((d) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.value = d;
  b.textContent = DIFFICULTIES[d].label;
  b.addEventListener('click', () => {
    pickDifficulty = d;
    renderDifficulty();
  });
  difficultyEl.append(b);
});

const THEMES: [Theme, string][] = [
  ['auto', 'Auto'],
  ['dark', 'Dark'],
  ['light', 'Light'],
];
const themeEl = $('theme');
THEMES.forEach(([value, label]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.value = value;
  b.textContent = label;
  b.addEventListener('click', () => {
    settings.theme = value;
    saveSettings(settings);
    applyTheme();
  });
  themeEl.append(b);
});

function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  themeEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.value === settings.theme));
  });
  const bg = getComputedStyle(root).getPropertyValue('--table').trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = bg));
}

function renderDifficulty(): void {
  difficultyEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.value === pickDifficulty));
  });
  $('difficulty-blurb').textContent = DIFFICULTIES[pickDifficulty].blurb;
}

// ---------------------------------------------------------------------------
// Wiring

$('menu-btn').addEventListener('click', openMenu);
$('rules-btn').addEventListener('click', () => {
  $<HTMLDialogElement>('menu').close();
  open($('rules'));
});
$('new-btn').addEventListener('click', () => startGame());
$('daily-btn').addEventListener('click', () => startGame({ seed: dailySeed(), difficulty: 'hard', daily: true }));
$('replay-btn').addEventListener('click', () =>
  startGame({ seed: state.seed, difficulty: state.difficulty, daily: state.daily }),
);
$('result-replay').addEventListener('click', () =>
  startGame({ seed: state.seed, difficulty: state.difficulty, daily: state.daily }),
);
$('result-new').addEventListener('click', () => {
  closeAll();
  openMenu();
});
$('result-share').addEventListener('click', () => void share());

endBtn.addEventListener('click', doEndTurn);
undoBtn.addEventListener('click', doUndo);

function setHints(on: boolean): void {
  settings.hints = on;
  saveSettings(settings);
  render();
}

hintsBtn.addEventListener('click', () => {
  setHints(!settings.hints);
  toast(settings.hints ? 'Hints on' : 'Hints off');
});
$<HTMLInputElement>('set-hints').addEventListener('change', (e) => setHints((e.target as HTMLInputElement).checked));
$<HTMLInputElement>('set-sound').addEventListener('change', (e) => {
  settings.sound = (e.target as HTMLInputElement).checked;
  saveSettings(settings);
  configureFeedback(settings);
  fx.place();
});
$<HTMLInputElement>('set-haptics').addEventListener('change', (e) => {
  settings.haptics = (e.target as HTMLInputElement).checked;
  saveSettings(settings);
  configureFeedback(settings);
});
if (!('vibrate' in navigator)) $('haptics-row').hidden = true;

// Tap on empty table clears the selection.
$('app').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (selected !== null && !t.closest('.card, .pile, button')) {
    selected = null;
    render();
  }
});

// Keyboard: arrows pick a card, 1-4 play it, Enter ends the turn, Z undoes.
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      doUndo();
    }
    return;
  }
  const hand = state.hand;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    if (!hand.length) return;
    const i = selected === null ? -1 : hand.indexOf(selected);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    selected = hand[(i + step + hand.length) % hand.length] ?? hand[0];
    if (i === -1 && step === -1) selected = hand[hand.length - 1];
    fx.pick();
    render();
  } else if (['1', '2', '3', '4'].includes(e.key) && selected !== null) {
    tryPlay(selected, Number(e.key) - 1, board.rectOf(selected));
  } else if (e.key === 'Enter' && (e.target === document.body || (e.target as HTMLElement).closest('.card'))) {
    e.preventDefault();
    doEndTurn();
  } else if (e.key === 'z' || e.key === 'Backspace') {
    doUndo();
  } else if (e.key === 'h') {
    hintsBtn.click();
  } else if (e.key === 'Escape') {
    selected = null;
    render();
  }
});

// ---------------------------------------------------------------------------
// Small helpers

let toastTimer = 0;
function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-shown'), 1800);
}

function announce(message: string): void {
  $('announcer').textContent = message;
}

// ---------------------------------------------------------------------------
// Boot

hydrateIcons();
applyTheme();
configureFeedback(settings);
render();
dealt = new Set();
saveGame(state);
if (!settings.onboarded) setTimeout(() => open($('rules')), 500);

registerSW({ immediate: true });
