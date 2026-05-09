/**
 * 명세 §4.2.1 — 미션 정의 (5종 이상).
 * 백엔드 트래킹 전까지는 mock — UI에서 "완료" 버튼으로 바로 체크 가능.
 */

export type MissionTrigger =
  | 'app-open'
  | 'product-view'
  | 'asset-page'
  | 'play-once'
  | 'transfer'
  | 'savings-view';

export interface MissionDef {
  id: MissionTrigger;
  title: string;
  description: string;
  emoji: string;
  reward: number; // 추가 플레이 횟수
  goal: number;
  /** UI에서 수동으로 체크 완료 가능 (백엔드 미연동) */
  manualComplete: boolean;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'app-open',
    title: '올원뱅크 앱 출석',
    description: '올원뱅크 앱을 한 번 열어보세요',
    emoji: '📱',
    reward: 1,
    goal: 1,
    manualComplete: true,
  },
  {
    id: 'product-view',
    title: '금융 상품 둘러보기',
    description: '예적금/대출/카드 중 1개 상품 페이지를 확인하세요',
    emoji: '💳',
    reward: 1,
    goal: 1,
    manualComplete: true,
  },
  {
    id: 'asset-page',
    title: '자산 관리 방문',
    description: '내 자산 페이지를 한 번 들러보세요',
    emoji: '💰',
    reward: 1,
    goal: 1,
    manualComplete: true,
  },
  {
    id: 'savings-view',
    title: '적금 상품 비교',
    description: '적금 상품 1개 이상 비교해보세요',
    emoji: '🏦',
    reward: 2,
    goal: 1,
    manualComplete: true,
  },
  {
    id: 'transfer',
    title: '간편 이체 1회',
    description: '올원뱅크에서 1회 이체해보세요',
    emoji: '💸',
    reward: 2,
    goal: 1,
    manualComplete: true,
  },
  {
    id: 'play-once',
    title: '오늘의 첫 플레이',
    description: '오늘 인형뽑기를 한 번 시도해보세요',
    emoji: '🎯',
    reward: 1,
    goal: 1,
    manualComplete: false, // 게임에서 자동 진행
  },
];
