import { PLAY } from '../config/game';
import { load, save, todayKey } from './storage';

interface PlaysState {
  date: string;
  remaining: number;
  max: number;
}

const KEY = 'plays';

function read(): PlaysState {
  const today = todayKey();
  const cur = load<PlaysState | null>(KEY, null);
  if (!cur || cur.date !== today) {
    const fresh: PlaysState = { date: today, remaining: PLAY.dailyFreePlays, max: PLAY.dailyFreePlays };
    save(KEY, fresh);
    return fresh;
  }
  return cur;
}

export const plays = {
  get(): PlaysState {
    return read();
  },
  consume(): boolean {
    const s = read();
    if (s.remaining <= 0) return false;
    s.remaining -= 1;
    save(KEY, s);
    return true;
  },
  /** 보너스(미션/레퍼럴 보상)로 추가 — UI 노출용. 백엔드 도입 전 mock. */
  grant(n: number): void {
    const s = read();
    s.remaining += n;
    s.max = Math.max(s.max, s.remaining);
    save(KEY, s);
  },
  /** 테스트용 — 잔여 횟수를 max 까지 채움. (운영 빌드에서는 제거 또는 어드민 제한) */
  refill(): void {
    const s = read();
    s.remaining = Math.max(s.remaining, s.max);
    save(KEY, s);
  },
};
