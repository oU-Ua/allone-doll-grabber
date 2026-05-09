import { ACHIEVEMENTS, type AchievementId } from '../config/achievements';
import { DOLLS } from '../config/dolls';
import { collection } from './collection';
import { streak } from './streak';
import { tickets } from './tickets';
import { load, save } from './storage';

interface State {
  unlocked: Record<AchievementId, number | undefined>; // unlock timestamp
  themesUsed: string[];
}

const KEY = 'achievements';

function read(): State {
  const cur = load<State>(KEY, { unlocked: {} as any, themesUsed: [] });
  if (!cur.themesUsed) cur.themesUsed = [];
  if (!cur.unlocked) cur.unlocked = {} as any;
  return cur;
}

export const achievements = {
  list(): { id: AchievementId; unlockedAt?: number }[] {
    const s = read();
    return ACHIEVEMENTS.map((a) => ({ id: a.id, unlockedAt: s.unlocked[a.id] }));
  },
  isUnlocked(id: AchievementId): boolean {
    return !!read().unlocked[id];
  },
  /** 테마 사용 기록 (자동 성취 트리거) */
  markThemeUsed(themeId: string): void {
    const s = read();
    if (!s.themesUsed.includes(themeId)) s.themesUsed.push(themeId);
    save(KEY, s);
  },
  /** 게임 상태 기반 자동 감지. 새로 잠금 해제된 성취 목록 반환. */
  detect(): AchievementId[] {
    const s = read();
    const newly: AchievementId[] = [];
    const owned = collection.getAll();
    const ownedDolls = DOLLS.filter((d) => (owned[d.id] ?? 0) > 0);
    const rarities = new Set(ownedDolls.map((d) => d.rarity));

    const unlock = (id: AchievementId, cond: boolean) => {
      if (cond && !s.unlocked[id]) {
        s.unlocked[id] = Date.now();
        newly.push(id);
      }
    };

    unlock('first-doll', ownedDolls.length >= 1);
    unlock('first-hr', rarities.has('HR'));
    unlock('streak-5', streak.get() >= 5);
    unlock('all-rarities', rarities.has('N') && rarities.has('R') && rarities.has('SR') && rarities.has('HR'));
    unlock('tenfold-collector', ownedDolls.length >= 10);
    unlock('all-themes', s.themesUsed.length >= 4);

    // 컬렉션 카테고리 완성 — collection의 cleared 키 갯수 사용
    const cleared = load<string[]>('collection-completions', []);
    unlock('first-collection', cleared.length >= 1);

    // 응모권 당첨 1개 이상
    unlock('lucky-prize', tickets.list().some((t) => t.status === 'won'));

    if (newly.length) save(KEY, s);
    return newly;
  },
  unlockedCount(): number {
    return Object.values(read().unlocked).filter(Boolean).length;
  },
};
