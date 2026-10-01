# The Kame

A single-player card game for your phone. Four piles, 98 cards, one way out.

**Play:** https://thomas-bartelt.github.io/the-kame/

Installable as an app (Add to Home Screen) and fully playable offline.

## How to play

- The deck holds the cards **2 to 99**. Two piles climb from **1**, two fall from **100**.
- You hold **8 cards**. Play **at least 2** each turn (only 1 once the deck is empty), then end the turn to draw back up to 8.
- A climbing pile takes any **higher** card. A falling pile takes any **lower** card.
- **Backwards trick:** a card exactly **10** the "wrong" way is always allowed (42 on a climbing 52, 67 on a falling 57). It is the only way to win back room.
- You win by playing all 98 cards. Your score is the number of cards left when you get stuck, so lower is better.

Drag a card onto a pile, or tap a card and then a pile. The line at the top shows where every pile sits between 1 and 100, and how much room is left in the middle.

### Modes

| Mode | What changes |
| --- | --- |
| Easy | The deck is banded: low and high cards come first, the middle last. |
| Medium | Draws favour cards that set up a backwards trick. |
| Hard | A fair shuffle. The original game. |

**Daily deal:** the same Hard deal for everyone on a given day. **Share** sends a link that replays your exact deal.

### Keyboard (desktop)

`←` `→` pick a card · `1`-`4` play it on a pile · `Enter` end turn · `Z` undo · `H` hints · `Esc` deselect

## Development

Requires Node 22+.

```sh
npm install
npm run dev        # local dev server
npm test           # rules engine tests (Vitest)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

### Project layout

```
index.html            App shell and dialogs
public/               Icons (favicon, app icons)
src/
  main.ts             Wiring: state, actions, menus, keyboard, boot
  storage.ts          Saved game, stats and settings (localStorage)
  engine/
    game.ts           Rules engine: pure functions, no DOM
    game.test.ts      Engine tests
    rng.ts            Seeded RNG, so a deal can be replayed and shared
  ui/
    board.ts          Line, piles and hand: rendering, tap and drag input
    feedback.ts       Synthesised sounds and haptics
    confetti.ts       Win effect
    icons.ts          Phosphor icons, inlined at build time
  styles/
    tokens.css        Colours, type, shape, motion (dark and light)
    app.css           Layout, mobile first
```

The rules live in `src/engine` and know nothing about the page, so they can be tested on their own and reused later (an AI player, a solver, multiplayer).

### Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages. In the repository settings, **Pages → Build and deployment → Source** must be set to **GitHub Actions**.
