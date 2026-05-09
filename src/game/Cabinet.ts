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

    // 외곽 프레임 (테마 색)
    this.frameMat = new THREE.MeshStandardMaterial({
      color: theme.frame,
      metalness: 0.4,
      roughness: 0.35,
      emissive: new THREE.Color(theme.frame).multiplyScalar(0.18),
    });
    const frameMat = this.frameMat;
    const frameSize = 0.06;
    const edges = [
      // 하단 사각형 4변
      [[-inner, 0, -inner], [inner, 0, -inner]],
      [[-inner, 0, inner], [inner, 0, inner]],
      [[-inner, 0, -inner], [-inner, 0, inner]],
      [[inner, 0, -inner], [inner, 0, inner]],
      // 상단 사각형 4변
      [[-inner, h, -inner], [inner, h, -inner]],
      [[-inner, h, inner], [inner, h, inner]],
      [[-inner, h, -inner], [-inner, h, inner]],
      [[inner, h, -inner], [inner, h, inner]],
      // 4개 기둥
      [[-inner, 0, -inner], [-inner, h, -inner]],
      [[inner, 0, -inner], [inner, h, -inner]],
      [[-inner, 0, inner], [-inner, h, inner]],
      [[inner, 0, inner], [inner, h, inner]],
    ];
    for (const [a, b] of edges) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      const geo = new THREE.BoxGeometry(frameSize, len, frameSize);
      const mesh = new THREE.Mesh(geo, frameMat);
      mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // 유리 벽 — 단순 반투명 (transmission 사용 시 인형이 화면-공간 블러로 뿌옇게 보임)
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: theme.glassTint,
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glassMat = this.glassMat;
    const wallW = inner * 2;
    const walls: Array<[number, number, number, number, number, number]> = [
      // x, y, z, sx, sy, sz
      [0, h / 2, -inner, wallW, h, t], // back
      [0, h / 2, inner, wallW, h, t],  // front
      [-inner, h / 2, 0, t, h, wallW], // left
      [inner, h / 2, 0, t, h, wallW],  // right
    ];
    for (const [x, y, z, sx, sy, sz] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), glassMat);
      m.position.set(x, y, z);
      this.group.add(m);
    }

    // 바닥 — 격자 무늬 + 배출구 표시
    const floorGeo = new THREE.PlaneGeometry(wallW, wallW, 16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d2e,
      metalness: 0.2,
      roughness: 0.7,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // 격자 라인
    const grid = new THREE.GridHelper(wallW, 8, 0x4ea1ff, 0x2a2e44);
    grid.position.y = 0.001;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    this.group.add(grid);

    // 배출구 (chute) 시각 표시 — 노란 링
    const chuteGeo = new THREE.RingGeometry(this.chuteRadius - 0.02, this.chuteRadius + 0.02, 32);
    const chuteMat = new THREE.MeshBasicMaterial({
      color: 0xffd23f,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const chuteRing = new THREE.Mesh(chuteGeo, chuteMat);
    chuteRing.rotation.x = -Math.PI / 2;
    chuteRing.position.set(this.chuteX, 0.003, this.chuteZ);
    this.group.add(chuteRing);

    // 배출구 안쪽 어두운 디스크 (구멍처럼 보이게)
    const holeGeo = new THREE.CircleGeometry(this.chuteRadius - 0.015, 32);
    const hole = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x05060e }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(this.chuteX, 0.002, this.chuteZ);
    this.group.add(hole);

    // 받침대 (캐비닛 아래쪽 박스)
    const baseGeo = new THREE.BoxGeometry(wallW + 0.4, 0.5, wallW + 0.4);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2a2e44,
      metalness: 0.5,
      roughness: 0.6,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.25;
    base.receiveShadow = true;
    base.castShadow = true;
    this.group.add(base);

    // 상단 캡 + 라벨
    this.topCapMat = new THREE.MeshStandardMaterial({
      color: theme.frame,
      roughness: 0.4,
      metalness: 0.5,
      emissive: new THREE.Color(theme.frame).multiplyScalar(0.18),
    });
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.2, 0.16, wallW + 0.2), this.topCapMat);
    topCap.position.y = h + 0.08;
    topCap.castShadow = true;
    this.group.add(topCap);
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
