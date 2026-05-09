import { load, save } from './storage';
import { plays } from './plays';

const CODE_KEY = 'referral-code';
const STATS_KEY = 'referral-stats';

interface Stats {
  invitedCount: number;
}

function ensureCode(): string {
  let code = load<string | null>(CODE_KEY, null);
  if (!code) {
    code = 'USER' + Math.random().toString(36).slice(2, 7).toUpperCase();
    save(CODE_KEY, code);
  }
  return code;
}

export const referral = {
  myCode(): string {
    return ensureCode();
  },
  shareUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://game.allonebank.com';
    return `${origin}?ref=${this.myCode()}`;
  },
  invitedCount(): number {
    return load<Stats>(STATS_KEY, { invitedCount: 0 }).invitedCount;
  },
  /** mock — 실제 백엔드 인증 대신 즉시 친구 1명 인증 처리. 추천인에게 +3 기회 지급. */
  simulateValidatedInvite(): { invited: number; reward: number } {
    const s = load<Stats>(STATS_KEY, { invitedCount: 0 });
    s.invitedCount += 1;
    save(STATS_KEY, s);
    const reward = 3;
    plays.grant(reward);
    return { invited: s.invitedCount, reward };
  },
};
