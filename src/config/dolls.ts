import farmerUrl from '../../glb/Meshy_AI_Farmer_with_Arms_Outs_0506122325_texture.glb?url';
import lambUrl from '../../glb/Meshy_AI_Pink_Hooded_Lamb_0506122337_texture.glb?url';

export type Rarity = 'N' | 'R' | 'SR' | 'HR';
export type Category = 'season' | 'fashion' | 'fantasy' | 'daily';

export interface DollDef {
  /** 안정적인 식별자. 컬렉션 저장에 사용되므로 변경하지 마세요. */
  id: string;
  /** UI 표시명 */
  name: string;
  /** 카드 썸네일에 표시할 이모지 (GLB 썸네일 추가 전까지 fallback) */
  emoji: string;
  /** GLB 모델 URL. 없으면 색상 프리미티브로 폴백 */
  modelUrl?: string;
  /** 모델 로드 후 자동 보정용 스케일. 모델별로 다르므로 미세 조정 가능 */
  scale: number;
  /** 모델이 발 기준이 아닐 때 y축 오프셋(메시 중심을 위로 올리는 양) */
  yOffset?: number;
  /** 폴백 프리미티브 색상 (modelUrl 없을 때만 사용) */
  fallbackColor?: number;
  /** 카드 등급 */
  rarity: Rarity;
  /** 컬렉션 카테고리 */
  category: Category;
  /** 스폰 가중치 (높을수록 자주 나옴) */
  spawnWeight: number;
  /** 시뮬레이션용 대략적인 충돌 박스 (반경, 단위 = 월드 유닛) */
  bodyHalfExtents: { x: number; y: number; z: number };
  /** 물리 질량(kg). 무거우면 잡기 실패율 ↑ */
  mass: number;
}

/**
 * 등록된 인형 목록.
 *
 * GLB를 교체하려면:
 *  1. /glb 폴더에 새 파일을 추가합니다.
 *  2. 상단 import 문을 추가하거나 기존 import 의 경로만 바꿉니다.
 *  3. 아래 정의에서 modelUrl을 새 import 변수로 바꾸세요.
 *  4. 필요 시 scale / yOffset / bodyHalfExtents 만 미세 조정.
 *
 * id는 절대 바꾸지 마세요. (컬렉션 localStorage 데이터의 키이기 때문)
 */
export const DOLLS: DollDef[] = [
  {
    id: 'farmer',
    name: '올원 농부',
    emoji: '🧑‍🌾',
    modelUrl: farmerUrl,
    scale: 0.45,
    yOffset: 0,
    rarity: 'R',
    category: 'daily',
    spawnWeight: 3,
    bodyHalfExtents: { x: 0.18, y: 0.22, z: 0.18 },
    mass: 1.0,
  },
  {
    id: 'lamb',
    name: '핑크 후디 양',
    emoji: '🐑',
    modelUrl: lambUrl,
    scale: 0.45,
    yOffset: 0,
    rarity: 'SR',
    category: 'fashion',
    spawnWeight: 2,
    bodyHalfExtents: { x: 0.18, y: 0.2, z: 0.18 },
    mass: 0.85,
  },
  // ↓ GLB 추가 전까지는 프리미티브로 표시 (modelUrl을 추가하면 자동으로 GLB 사용)
  {
    id: 'cube_yellow',
    name: '올원 큐브',
    emoji: '🟨',
    fallbackColor: 0xffd23f,
    scale: 0.5,
    rarity: 'N',
    category: 'daily',
    spawnWeight: 4,
    bodyHalfExtents: { x: 0.16, y: 0.16, z: 0.16 },
    mass: 0.7,
  },
  {
    id: 'star_pink',
    name: '핑크 스타',
    emoji: '⭐',
    fallbackColor: 0xff5fa2,
    scale: 0.5,
    rarity: 'R',
    category: 'season',
    spawnWeight: 2,
    bodyHalfExtents: { x: 0.18, y: 0.18, z: 0.18 },
    mass: 0.8,
  },
  {
    id: 'gem_legend',
    name: '전설의 보석',
    emoji: '💎',
    fallbackColor: 0x6affff,
    scale: 0.5,
    rarity: 'HR',
    category: 'fantasy',
    spawnWeight: 1,
    bodyHalfExtents: { x: 0.18, y: 0.22, z: 0.18 },
    mass: 1.1,
  },
];

export const DOLL_BY_ID: Record<string, DollDef> = Object.fromEntries(
  DOLLS.map((d) => [d.id, d]),
);

export const RARITY_LABEL: Record<Rarity, string> = {
  N: '노말',
  R: '레어',
  SR: '슈퍼레어',
  HR: '하이퍼레어',
};

/** 가중 무작위로 인형 N개를 뽑아 cabinet 안에 배치할 인형 목록을 반환 */
export function rollSpawnList(count: number): DollDef[] {
  const totalWeight = DOLLS.reduce((s, d) => s + d.spawnWeight, 0);
  const result: DollDef[] = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalWeight;
    for (const d of DOLLS) {
      r -= d.spawnWeight;
      if (r <= 0) {
        result.push(d);
        break;
      }
    }
  }
  return result;
}
