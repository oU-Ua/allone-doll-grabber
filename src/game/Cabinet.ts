import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CABINET, type ThemePreset } from '../config/game';
import type { Physics } from './Physics';

/**
 * 인형뽑기 기계 본체.
 * - Three.js: 보이는 프레임/유리/바닥/배출구 가이드
 * - Cannon-es: 바닥 + 4면 벽 (천장은 없음, 위에서 인형 떨어뜨릴 수 있게)
 *
 * 좌표계: 캐비닛 내부 바닥의 중심이 (0, 0, 0).
 *   x: 좌우 (-innerHalf ~ +innerHalf)
 *   y: 위쪽 (0 ~ innerHeight)
 *   z: 앞뒤 (-innerHalf ~ +innerHalf)
 */
export class Cabinet {
  readonly group = new THREE.Group();
  readonly chuteX: number;
  readonly chuteZ: number;
  readonly chuteRadius: number;

  /** Prize Out 도어 전면(외부) world 좌표 — Game 의 prize-out 애니메이션이 사용 */
  readonly prizeOutFront!: { x: number; y: number; z: number };

  private frameMat!: THREE.MeshStandardMaterial;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private topCapMat!: THREE.MeshStandardMaterial;

  constructor(physics: Physics, theme: ThemePreset) {
    this.chuteX = CABINET.chute.x;
    this.chuteZ = CABINET.chute.z;
    this.chuteRadius = CABINET.chute.radius;

    this.buildVisuals(theme);
    this.buildPhysics(physics);
  }

  /** 테마 변경 시 재질 색만 갱신 (지오메트리는 재사용) */
  applyTheme(theme: ThemePreset): void {
    this.frameMat.color.setHex(theme.frame);
    this.frameMat.emissive.setHex(theme.frame).multiplyScalar(0.18);
    this.topCapMat.color.setHex(theme.frame);
    this.topCapMat.emissive.setHex(theme.frame).multiplyScalar(0.18);
    this.glassMat.color.setHex(theme.glassTint);
  }

  private buildVisuals(theme: ThemePreset): void {
    const inner = CABINET.innerHalf;
    const h = CABINET.innerHeight;
    const t = CABINET.wallThickness;
    const wallW = inner * 2;

    // ── 색상 / 머티리얼 ──
    // 캐비닛 외장 — 크림색 솔리드 (실제 아케이드 클로머신 외관)
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0xfffaf2,
      roughness: 0.55,
      metalness: 0.05,
    });
    // 마키/도어 프레임/포스트 — 테마 액센트 (분홍 등)
    this.frameMat = new THREE.MeshStandardMaterial({
      color: theme.frame,
      metalness: 0.3,
      roughness: 0.4,
      emissive: new THREE.Color(theme.frame).multiplyScalar(0.18),
    });
    this.topCapMat = new THREE.MeshStandardMaterial({
      color: theme.frame,
      roughness: 0.4,
      metalness: 0.4,
      emissive: new THREE.Color(theme.frame).multiplyScalar(0.18),
    });
    // 유리 — 단순 반투명
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: theme.glassTint,
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // ── 4 모서리 솔리드 포스트 (유리 디스플레이 코너) ──
    const postW = 0.07;
    const postPositions: [number, number, number][] = [
      [-inner - postW / 2, h / 2, -inner - postW / 2],
      [ inner + postW / 2, h / 2, -inner - postW / 2],
      [-inner - postW / 2, h / 2,  inner + postW / 2],
      [ inner + postW / 2, h / 2,  inner + postW / 2],
    ];
    for (const [x, y, z] of postPositions) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(postW, h, postW),
        cabinetMat,
      );
      post.position.set(x, y, z);
      post.castShadow = true;
      post.receiveShadow = true;
      this.group.add(post);
    }

    // ── 뒷벽 — 솔리드 (불투명 화이트, 메커니즘 가리는 패널) ──
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallW + postW * 2, h, postW),
      cabinetMat,
    );
    backWall.position.set(0, h / 2, -inner - postW / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // ── 전면 / 좌 / 우 — 유리 ──
    const glasses: Array<[number, number, number, number, number, number]> = [
      [0, h / 2, inner,  wallW, h, t],          // 전면
      [-inner, h / 2, 0, t, h, wallW],          // 좌
      [ inner, h / 2, 0, t, h, wallW],          // 우
    ];
    for (const [x, y, z, sx, sy, sz] of glasses) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.glassMat);
      m.position.set(x, y, z);
      this.group.add(m);
    }

    // ── 상단 캡 (단순 크림 솔리드 — 브랜드 마키 제거) ──
    const marqueeW = wallW + postW * 2;
    const capH = 0.18;
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(marqueeW, capH, marqueeW),
      cabinetMat,
    );
    cap.position.y = h + capH / 2;
    cap.castShadow = true;
    cap.receiveShadow = true;
    this.group.add(cap);

    // ── 받침대 (Base) — 컨트롤 패널이 있는 하부 ──
    const baseH = 0.6;
    const baseSide = wallW + postW * 2 + 0.06;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(baseSide, baseH, baseSide),
      cabinetMat,
    );
    base.position.y = -baseH / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // 받침대 하단 발 (가는 검은 띠)
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(baseSide + 0.04, 0.05, baseSide + 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.7 }),
    );
    skirt.position.y = -baseH + 0.025;
    this.group.add(skirt);

    // ── 컨트롤 패널 (받침대 전면, 조이스틱 + 큰 버튼) ──
    const panelW = 0.62;
    const panelH = 0.18;
    const panelD = 0.14;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x6a8fbc, roughness: 0.4, metalness: 0.4 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelD), panelMat);
    const panelTopY = -0.1;
    panel.position.set(0, panelTopY, baseSide / 2 + panelD / 2 - 0.04);
    panel.castShadow = true;
    this.group.add(panel);

    // 조이스틱
    const stickX = -0.14;
    const stickZ = baseSide / 2 + panelD / 2 - 0.04;
    const stickBaseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.025, 16),
      new THREE.MeshStandardMaterial({ color: 0xc0c5d0, metalness: 0.6, roughness: 0.35 }),
    );
    stickBaseMesh.position.set(stickX, panelTopY + panelH / 2 + 0.012, stickZ);
    this.group.add(stickBaseMesh);

    const stickRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a8a96 }),
    );
    stickRod.position.set(stickX, panelTopY + panelH / 2 + 0.060, stickZ);
    this.group.add(stickRod);

    const stickBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xff5a87, roughness: 0.4, emissive: 0x331122 }),
    );
    stickBall.position.set(stickX, panelTopY + panelH / 2 + 0.1, stickZ);
    this.group.add(stickBall);

    // 큰 빨간 버튼
    const buttonX = 0.13;
    const buttonZ = stickZ;
    const buttonBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.018, 18),
      new THREE.MeshStandardMaterial({ color: 0x202428, metalness: 0.4, roughness: 0.5 }),
    );
    buttonBase.position.set(buttonX, panelTopY + panelH / 2 + 0.009, buttonZ);
    this.group.add(buttonBase);

    const buttonCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.042, 0.014, 18),
      new THREE.MeshStandardMaterial({ color: 0xff4444, metalness: 0.3, roughness: 0.35, emissive: 0x441111 }),
    );
    buttonCap.position.set(buttonX, panelTopY + panelH / 2 + 0.022, buttonZ);
    this.group.add(buttonCap);

    // ── 동전 투입구 (가는 슬릿) ──
    const coinSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.025, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
    );
    coinSlot.position.set(0.30, -0.03, baseSide / 2 + 0.001);
    this.group.add(coinSlot);

    const coinSlotHole = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.008, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x000000 }),
    );
    coinSlotHole.position.set(0.30, -0.03, baseSide / 2 + 0.005);
    this.group.add(coinSlotHole);

    // ── Prize Out 도어 (받침대 전면, 실제 chute 와 동일한 x 위치에 정렬) ──
    const doorW = 0.55;
    const doorH = 0.34;
    const doorY = -baseH + doorH / 2 + 0.10;
    const doorX = this.chuteX; // chute 와 정렬
    const doorZ = baseSide / 2;

    const doorPlate = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x342438, roughness: 0.55, metalness: 0.2 }),
    );
    doorPlate.position.set(doorX, doorY, doorZ + 0.001);
    this.group.add(doorPlate);

    // 도어 라벨 (Prize Out)
    const doorLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.8, doorH * 0.30),
      new THREE.MeshStandardMaterial({
        map: this.makeDoorTexture(),
        transparent: true,
      }),
    );
    doorLabel.position.set(doorX, doorY + doorH * 0.28, doorZ + 0.012);
    this.group.add(doorLabel);

    // 도어 프레임
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 0.04, doorH + 0.04, 0.012),
      this.frameMat,
    );
    doorFrame.position.set(doorX, doorY, doorZ + 0.005);
    this.group.add(doorFrame);

    // Prize Out 인형 등장 좌표 (도어 전면에 살짝 튀어나온 위치)
    (this as { prizeOutFront: { x: number; y: number; z: number } }).prizeOutFront = {
      x: doorX,
      y: doorY,
      z: doorZ + 0.18,
    };

    // ── 바닥 (인형이 굴러다니는 표면) — 크림 솔리드 (뒷벽과 동일) ──
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(wallW, wallW, 1, 1),
      cabinetMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 배출구 시각 (노란 링 + 어두운 구멍)
    const chuteRing = new THREE.Mesh(
      new THREE.RingGeometry(this.chuteRadius - 0.02, this.chuteRadius + 0.02, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    chuteRing.rotation.x = -Math.PI / 2;
    chuteRing.position.set(this.chuteX, 0.003, this.chuteZ);
    this.group.add(chuteRing);

    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(this.chuteRadius - 0.015, 32),
      new THREE.MeshBasicMaterial({ color: 0x05060e }),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(this.chuteX, 0.002, this.chuteZ);
    this.group.add(hole);
  }

  /** "Prize Out" 도어 라벨 텍스처 */
  private makeDoorTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 248, 232, 0.95)';
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = 'bold 70px "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4f99';
    ctx.fillText('PRIZE OUT', 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  private buildPhysics(physics: Physics): void {
    const inner = CABINET.innerHalf;
    const h = CABINET.innerHeight;

    // 바닥 (chute 영역 제외 — chute는 sensor 로 처리하지 않고 그냥 바닥 깎아도 되지만
    //   단순화를 위해 바닥 전체에 collider를 두고 chute 위 인형은 시각적으로 가려진 채로
    //   "release sequence" 가 끝나면 강제 텔레포트로 처리)
    const floorBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: physics.defaultMaterial,
    });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    physics.world.addBody(floorBody);

    // 4면 벽 (안쪽을 바라보도록 plane 회전)
    const walls = [
      { axis: 'x', sign: -1 }, // left wall normal +x
      { axis: 'x', sign: 1 },  // right wall normal -x
      { axis: 'z', sign: -1 }, // back wall normal +z
      { axis: 'z', sign: 1 },  // front wall normal -z
    ];
    for (const w of walls) {
      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        material: physics.defaultMaterial,
      });
      if (w.axis === 'x') {
        body.position.set(w.sign * inner, h / 2, 0);
        body.quaternion.setFromEuler(0, w.sign === -1 ? Math.PI / 2 : -Math.PI / 2, 0);
      } else {
        body.position.set(0, h / 2, w.sign * inner);
        body.quaternion.setFromEuler(0, w.sign === -1 ? 0 : Math.PI, 0);
      }
      physics.world.addBody(body);
    }

    // 천장 — 인형이 위로 튀어나가지 않도록 가벼운 limit
    const ceiling = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: physics.defaultMaterial,
    });
    ceiling.position.set(0, h, 0);
    ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
    physics.world.addBody(ceiling);
  }
}
