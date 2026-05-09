import * as THREE from 'three';
import { CABINET, CRANE, SUCCESS } from '../config/game';
import type { DollInstance, DollManager } from './DollManager';
import { streak } from '../state/streak';

export type CraneState = 'idle' | 'descend' | 'close' | 'ascend' | 'travel' | 'release' | 'return';

export interface GrabResult {
  inst: DollInstance | null;
  success: boolean;
  /** 잡기 시도 시 그립 반경 안에 인형이 있었는지 */
  hadCandidate: boolean;
  /** 잡고 올라오다가 떨어뜨린 경우 true */
  midAirDrop?: boolean;
}

/**
 * 크레인(레일 + 헤드 + 집게).
 * - idle 상태에서는 사용자 입력으로 (x,z) 이동
 * - grab() 호출 시 비동기 시퀀스 진행 (descend → close → ascend → travel → release → return)
 */
export class Crane {
  readonly group = new THREE.Group();
  /** 사용자가 조준 중인 목표 (x,z). y는 시퀀스에 따라 변함 */
  readonly target = new THREE.Vector3(0, CRANE.topY, 0);
  /** 실제 크레인 헤드 위치 (smoothing 적용 후) */
  readonly head = new THREE.Vector3(0, CRANE.topY, 0);
  state: CraneState = 'idle';

  private headMesh!: THREE.Object3D;
  /** 각 finger 의 상단 segment(어깨에서 분기) */
  private fingerUpper: THREE.Group[] = [];
  /** 각 finger 의 하단 segment(끝부분, 인형 감쌈) */
  private fingerLower: THREE.Group[] = [];
  private cable!: THREE.Mesh;
  private railX!: THREE.Mesh;
  private railZ!: THREE.Mesh;
  private reticle!: THREE.Mesh;
  private reticleCenter!: THREE.Mesh;
  private reticleMat!: THREE.MeshBasicMaterial;
  private reticleCenterMat!: THREE.MeshBasicMaterial;

  /** 집게 닫힘 정도 0(열림) ~ 1(닫힘). 시각 표현용 */
  private clawClose = 0;

  constructor(private dolls: DollManager, private onStateChange?: (s: CraneState) => void) {
    this.build();
  }

  private build(): void {
    const inner = CABINET.innerHalf;
    const h = CABINET.innerHeight;

    // 상단 레일 X (앞뒤 방향으로 누운 봉)
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb0b6c4, metalness: 0.7, roughness: 0.3 });
    this.railX = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, inner * 2 - 0.05, 16), railMat);
    this.railX.rotation.z = Math.PI / 2;
    this.railX.position.y = h - 0.05;
    this.group.add(this.railX);

    // 슬라이딩 레일 Z (railX 위에서 좌우로 움직임)
    this.railZ = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, inner * 2 - 0.05, 16), railMat);
    this.railZ.rotation.x = Math.PI / 2;
    this.railZ.position.y = h - 0.1;
    this.group.add(this.railZ);

    // 케이블 (얇은 실린더, 길이는 매 프레임 갱신)
    this.cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1d2e }),
    );
    this.group.add(this.cable);

    // 크레인 헤드 (hub) + 2-마디 클로
    const headGroup = new THREE.Group();

    // 핑크 메탈 hub — 위가 좁고 아래가 살짝 넓은 사다리꼴
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.115, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0xff5fa2, metalness: 0.7, roughness: 0.3, emissive: 0x331122 }),
    );
    hub.castShadow = true;
    headGroup.add(hub);

    // 케이블 어댑터 — hub 위쪽 노란 노브
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3, emissive: 0x332200 }),
    );
    knob.position.y = 0.085;
    headGroup.add(knob);

    // hub 아래쪽 회전축 디스크 (집게 베이스)
    const baseDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.085, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0x9ba0ad, metalness: 0.85, roughness: 0.3 }),
    );
    baseDisc.position.y = -0.07;
    baseDisc.castShadow = true;
    headGroup.add(baseDisc);

    // ── 3개 finger : 2-segment articulated arms (실제 클로머신 집게 형태) ──
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xd4d8e0,
      metalness: 0.9,
      roughness: 0.2,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x6c707d,
      metalness: 0.95,
      roughness: 0.15,
    });

    const fingerCount = 3;
    const upperLen = 0.18;
    const lowerLen = 0.13;
    const tipLen = 0.05;

    for (let i = 0; i < fingerCount; i++) {
      const angle = (i / fingerCount) * Math.PI * 2;

      // pivot — hub 아래 baseDisc 에서 분기. y회전으로 방사 배치 (3등분).
      const pivot = new THREE.Group();
      pivot.position.set(0, -0.09, 0);
      pivot.rotation.y = angle;

      // 어깨 관절 디스크 (hinge 표현)
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 12, 12),
        tipMat,
      );
      pivot.add(shoulder);

      // 상단 segment — pivot 의 +Z 방향으로 살짝 밀고, 아래로 길게 뻗는 박스
      const upperGroup = new THREE.Group();
      // 어깨에서 약간 옆으로 나간 위치에 시작 (radial)
      upperGroup.position.set(0, 0, 0.038);
      const upperMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.034, upperLen, 0.05),
        metalMat,
      );
      upperMesh.position.y = -upperLen / 2;
      upperMesh.castShadow = true;
      upperGroup.add(upperMesh);

      // 하단 segment — 상단 끝에 hinge 로 연결
      const lowerGroup = new THREE.Group();
      lowerGroup.position.y = -upperLen;

      const lowerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, lowerLen, 0.04),
        metalMat,
      );
      lowerMesh.position.y = -lowerLen / 2;
      lowerMesh.castShadow = true;
      lowerGroup.add(lowerMesh);

      // 끝 부분 — 안쪽으로 휘어진 뾰족한 갈고리 (cone 으로)
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.028, tipLen, 8),
        tipMat,
      );
      tip.rotation.x = Math.PI; // 아래로 뾰족
      tip.position.y = -lowerLen - tipLen / 2 + 0.01;
      lowerGroup.add(tip);

      upperGroup.add(lowerGroup);
      pivot.add(upperGroup);
      headGroup.add(pivot);

      this.fingerUpper.push(upperGroup);
      this.fingerLower.push(lowerGroup);
    }

    this.headMesh = headGroup;
    this.group.add(this.headMesh);

    // 바닥 타겟 링 — 집게가 어디로 내려갈지 시각 가이드.
    // 잡기 가능 인형이 반경 안에 있으면 초록색, 아니면 흰색.
    this.reticleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.reticle = new THREE.Mesh(this.buildReticleGeometry(), this.reticleMat);
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.renderOrder = 5;
    this.group.add(this.reticle);

    this.reticleCenterMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.reticleCenter = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 16),
      this.reticleCenterMat,
    );
    this.reticleCenter.rotation.x = -Math.PI / 2;
    this.reticleCenter.renderOrder = 5;
    this.group.add(this.reticleCenter);
  }

  private buildReticleGeometry(): THREE.RingGeometry {
    return new THREE.RingGeometry(SUCCESS.gripRadius - 0.018, SUCCESS.gripRadius + 0.005, 48);
  }

  /** 그립 반경 시각화를 현재 SUCCESS.gripRadius 기준으로 다시 생성 */
  refreshReticle(): void {
    this.reticle.geometry.dispose();
    this.reticle.geometry = this.buildReticleGeometry();
  }

  /** 사용자 입력으로 (x,z) 목표 이동 (idle 일 때만 허용) */
  moveTarget(dx: number, dz: number): void {
    if (this.state !== 'idle') return;
    this.target.x = clamp(this.target.x + dx, -CRANE.xRange, CRANE.xRange);
    this.target.z = clamp(this.target.z + dz, -CRANE.zRange, CRANE.zRange);
  }

  setTargetXZ(x: number, z: number): void {
    if (this.state !== 'idle') return;
    this.target.x = clamp(x, -CRANE.xRange, CRANE.xRange);
    this.target.z = clamp(z, -CRANE.zRange, CRANE.zRange);
  }

  update(dt: number): void {
    // smoothing
    if (this.state === 'idle') {
      this.head.x += (this.target.x - this.head.x) * CRANE.smoothing;
      this.head.z += (this.target.z - this.head.z) * CRANE.smoothing;
      this.head.y += (CRANE.topY - this.head.y) * CRANE.smoothing;
    }

    // 시각 갱신
    this.railZ.position.x = this.head.x;
    this.headMesh.position.set(this.head.x, this.head.y, this.head.z);
    // 케이블: 상단(레일 y) 부터 헤드까지 늘림
    const cableTop = CABINET.innerHeight - 0.1;
    const cableLen = Math.max(0.02, cableTop - this.head.y);
    this.cable.scale.y = cableLen;
    this.cable.position.set(this.head.x, this.head.y + cableLen / 2, this.head.z);

    // 2-마디 finger 애니메이션
    //   close=0 (열림): 어깨 관절 바깥쪽으로 0.45rad, 끝마디 직선
    //   close=1 (닫힘): 어깨 관절 직립, 끝마디 안쪽으로 0.7rad 휘어짐 (J자형 grip)
    const upperAngle = (1 - this.clawClose) * 0.45; // 양수 → 바깥(+z) 방향으로 기울어짐
    const lowerAngle = -this.clawClose * 0.75;       // 음수 → 안쪽으로 휨
    for (let i = 0; i < this.fingerUpper.length; i++) {
      this.fingerUpper[i].rotation.x = upperAngle;
      this.fingerLower[i].rotation.x = lowerAngle;
    }

    // 타겟 링 — idle 일 때만 표시, 잡기 가능 여부에 따라 색 변경
    const showReticle = this.state === 'idle';
    this.reticle.visible = showReticle;
    this.reticleCenter.visible = showReticle;
    if (showReticle) {
      this.reticle.position.set(this.head.x, 0.008, this.head.z);
      this.reticleCenter.position.set(this.head.x, 0.009, this.head.z);
      const candidate = this.dolls.findClosestUnder(this.head.x, this.head.z, SUCCESS.gripRadius);
      if (candidate) {
        this.reticleMat.color.setHex(0x4ef88f);
        this.reticleCenterMat.color.setHex(0x4ef88f);
        this.reticleMat.opacity = 0.9;
      } else {
        this.reticleMat.color.setHex(0xffffff);
        this.reticleCenterMat.color.setHex(0xffffff);
        this.reticleMat.opacity = 0.5;
      }
    }
  }

  /**
   * 잡기 시퀀스. 목표 (x,z) 위치까지 내려가서 인형을 집고 chute 위로 이동 후 떨어뜨림.
   * await 으로 시퀀스 종료까지 대기 가능.
   */
  async grab(cabinetChute: { x: number; z: number }): Promise<GrabResult> {
    if (this.state !== 'idle') return { inst: null, success: false, hadCandidate: false };

    // 1) descend — 스마트 디센드: 인형이 있으면 그 위에서 멈춤, 없으면 bottomY 까지
    this.setState('descend');
    const preTarget = this.dolls.findClosestUnder(this.target.x, this.target.z, SUCCESS.gripRadius);
    let descendY = CRANE.bottomY;
    if (preTarget) {
      // 인형 상단 + clawReach 만큼 위 (= 닫힌 finger 끝이 인형 상단에 닿는 높이)
      const dollTop = preTarget.body.position.y + preTarget.halfExtents.y;
      descendY = Math.max(CRANE.bottomY, dollTop + CRANE.clawReach);
    }
    // 거리에 비례해 시간을 줄여 일정한 속도감
    const fullDist = CRANE.topY - CRANE.bottomY;
    const dist = Math.max(0.001, CRANE.topY - descendY);
    const descendTime = Math.max(0.3, CRANE.descendTime * (dist / fullDist));
    await this.tween(this.head, { y: descendY }, descendTime);

    // 2) close — 도달 위치에서 다시 후보 탐색 (그동안 인형이 굴러갔을 수 있음)
    this.setState('close');
    const candidate = this.dolls.findClosestUnder(this.head.x, this.head.z, SUCCESS.gripRadius);
    const success = candidate !== null && this.rollGrabSuccess(candidate);
    await this.tweenClaw(1, CRANE.closeTime);

    let inst: DollInstance | null = null;
    let midAirDrop = false;
    if (candidate && success) {
      inst = candidate;
      this.dolls.attach(inst);
      // 잡힌 즉시 인형을 finger 끝에 정확히 위치시킴
      this.dolls.followCrane(inst, this.head, this.head.y - CRANE.clawReach);
    }

    // 3) ascend
    this.setState('ascend');
    await this.tweenWith(
      this.head,
      { y: CRANE.topY },
      CRANE.ascendTime,
      () => {
        if (inst && !midAirDrop) {
          this.dolls.followCrane(inst, this.head, this.head.y - CRANE.clawReach);
        }
      },
    );

    // 떨어뜨림 (midair drop) 체크 — ascend 도중 한 번 굴림
    if (inst && Math.random() < SUCCESS.midAirDropRate) {
      midAirDrop = true;
      this.dolls.detach(inst);
      inst.body.velocity.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      inst = null;
      await this.tweenClaw(0.6, 0.15);
    }

    // 4) travel — chute 위로
    this.setState('travel');
    await this.tweenWith(
      this.head,
      { x: cabinetChute.x, z: cabinetChute.z },
      CRANE.travelTime,
      () => {
        if (inst) {
          this.dolls.followCrane(inst, this.head, this.head.y - CRANE.clawReach);
        }
      },
    );

    // 5) release — 집게 열고 인형 떨어짐
    this.setState('release');
    await this.tweenClaw(0, CRANE.releaseTime);

    if (inst) {
      this.dolls.detach(inst);
    }

    // 6) return — 가운데로 천천히 복귀 (idle)
    this.setState('return');
    this.target.x = 0;
    this.target.z = 0;
    // 부드러운 복귀: 짧게 대기
    await sleep(0.4);
    this.setState('idle');

    return {
      inst,
      success: success && !midAirDrop,
      hadCandidate: candidate !== null,
      midAirDrop,
    };
  }

  private rollGrabSuccess(candidate: DollInstance): boolean {
    // 거리 — 그립 반경 내부에서 정중앙(d=0)에 가까울수록 성공률 ↑
    const dx = candidate.body.position.x - this.head.x;
    const dz = candidate.body.position.z - this.head.z;
    const d = Math.hypot(dx, dz);
    const proximity = Math.min(1, d / SUCCESS.gripRadius); // 0(중앙) ~ 1(끝)

    let p = SUCCESS.baseGrabRate - SUCCESS.edgeFalloff * proximity;

    // 무게 보정 (mass 1 기준)
    p -= (candidate.def.mass - 1) * SUCCESS.massPenaltyPerKg;

    // 연속 성공 시 난이도 상향
    const s = streak.get();
    if (s >= SUCCESS.streakPenaltyStart) {
      const overflow = s - SUCCESS.streakPenaltyStart + 1;
      p -= Math.min(SUCCESS.streakPenaltyMax, overflow * SUCCESS.streakPenaltyPerWin);
    }

    p = Math.max(0.1, Math.min(0.95, p));
    return Math.random() < p;
  }

  private setState(s: CraneState): void {
    this.state = s;
    this.onStateChange?.(s);
  }

  private tween(target: THREE.Vector3, to: Partial<{ x: number; y: number; z: number }>, dur: number): Promise<void> {
    return this.tweenWith(target, to, dur);
  }

  private tweenWith(
    target: THREE.Vector3,
    to: Partial<{ x: number; y: number; z: number }>,
    dur: number,
    onUpdate?: () => void,
  ): Promise<void> {
    const from = { x: target.x, y: target.y, z: target.z };
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / (dur * 1000));
        const e = easeInOut(t);
        if (to.x !== undefined) target.x = from.x + (to.x - from.x) * e;
        if (to.y !== undefined) target.y = from.y + (to.y - from.y) * e;
        if (to.z !== undefined) target.z = from.z + (to.z - from.z) * e;
        onUpdate?.();
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }

  private tweenClaw(to: number, dur: number): Promise<void> {
    const from = this.clawClose;
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / (dur * 1000));
        this.clawClose = from + (to - from) * easeInOut(t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function sleep(sec: number) {
  return new Promise<void>((r) => setTimeout(r, sec * 1000));
}
