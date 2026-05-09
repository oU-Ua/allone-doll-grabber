import { MISSIONS, type MissionTrigger } from '../config/missions';
import { load, save, todayKey } from './storage';

interface MissionState {
  date: string;
  progress: Record<MissionTrigger, number>;
  claimed: Record<MissionTrigger, boolean>;
}

const KEY = 'missions';

function read(): MissionState {
  const today = todayKey();
  const cur = load<MissionState | null>(KEY, null);
  if (!cur || cur.date !== today) {
    const fresh: MissionState = {
      date: today,
      progress: blank(),
      claimed: blank(true),
    };
    save(KEY, fresh);
    return fresh;
  }
  // 새로 추가된 mission id 가 있으면 빈 값으로 채움
  for (const m of MISSIONS) {
    if (cur.progress[m.id] == null) cur.progress[m.id] = 0;
    if (cur.claimed[m.id] == null) cur.claimed[m.id] = false as any;
  }
  return cur;
}
function blank(boolean = false): any {
  const o: any = {};
  for (const m of MISSIONS) o[m.id] = boolean ? false : 0;
  return o;
}

export const missions = {
  state(): MissionState {
    return read();
  },
  bump(id: MissionTrigger, by = 1): void {
    const s = read();
    s.progress[id] = (s.progress[id] ?? 0) + by;
    save(KEY, s);
  },
  isReady(id: MissionTrigger): boolean {
    const def = MISSIONS.find((m) => m.id === id)!;
    const s = read();
    return !s.claimed[id] && (s.progress[id] ?? 0) >= def.goal;
  },
  isClaimed(id: MissionTrigger): boolean {
    return read().claimed[id] === true;
  },
  /** 보상 수령 (성공시 보상 횟수 반환) */
  claim(id: MissionTrigger): number | null {
    if (!this.isReady(id)) return null;
    const def = MISSIONS.find((m) => m.id === id)!;
    const s = read();
    s.claimed[id] = true;
    save(KEY, s);
    return def.reward;
  },
  /** UI에 표시할 종합 통계 */
  summary(): { ready: number; total: number; remaining: number } {
    const s = read();
    let ready = 0;
    let remaining = 0;
    for (const m of MISSIONS) {
      if (s.claimed[m.id]) continue;
      remaining += 1;
      if ((s.progress[m.id] ?? 0) >= m.goal) ready += 1;
    }
    return { ready, total: MISSIONS.length, remaining };
  },
};
