import { load, save } from './storage';

interface AuthState {
  linked: boolean;
  name?: string;
  linkedAt?: number;
  /** 비인증 상태에서 적립된 임시 보상 */
  pendingPoints: number;
  pendingTickets: number;
}

const KEY = 'auth';
const DEFAULT: AuthState = { linked: false, pendingPoints: 0, pendingTickets: 0 };

function read(): AuthState {
  return { ...DEFAULT, ...load<Partial<AuthState>>(KEY, {}) };
}
function write(s: AuthState): void {
  save(KEY, s);
}

/**
 * 명세 §2.2 — 올원뱅크 앱 연동 mock.
 * OAuth/딥링크는 실제로 동작하지 않고, 인증 상태만 시뮬레이션합니다.
 * 백엔드 도입 시 이 모듈만 OAuth 어댑터로 교체하면 됩니다.
 */
export const auth = {
  state(): AuthState {
    return read();
  },
  isLinked(): boolean {
    return read().linked;
  },
  link(name = '올원 회원'): AuthState {
    const s = read();
    s.linked = true;
    s.name = name;
    s.linkedAt = Date.now();
    write(s);
    return s;
  },
  unlink(): void {
    write({ ...DEFAULT });
  },
  /** 비인증 상태에서 보상 발생 시 임시 저장 (§2.2.3) */
  stashReward(kind: 'points' | 'ticket', amount: number): void {
    const s = read();
    if (kind === 'points') s.pendingPoints += amount;
    else s.pendingTickets += amount;
    write(s);
  },
  /** 인증 후 임시 보상 적립 처리 — 적립된 양 반환 후 0으로 리셋 */
  flushStashed(): { points: number; tickets: number } {
    const s = read();
    const r = { points: s.pendingPoints, tickets: s.pendingTickets };
    s.pendingPoints = 0;
    s.pendingTickets = 0;
    write(s);
    return r;
  },
};
