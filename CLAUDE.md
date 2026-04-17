# CLAUDE.md - AI Assistant Guide for The Kame

## Project Overview

**The Kame** is a single-file, browser-based card game with no external dependencies. The entire application lives in `index.html` (465 lines) combining HTML, CSS, and JavaScript in one self-contained file.

## Quick Facts

- **Single file**: `index.html` contains everything
- **No build process**: Open directly in browser
- **No dependencies**: Pure vanilla HTML/CSS/JavaScript
- **External resource**: Google Fonts (Inter typeface)
- **Persistence**: localStorage for game saves

## Codebase Structure

```
/the-kame/
├── index.html          # Complete application (465 lines)
├── CLAUDE.md           # This file
└── .git/               # Git version control
```

### File Organization (index.html)

| Lines     | Section                  | Description                              |
|-----------|--------------------------|------------------------------------------|
| 1-9       | HTML Head                | Meta tags, viewport, mobile-web-app      |
| 10-242    | `<style>`                | All CSS with responsive breakpoints      |
| 244-298   | HTML Body                | Game container, piles, hand, controls    |
| 302-352   | Main `<script>`          | Core game logic and initialization       |
| 356-462   | DRAW-ANIMATION-FIX       | Animation enhancement wrapper            |

## Technologies & Patterns

### CSS Features
- Glass-morphism effects (backdrop-filter, blur)
- CSS Grid and Flexbox for responsive layout
- Gradient animations and transitions
- 6+ keyframe animations (cardPlace, slideIn, celebrate, confetti, shake)
- Responsive breakpoints at 768px

### JavaScript Patterns
- **State-driven UI**: Single `gameState` object as source of truth
- **Pure functions**: `canPlayCard()`, `hasValidMove()`, `getTensDigit()`
- **Event delegation**: Centralized click handlers
- **Drag-and-drop API**: Full drag lifecycle implementation
- **localStorage**: Auto-save after each action

### State Object Structure
```javascript
gameState = {
  deck: [],                   // Remaining cards to draw
  hand: [],                   // Player's current hand (8 cards max)
  piles: [1, 1, 100, 100],   // Current pile values [asc, asc, desc, desc]
  selectedCard: null,         // Click-based selection
  cardsPlayedThisTurn: 0,    // Turn counter
  gameOver: false,            // Game state flag
  showHints: false,           // UI toggle
  draggedCard: null,          // Drag state
  draggedIndex: null,         // Drag state
  turnMoves: []              // Undo history
}
```

## Game Rules (Essential Context)

Understanding the game rules is crucial for modifying the code:

- **4 Piles**: 2 ascending (start at 1), 2 descending (start at 100)
- **Cards**: Deck of 2-99, player holds 8 cards
- **Ascending piles**: Play cards higher than current OR exactly 10 lower
- **Descending piles**: Play cards lower than current OR exactly 10 higher
- **Turn requirement**: Must play 2+ cards (1 when deck empty)
- **Win**: Empty hand + empty deck
- **Lose**: No valid moves available

## Development Workflow

### Running the Game
```bash
# No build needed - just open in browser
open index.html
# or
python -m http.server 8000  # Then visit localhost:8000
```

### Making Changes
1. Edit `index.html`
2. Refresh browser to see changes
3. Game state persists via localStorage (clear with `localStorage.removeItem('theGameSave')`)

### Testing Changes
- Manual browser testing (no automated tests)
- Check mobile responsiveness in DevTools
- Test drag-and-drop and click-to-select modes
- Verify localStorage save/load works

## Naming Conventions

| Type        | Convention   | Examples                              |
|-------------|--------------|---------------------------------------|
| Functions   | camelCase    | `canPlayCard`, `updateDisplay`        |
| Variables   | camelCase    | `gameState`, `draggedCard`            |
| CSS Classes | kebab-case   | `.pile`, `.hand-card`, `.game-over`   |
| IDs         | kebab-case   | `#draw-count`, `#game-over-message`   |
| Data Attrs  | kebab-case   | `data-tens`, `data-pile`              |

## Key Functions Reference

| Function            | Purpose                                      |
|---------------------|----------------------------------------------|
| `initGame()`        | Initialize deck, shuffle, deal initial hand  |
| `updateDisplay()`   | Rebuild entire UI from gameState             |
| `canPlayCard()`     | Validate if card can be played on pile       |
| `playCard()`        | Execute card play and update state           |
| `hasValidMove()`    | Check if any valid moves exist               |
| `endTurn()`         | Draw cards, check win/lose conditions        |
| `undo()`            | Revert last move from turnMoves history      |
| `setupDragAndDrop()`| Initialize drag-and-drop event handlers      |

## Responsive Breakpoints

- **Desktop (>768px)**: Full UI, all controls visible
- **Tablet/Mobile (<=768px)**: 2x2 pile grid, 4x2 hand grid
- **Landscape phones**: 4-column piles, 8-column hand row
- **Touch devices**: Special hover state handling via `@media (hover: none)`

## Common Tasks

### Adding a New Feature
1. Locate the appropriate section in `index.html`
2. Add CSS in the `<style>` block (lines 10-242)
3. Add HTML in the body structure (lines 244-298)
4. Add JavaScript in the main script (lines 302-352)
5. If animation-related, consider the DRAW-ANIMATION-FIX section

### Modifying Game Rules
- Card validation: Modify `canPlayCard()` function
- Turn requirements: Modify `endTurn()` checks
- Win/lose conditions: Modify `checkGameOver()` logic

### Styling Changes
- All styles are in the `<style>` tag at the top
- Card colors are controlled by `[data-tens="N"]` selectors
- Glass-morphism uses `backdrop-filter` and rgba colors

## Important Notes

- **No external dependencies**: Don't add npm packages or build tools
- **Single-file constraint**: Keep everything in index.html
- **Mobile-first**: Always test responsive design
- **localStorage**: Game auto-saves; handle save/load carefully
- **Animations**: The DRAW-ANIMATION-FIX block wraps core functions for enhanced animations

## Git Conventions

- Commit messages: Brief descriptions of changes
- Branch naming: Feature branches use `claude/` prefix
- No CI/CD: Manual deployment only
