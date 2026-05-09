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
  /** 각 finger 의 swing pivot (열기/닫기 회전 적용 대상) */
  private fingerSwings: THREE.Group[] = [];
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

    // 크레인 헤드 (hub) + 4-갈고리 클로 (실제 아케이드 클로머신 디자인)
    const headGroup = new THREE.Group();

    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xc8ccd6,
      metalness: 0.85,
      roughness: 0.25,
    });
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x9ba0ad,
      metalness: 0.85,
      roughness: 0.3,
    });

    // ── Hub: 실린더 본체 (인형을 충분히 감쌀 수 있게 폭 확장) ──
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.13, 0.14, 28),
      hubMat,
    );
    hub.castShadow = true;
    headGroup.add(hub);

    // 위 — 케이블 브래킷 (작은 실린더)
    const bracket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.068, 0.045, 18),
      bracketMat,
    );
    bracket.position.y = 0.092;
    bracket.castShadow = true;
    headGroup.add(bracket);

    // 케이블 고리 (torus)
    const cableEye = new THREE.Mesh(
      new THREE.TorusGeometry(0.026, 0.008, 10, 18),
      hubMat,
    );
    cableEye.position.y = 0.125;
    cableEye.rotation.x = Math.PI / 2;
    headGroup.add(cableEye);

    // hub 아래 — 회전축 디스크 (4개 finger 가 매달리는 베이스)
    const hingeRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.115, 0.04, 28),
      bracketMat,
    );
    hingeRing.position.y = -0.090;
    hingeRing.castShadow = true;
    headGroup.add(hingeRing);

    // ── 4개 곡선 후크 finger (TubeGeometry — J자형) ──
    const fingerMat = new THREE.MeshStandardMaterial({
      color: 0xd4d8e0,
      metalness: 0.9,
      roughness: 0.18,
    });
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x4a4f5d,
      metalness: 0.9,
      roughness: 0.15,
    });

    // 곡선 — pivot local 에서 (0,0,0) 부터 (0.10, -0.30, 0) 까지 J자 형태로.
    // 위쪽은 거의 수직, 끝부분이 바깥쪽으로 크게 휘어지는 후크 — 실제 아케이드 클로 외형
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.22, 0),
      new THREE.Vector3(0.10, -0.30, 0),
    );
    const fingerGeo = new THREE.TubeGeometry(curve, 28, 0.019, 10, false);

    const fingerCount = 4;
    for (let i = 0; i < fingerCount; i++) {
      const angle = (i / fingerCount) * Math.PI * 2;

      // 방사 배치 pivot — hub 아래에 매달림
      const radialPivot = new THREE.Group();
      radialPivot.position.set(0, -0.105, 0);
      radialPivot.rotation.y = angle;

      // 열기/닫기 swing pivot — rotation.z 로 안/밖으로 흔들림
      const swingPivot = new THREE.Group();
      swingPivot.position.set(0.115, 0.005, 0);

      // 힌지 볼트
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 14), boltMat);
      swingPivot.add(bolt);

      // 곡선 후크
      const finger = new THREE.Mesh(fingerGeo, fingerMat);
      finger.castShadow = true;
      swingPivot.add(finger);

      radialPivot.add(swingPivot);
      headGroup.add(radialPivot);

      this.fingerSwings.push(swingPivot);
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

    // 4-갈고리 swing 애니메이션
    //   close=0 (열림): pivot.rotation.z = +0.42 → finger 가 바깥으로 펼쳐짐 (꽃 피듯)
    //   close=1 (닫힘): pivot.rotation.z = -0.40 → finger 가 안으로 모임 (그립)
    const swingAngle = 0.42 - this.clawClose * 0.82;
    for (const pivot of this.fingerSwings) {
      pivot.rotation.z = swingAngle;
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

    // 1) descend — 스마트 디센드: 인형이 있으면 인형 중심까지 내려감, 없으면 bottomY 까지
    this.setState('descend');
    const preTarget = this.dolls.findClosestUnder(this.target.x, this.target.z, SUCCESS.gripRadius);
    let descendY = CRANE.bottomY;
    if (preTarget) {
      // 닫힌 finger 끝이 인형 중심(가운데 높이) 에 닿도록 내려감
      // → 시각적으로 finger 가 인형의 중간을 감싸 안는 모션
      const dollCenter = preTarget.body.position.y;
      descendY = Math.max(CRANE.bottomY, dollCenter + CRANE.clawReach);
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
