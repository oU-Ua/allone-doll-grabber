import { DOLLS, type Category } from '../config/dolls';
import { load, save } from './storage';

const KEY_OWNED = 'collection';
const KEY_COMPLETIONS = 'collection-completions';

type OwnedMap = Record<string, number>;

export const collection = {
  getAll(): OwnedMap {
    return load<OwnedMap>(KEY_OWNED, {});
  },
  getCount(dollId: string): number {
    return this.getAll()[dollId] ?? 0;
  },
  has(dollId: string): boolean {
    return this.getCount(dollId) > 0;
  },
  /** 인형 획득. 신규 등록인지(true) 중복인지(false) 반환 */
  add(dollId: string): { isNew: boolean; total: number } {
    const map = this.getAll();
    const before = map[dollId] ?? 0;
    map[dollId] = before + 1;
    save(KEY_OWNED, map);
    return { isNew: before === 0, total: map[dollId] };
  },
  /** 카테고리별 완성 여부 (해당 카테고리의 모든 인형 보유) */
  isCategoryComplete(cat: Category): boolean {
    const map = this.getAll();
    const target = DOLLS.filter((d) => d.category === cat);
    if (target.length === 0) return false;
    return target.every((d) => (map[d.id] ?? 0) > 0);
  },
  /**
   * 컬렉션 완성을 감지하고, 이번에 새로 완성된 카테고리 목록을 반환.
   * (이미 완성 처리한 카테고리는 제외)
   */
  detectNewCompletions(): Category[] {
    const cleared = load<Category[]>(KEY_COMPLETIONS, []);
    const newly: Category[] = [];
    const cats: Category[] = ['season', 'fashion', 'fantasy', 'daily'];
    for (const c of cats) {
      if (!cleared.includes(c) && this.isCategoryComplete(c)) {
        cleared.push(c);
        newly.push(c);
      }
    }
    if (newly.length) save(KEY_COMPLETIONS, cleared);
    return newly;
  },
  totalProgress(): { owned: number; total: number } {
    const map = this.getAll();
    const owned = DOLLS.filter((d) => (map[d.id] ?? 0) > 0).length;
    return { owned, total: DOLLS.length };
  },
};
