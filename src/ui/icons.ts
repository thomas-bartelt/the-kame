/** Phosphor icons (bold weight), inlined at build time. */
import arrowClockwise from '@phosphor-icons/core/assets/bold/arrow-clockwise-bold.svg?raw';
import arrowUUpLeft from '@phosphor-icons/core/assets/bold/arrow-u-up-left-bold.svg?raw';
import calendar from '@phosphor-icons/core/assets/bold/calendar-bold.svg?raw';
import caretDown from '@phosphor-icons/core/assets/bold/caret-down-bold.svg?raw';
import caretUp from '@phosphor-icons/core/assets/bold/caret-up-bold.svg?raw';
import lightbulb from '@phosphor-icons/core/assets/bold/lightbulb-bold.svg?raw';
import list from '@phosphor-icons/core/assets/bold/list-bold.svg?raw';
import shareNetwork from '@phosphor-icons/core/assets/bold/share-network-bold.svg?raw';
import x from '@phosphor-icons/core/assets/bold/x-bold.svg?raw';

const icons: Record<string, string> = {
  'arrow-clockwise': arrowClockwise,
  'arrow-u-up-left': arrowUUpLeft,
  calendar,
  'caret-down': caretDown,
  'caret-up': caretUp,
  lightbulb,
  list,
  'share-network': shareNetwork,
  x,
};

export function icon(name: string): string {
  return (icons[name] ?? '').replace('<svg', '<svg aria-hidden="true" fill="currentColor"');
}

/** Fill every `[data-icon]` element: icon first, existing label after. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!));
  });
}
