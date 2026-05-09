import { load, save } from './storage';

const KEY = 'streak';

export const streak = {
  get(): number {
    return load<number>(KEY, 0);
  },
  win(): number {
    const n = this.get() + 1;
    save(KEY, n);
    return n;
  },
  reset(): void {
    save(KEY, 0);
  },
};
