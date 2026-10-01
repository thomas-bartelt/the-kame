/**
 * The table: line, piles and hand. Owns the DOM for those regions, renders a
 * GameState into them, and turns pointer input (tap or drag) into intents.
 */

import { type GameState, PILES, canPlay, isTrick, playablePiles } from '../engine/game';
import { icon } from './icons';

export interface BoardView {
  selected: number | null;
  hints: boolean;
  /** Cards that just arrived in the hand and should animate in. */
  dealt: ReadonlySet<number>;
}

export interface BoardHandlers {
  tapCard(card: number): void;
  tapPile(pile: number): void;
  /** Return true if the drop was accepted. */
  dropCard(card: number, pile: number, from: DOMRect): boolean;
  dragStart(card: number): void;
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const DRAG_THRESHOLD = 6;

/**
 * Give a card its value and its "ten": 2-9 is ten 0, 90-99 is ten 9. Each ten has
 * its own colour and motif (see cards.css). The starting 1 and 100 have none.
 */
function paint(el: HTMLElement, value: number): void {
  el.style.setProperty('--v', String(value));
  if (value >= 2 && value <= 99) {
    const ten = Math.floor(value / 10);
    el.dataset.ten = String(ten);
    el.style.setProperty('--t', String(ten));
  } else {
    delete el.dataset.ten;
  }
}

function cardMarkup(value: number): string {
  return `<span class="card__num">${value}</span><span class="card__gauge" aria-hidden="true"></span>`;
}

export class Board {
  private piles: HTMLButtonElement[] = [];
  private marks: HTMLElement[] = [];
  private ghost: HTMLElement;
  private handCards = new Map<number, HTMLButtonElement>();
  private state!: GameState;
  private dragging: { card: number; el: HTMLElement; clone: HTMLElement; dx: number; dy: number; over: number | null } | null =
    null;

  constructor(
    private els: {
      line: HTMLElement;
      lineOpen: HTMLElement;
      piles: HTMLElement;
      hand: HTMLElement;
      dragLayer: HTMLElement;
    },
    private on: BoardHandlers,
  ) {
    const track = els.line.querySelector<HTMLElement>('.line__track')!;

    PILES.forEach((p, i) => {
      const pile = document.createElement('button');
      pile.type = 'button';
      pile.className = 'pile';
      pile.dataset.pile = String(i);
      pile.dataset.dir = p.dir;
      pile.innerHTML = `
        <span class="pile__head">${icon(p.dir === 'up' ? 'caret-up' : 'caret-down')}<span>${p.start}</span></span>
        <span class="pile__slot">
          <span class="card">${cardMarkup(p.start)}</span>
          <span class="pile__trick">10 back</span>
        </span>`;
      pile.addEventListener('click', () => this.on.tapPile(i));
      els.piles.append(pile);
      this.piles.push(pile);

      const mark = document.createElement('span');
      mark.className = `line__mark line__mark--${p.dir}`;
      mark.innerHTML = '<span></span>';
      track.append(mark);
      this.marks.push(mark);
    });

    this.ghost = document.createElement('span');
    this.ghost.className = 'line__mark line__mark--ghost';
    this.ghost.hidden = true;
    this.ghost.innerHTML = '<span></span>';
    track.append(this.ghost);

    els.hand.addEventListener('pointerdown', (e) => this.pointerDown(e));
    // Pointer taps are handled on pointerup; keyboard activation arrives as a detail-0 click.
    els.hand.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.card[data-card]');
      if (el && e.detail === 0) this.on.tapCard(Number(el.dataset.card));
    });
  }

  // -------------------------------------------------------------------------
  // Rendering

  render(state: GameState, view: BoardView): void {
    this.state = state;
    this.renderLine(state, view);
    this.renderPiles(state, view);
    this.renderHand(state, view);
  }

  private renderLine(state: GameState, view: BoardView): void {
    const [a, b, c, d] = state.piles;
    state.piles.forEach((v, i) => {
      const m = this.marks[i];
      m.style.setProperty('--v', String(v));
      m.querySelector('span')!.textContent = String(v);
      m.hidden = v === PILES[i].start;
    });
    // When twins sit close together, push the second label out so both read.
    this.marks[1].dataset.stagger = String(Math.abs(a - b) < 9 && a !== 1 && b !== 1);
    this.marks[3].dataset.stagger = String(Math.abs(c - d) < 9 && c !== 100 && d !== 100);

    const lo = Math.max(a, b);
    const hi = Math.min(c, d);
    this.els.lineOpen.style.setProperty('--lo', String(lo));
    this.els.lineOpen.style.setProperty('--hi', String(hi));
    this.els.line.dataset.crossed = String(lo >= hi);

    if (view.selected !== null) {
      this.ghost.hidden = false;
      this.ghost.style.setProperty('--v', String(view.selected));
    } else {
      this.ghost.hidden = true;
    }
  }

  private renderPiles(state: GameState, view: BoardView): void {
    const targets = view.selected !== null && view.hints ? playablePiles(state, view.selected) : [];
    this.piles.forEach((pile, i) => {
      const v = state.piles[i];
      const card = pile.querySelector<HTMLElement>('.card')!;
      paint(card, v);
      card.querySelector('.card__num')!.textContent = String(v);
      pile.dataset.fresh = String(v === PILES[i].start);
      const target = targets.includes(i);
      pile.classList.toggle('is-target', target);
      pile.classList.toggle('is-trick', target && isTrick(view.selected!, i, state.piles));
      pile.setAttribute(
        'aria-label',
        `${PILES[i].dir === 'up' ? 'Climbing' : 'Falling'} pile from ${PILES[i].start}, showing ${v}`,
      );
    });
  }

  private renderHand(state: GameState, view: BoardView): void {
    const hand = this.els.hand;
    hand.dataset.hints = String(view.hints);

    // FLIP: remember where surviving cards were before re-ordering.
    const before = new Map<number, DOMRect>();
    this.handCards.forEach((el, v) => before.set(v, el.getBoundingClientRect()));

    for (const [v, el] of this.handCards) {
      if (!state.hand.includes(v)) {
        el.remove();
        this.handCards.delete(v);
      }
    }

    const n = state.hand.length;
    let dealIndex = 0;
    state.hand.forEach((v, i) => {
      let el = this.handCards.get(v);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'card';
        el.dataset.card = String(v);
        paint(el, v);
        el.innerHTML = cardMarkup(v);
        this.handCards.set(v, el);
        if (view.dealt.has(v)) {
          el.classList.add('is-dealt');
          el.style.setProperty('--i', String(dealIndex++));
          el.addEventListener('animationend', () => el!.classList.remove('is-dealt'), { once: true });
        }
      }
      // Only move nodes that are out of place: moving a node drops its pointer capture.
      const at = hand.children[i];
      if (at !== el) hand.insertBefore(el, at ?? null);
      const off = i - (n - 1) / 2;
      el.style.setProperty('--tilt', (off * 2.4).toFixed(2));
      el.style.setProperty('--arc', (off * off * 1.8).toFixed(2));
      el.classList.toggle('is-selected', view.selected === v);
      el.classList.toggle('is-dead', playablePiles(state, v).length === 0);
      el.setAttribute('aria-pressed', String(view.selected === v));
      el.setAttribute('aria-label', `Card ${v}`);
    });

    hand.querySelector('.hand__empty')?.remove();
    if (n === 0) {
      hand.insertAdjacentHTML('beforeend', '<p class="hand__empty">Hand empty</p>');
    }

    if (reduceMotion.matches) return;
    for (const [v, el] of this.handCards) {
      const prev = before.get(v);
      if (!prev) continue;
      const now = el.getBoundingClientRect();
      const dx = prev.left - now.left;
      const dy = prev.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], {
        duration: 320,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      });
    }
  }

  // -------------------------------------------------------------------------
  // Effects

  rectOf(card: number): DOMRect | null {
    return this.handCards.get(card)?.getBoundingClientRect() ?? null;
  }

  /** Fly a card from a screen rect onto a pile, then reveal the pile's new top. */
  fly(card: number, pile: number, from: DOMRect, trick: boolean): Promise<void> {
    const pileEl = this.piles[pile];
    const target = pileEl.querySelector<HTMLElement>('.card')!;
    const to = target.getBoundingClientRect();

    const done = () => {
      target.style.visibility = '';
      pileEl.classList.remove('is-landed');
      void pileEl.offsetWidth;
      pileEl.classList.add('is-landed');
      if (trick) this.burst(pile);
    };

    if (reduceMotion.matches) {
      done();
      return Promise.resolve();
    }

    const clone = this.makeFloating(card, from);
    target.style.visibility = 'hidden';
    const sx = to.width / from.width;
    const anim = clone.animate(
      [
        { transform: `translate(${from.left}px, ${from.top}px) scale(1)` },
        { transform: `translate(${to.left}px, ${to.top}px) scale(${sx})` },
      ],
      { duration: 260, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' },
    );
    return anim.finished.then(() => {
      clone.remove();
      done();
    });
  }

  bad(pile: number): void {
    const el = this.piles[pile];
    el.classList.remove('is-bad');
    void el.offsetWidth;
    el.classList.add('is-bad');
    el.addEventListener('animationend', () => el.classList.remove('is-bad'), { once: true });
  }

  private burst(pile: number): void {
    const b = document.createElement('span');
    b.className = 'burst';
    b.textContent = '10 back';
    this.piles[pile].querySelector('.pile__slot')!.append(b);
    b.addEventListener('animationend', () => b.remove(), { once: true });
  }

  private makeFloating(card: number, rect: DOMRect): HTMLElement {
    const clone = document.createElement('div');
    clone.className = 'card';
    paint(clone, card);
    clone.style.width = `${rect.width}px`;
    clone.style.setProperty('--w', `${rect.width}px`);
    clone.style.transformOrigin = '0 0';
    clone.innerHTML = cardMarkup(card);
    // Match the hand's numeral size exactly.
    const src = this.handCards.get(card)?.querySelector<HTMLElement>('.card__num');
    if (src) clone.querySelector<HTMLElement>('.card__num')!.style.fontSize = getComputedStyle(src).fontSize;
    clone.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    if (rect.height) clone.style.height = `${rect.height}px`;
    clone.style.aspectRatio = 'auto';
    this.els.dragLayer.append(clone);
    return clone;
  }

  // -------------------------------------------------------------------------
  // Pointer input: a press that moves becomes a drag, otherwise it is a tap.

  private pointerDown(e: PointerEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('.card[data-card]');
    if (!el || e.button !== 0 || this.state.status !== 'playing') return;
    const card = Number(el.dataset.card);
    const start = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);

    // Listen on window rather than the card, so the gesture survives re-renders.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!this.dragging) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        this.beginDrag(card, el, rect, start);
      }
      this.moveDrag(ev);
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      stop();
      if (this.dragging) this.endDrag();
      else this.on.tapCard(card);
    };

    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      stop();
      if (this.dragging) this.snapBack();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  private beginDrag(card: number, el: HTMLElement, rect: DOMRect, start: { x: number; y: number }): void {
    const clone = this.makeFloating(card, rect);
    clone.style.transition = 'scale 0.18s cubic-bezier(0.16, 1, 0.3, 1)';
    requestAnimationFrame(() => (clone.style.scale = '1.08'));
    el.classList.add('is-lifted');
    this.dragging = { card, el, clone, dx: start.x - rect.left, dy: start.y - rect.top, over: null };
    this.on.dragStart(card);
  }

  private moveDrag(ev: PointerEvent): void {
    const d = this.dragging!;
    const x = ev.clientX - d.dx;
    const y = ev.clientY - d.dy;
    // Tilt slightly with horizontal motion for a bit of physicality.
    d.clone.style.transform = `translate(${x}px, ${y}px) rotate(${Math.max(-8, Math.min(8, ev.movementX * 0.6))}deg)`;

    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.pile');
    const over = hit ? Number(hit.dataset.pile) : null;
    if (over !== d.over) {
      if (d.over !== null) this.piles[d.over].classList.remove('is-over');
      if (over !== null && canPlay(d.card, over, this.state.piles)) this.piles[over].classList.add('is-over');
      d.over = over;
    }
  }

  private endDrag(): void {
    const d = this.dragging!;
    this.dragging = null;
    this.piles.forEach((p) => p.classList.remove('is-over'));
    const from = d.clone.getBoundingClientRect();

    if (d.over !== null && this.on.dropCard(d.card, d.over, from)) {
      d.clone.remove();
      return;
    }
    if (d.over !== null) this.bad(d.over);
    this.snapBack(d);
  }

  private snapBack(d = this.dragging): void {
    if (!d) return;
    this.dragging = null;
    this.piles.forEach((p) => p.classList.remove('is-over'));
    const to = d.el.getBoundingClientRect();
    const from = d.clone.getBoundingClientRect();
    const anim = d.clone.animate(
      [
        { transform: `translate(${from.left}px, ${from.top}px)` },
        { transform: `translate(${to.left}px, ${to.top}px)` },
      ],
      { duration: reduceMotion.matches ? 0 : 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
    d.clone.style.scale = '1';
    anim.finished.then(() => {
      d.clone.remove();
      d.el.classList.remove('is-lifted');
    });
  }
}
