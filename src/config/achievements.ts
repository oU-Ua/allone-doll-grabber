/**
 * 명세 §3.2.4 — 성취 배지 정의.
 * 게임 진행 중 자동 감지 (collection / streak / theme 사용 여부 기반).
 */

export type AchievementId =
  | 'first-doll'
  | 'first-collection'
  | 'streak-5'
  | 'all-rarities'
  | 'all-themes'
  | 'first-hr'
  | 'tenfold-collector'
  | 'lucky-prize';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  emoji: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-doll',       title: '첫 인형 GET!',     description: '인형을 하나 잡았어요',                   emoji: '🎉' },
  { id: 'first-hr',         title: '하이퍼 레어!',     description: 'HR 등급 카드를 처음 획득',              emoji: '✨' },
  { id: 'streak-5',         title: '5연속 성공',       description: '연속으로 5번 성공',                      emoji: '🔥' },
  { id: 'all-rarities',     title: '등급 컬렉터',      description: 'N/R/SR/HR 등급을 모두 1장 이상 보유',   emoji: '🏆' },
  { id: 'first-collection', title: '컬렉션 마스터',    description: '카테고리 컬렉션 하나 완성',             emoji: '📚' },
  { id: 'all-themes',       title: '테마 탐험가',      description: '4가지 테마를 모두 사용해봄',            emoji: '🌈' },
  { id: 'tenfold-collector',title: '10종 컬렉터',     description: '서로 다른 인형 10종 보유',              emoji: '💎' },
  { id: 'lucky-prize',      title: '럭키 응모',        description: '응모권 추첨에서 첫 당첨',                emoji: '🍀' },
];
