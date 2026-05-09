/**
 * 게임 전역 튜닝 파라미터.
 * 명세서 §1.3, §5.4 의 "동적 난이도 / 미정" 항목을 한 곳에서 조정할 수 있게 모았습니다.
 * 향후 백엔드 원격 설정(remote config)으로 옮기기 쉽도록 객체 단위로 관리합니다.
 */

export const CABINET = {
  /** 인형이 굴러다니는 내부 바닥 한 변의 절반. 내부 가로/세로는 2 * inner 입니다. */
  innerHalf: 1.0,
  /** 내부 높이 (바닥 ~ 천장 사이) */
  innerHeight: 1.5,
  /** 유리 벽 두께 */
  wallThickness: 0.04,
  /** 상품 배출구(chute) 위치 - 캐비닛 내부 좌표계, x/z 절댓값 < innerHalf */
  chute: { x: -0.7, z: 0.7, radius: 0.22 },
};

export const CRANE = {
  /** 크레인 헤드 이동 한계. 캐비닛 내부보다 살짝 작게 잡아 벽 충돌 방지 */
  xRange: CABINET.innerHalf - 0.18,
  zRange: CABINET.innerHalf - 0.18,
  /** 크레인이 대기하는 y 좌표 (캐비닛 바닥 기준) */
  topY: CABINET.innerHeight - 0.15,
  /**
   * 잡기 시 내려가는 최저 y (헤드 hub 기준).
   * hub 에서 finger 끝(닫힌 상태) 까지 거리가 clawReach 이므로
   * bottomY ≥ clawReach 여야 fingers 가 바닥을 뚫지 않음.
   */
  bottomY: 0.46,
  /** Hub 중심에서 finger 끝(닫힌 상태)까지의 수직 거리 — 모션/배치 계산에 사용 */
  clawReach: 0.40,
  /** 마우스/터치 드래그 → 크레인 이동 비율. 1px 이동당 월드 유닛 */
  dragSensitivity: 0.0035,
  /** 크레인 부드러움 (lerp factor per frame at 60fps) */
  smoothing: 0.18,

  // ── 잡기 시퀀스 타이밍 (초 단위)
  descendTime: 0.9,   // 내려가는 시간
  closeTime: 0.35,    // 집게 닫는 시간
  ascendTime: 0.9,    // 올라가는 시간
  travelTime: 1.0,    // chute 까지 이동 시간
  releaseTime: 0.4,   // 집게 열고 인형 떨어지는 시간
};

export const PHYSICS = {
  gravity: -9.8,
  /** cannon-es 시뮬레이션 fixed timestep */
  timeStep: 1 / 60,
  /** 물리 마찰. 값이 크면 인형이 잘 안 굴러감 */
  friction: 0.45,
  /** 인형 반발 계수 (0~1, 클수록 통통 튐) */
  restitution: 0.05,
};

/**
 * 명세 §1.3 / §5.4 — 잡기 성공 / 떨어뜨림 확률.
 * 운영용으로 변경 가능한 단일 출처(single source of truth)로 관리합니다.
 */
export const SUCCESS = {
  /**
   * 잡기 가능 반경 (xz 평면, 단위 = 월드 유닛).
   * 집게 중심에서 이 반경 안에 인형 중심이 없으면 무조건 실패.
   * 인형 한 변의 절반(약 0.18) + 약간의 여유 정도로 설정.
   */
  gripRadius: 0.22,
  /** 인형이 그립 반경 정중앙(d≈0) 일 때 성공률 */
  baseGrabRate: 0.82,
  /** 그립 반경 가장자리에 가까울수록 성공률에서 차감되는 최대치 */
  edgeFalloff: 0.5,
  /** 인형 무게 페널티: mass=1 기준 보다 무거운 만큼 비례 차감 */
  massPenaltyPerKg: 0.1,
  /** §5.4 — 잡고 올라오는 도중 확률적으로 떨어뜨림 */
  midAirDropRate: 0.15,
  /** §1.3.3 — 연속 성공 시 난이도 상향: 3연속부터 -5% per win, 최대 -20% */
  streakPenaltyStart: 3,
  streakPenaltyPerWin: 0.05,
  streakPenaltyMax: 0.2,
};

/**
 * D-pad 조작 파라미터.
 * speedPerSec — 누르고 있을 때 초당 이동 거리(월드 유닛).
 * tickRate — 호출 주기(Hz). speedPerSec / tickRate 가 매 tick 의 이동량.
 */
export const DPAD = {
  speedPerSec: 1.6,
  tickRate: 60,
};

/**
 * 난이도 프리셋 — §1.3.1 자동 난이도 조정.
 * SUCCESS 의 일부 값을 곱하기/덮어쓰기 방식으로 조정합니다.
 */
export type DifficultyPreset = {
  label: string;
  /** SUCCESS.gripRadius 곱 (Easy → 더 큰 그립) */
  gripRadiusMul: number;
  /** SUCCESS.baseGrabRate 덮어쓰기 */
  baseGrabRate: number;
  /** SUCCESS.edgeFalloff 곱 */
  edgeFalloffMul: number;
  /** SUCCESS.midAirDropRate 덮어쓰기 */
  midAirDropRate: number;
};

export const DIFFICULTIES: Record<'easy' | 'normal' | 'hard', DifficultyPreset> = {
  easy:   { label: '쉬움',  gripRadiusMul: 1.35, baseGrabRate: 0.92, edgeFalloffMul: 0.6, midAirDropRate: 0.05 },
  normal: { label: '보통',  gripRadiusMul: 1.0,  baseGrabRate: 0.82, edgeFalloffMul: 1.0, midAirDropRate: 0.15 },
  hard:   { label: '어려움', gripRadiusMul: 0.85, baseGrabRate: 0.7,  edgeFalloffMul: 1.3, midAirDropRate: 0.25 },
};

/** 난이도 프리셋을 SUCCESS 에 적용. Crane / Reticle 이 즉시 새 값을 사용. */
export const SUCCESS_BASE = { ...SUCCESS };
export function applyDifficulty(d: 'easy' | 'normal' | 'hard'): void {
  const p = DIFFICULTIES[d];
  SUCCESS.gripRadius = SUCCESS_BASE.gripRadius * p.gripRadiusMul;
  SUCCESS.baseGrabRate = p.baseGrabRate;
  SUCCESS.edgeFalloff = SUCCESS_BASE.edgeFalloff * p.edgeFalloffMul;
  SUCCESS.midAirDropRate = p.midAirDropRate;
}

/**
 * 배경 테마 — §1.1.2 테마별 배경 환경.
 * 별도 3D 에셋 없이 라이팅/배경/포그/캐비닛 색상으로 변형합니다.
 */
export type ThemePreset = {
  label: string;
  emoji: string;
  background: number;       // scene background hex
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  keyColor: number;         // 메인 디렉셔널 라이트 색
  fillColor: number;        // 보조 라이트
  rimColor: number;         // 림 포인트 라이트
  frame: number;            // 캐비닛 프레임 색
  glassTint: number;        // 유리 색조
  stage: number;            // 무대 바닥 색
};

export const THEMES: Record<'candy' | 'starry' | 'mint' | 'lavender', ThemePreset> = {
  // 기본 — 옅은 핑크 배경 + 노란 캐비닛 (BT21 톤)
  candy: {
    label: '캔디 팝',
    emoji: '🍬',
    background: 0xffd6e3,
    fogNear: 10, fogFar: 22,
    hemiSky: 0xffe5f0, hemiGround: 0xffc0cb,
    keyColor: 0xfff4d6, fillColor: 0xffb6c8, rimColor: 0xff7eb6,
    frame: 0xffd23f, glassTint: 0xffe8f0, stage: 0xffc0cf,
  },
  // 별밤 — 짙은 네이비 + 핑크 캐비닛 (Kirby 톤)
  starry: {
    label: '별밤 픽셀',
    emoji: '🌌',
    background: 0x1a1a3e,
    fogNear: 8, fogFar: 20,
    hemiSky: 0x8888c8, hemiGround: 0x121230,
    keyColor: 0xffe7f5, fillColor: 0x6aa6ff, rimColor: 0xff7eb6,
    frame: 0xff7eb6, glassTint: 0xc4a3ff, stage: 0x222252,
  },
  // 민트 라떼
  mint: {
    label: '민트 크림',
    emoji: '🍵',
    background: 0xd6fbe4,
    fogNear: 10, fogFar: 22,
    hemiSky: 0xeafff4, hemiGround: 0xb0e6c4,
    keyColor: 0xfff0d0, fillColor: 0x88e0bd, rimColor: 0x6affc8,
    frame: 0xff7eb6, glassTint: 0xdcfff0, stage: 0xb8e8c8,
  },
  // 라벤더 드림
  lavender: {
    label: '라벤더 드림',
    emoji: '💜',
    background: 0xe8d6ff,
    fogNear: 10, fogFar: 22,
    hemiSky: 0xf0e0ff, hemiGround: 0xc4a3ff,
    keyColor: 0xfff0e0, fillColor: 0xc4a3ff, rimColor: 0xffd23f,
    frame: 0xc4a3ff, glassTint: 0xf0e8ff, stage: 0xd0b8ff,
  },
};

export const PLAY = {
  /** §4.1.1 — 일일 무료 플레이 횟수 */
  dailyFreePlays: 3,
};

export const REWARD = {
  /** §2.1.1 — 보상 선택 제한 시간 (초) */
  selectTimeoutSec: 30,
  /** 임의의 포인트 적립 범위 (백엔드 연동 전 mock) */
  pointsMin: 50,
  pointsMax: 500,
};

export const CAMERA = {
  /** 사전 설정 뷰 — Three.js 좌표계 (인형뽑기 기계 중심을 원점으로) */
  presets: {
    front:    { pos: [0, 1.4, 3.2],    look: [0, 0.8, 0] },
    side:     { pos: [3.2, 1.4, 0.2],  look: [0, 0.8, 0] },
    top:      { pos: [0, 3.6, 0.001],  look: [0, 0.5, 0] },
    diagonal: { pos: [2.4, 2.0, 2.4],  look: [0, 0.7, 0] },
  } as Record<string, { pos: [number, number, number]; look: [number, number, number] }>,
  /** 자동 회전 속도 (rad/sec) */
  autoRotateSpeed: 0.18,
  /** 부드러운 보간 계수 */
  smoothing: 0.12,
};
