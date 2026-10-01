/**
 * Seeded, serialisable PRNG (mulberry32). The whole generator state is a single
 * 32-bit integer, so it can live inside the saved game and a reloaded game keeps
 * drawing exactly the same cards it would have drawn before the reload.
 */

/** Hash an arbitrary string seed into a 32-bit starting state (FNV-1a). */
export function seedFromString(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Advance the state. Returns the next state and a float in [0, 1). */
export function next(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** A tiny mutable wrapper for code that draws several numbers in a row. */
export class Rng {
  constructor(public state: number) {}

  float(): number {
    const [s, f] = next(this.state);
    this.state = s;
    return f;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.float() * maxExclusive);
  }

  shuffle<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Short human-friendly seed, e.g. "K7Q2-M9XD". */
export function randomSeed(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Seed for the daily deal: the same deal for everyone on a given calendar day. */
export function dailySeed(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `DAILY-${y}-${m}-${d}`;
}
