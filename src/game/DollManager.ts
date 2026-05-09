import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DOLLS, type DollDef, rollSpawnList } from '../config/dolls';
import { CABINET } from '../config/game';
import type { Physics } from './Physics';

export interface DollInstance {
  def: DollDef;
  mesh: THREE.Object3D;
  body: CANNON.Body;
  /** 물리 박스 반경 (월드 단위) — 인형 위치/탑/잡기 보정에 사용 */
  halfExtents: { x: number; y: number; z: number };
  attached: boolean;
}

interface Template {
  /** 클론용 wrapper. wrapper 의 local origin = 비주얼 모델의 중심(바운딩박스 center). */
  object: THREE.Object3D;
  halfX: number;
  halfY: number;
  halfZ: number;
}

/**
 * 인형 로드 / 스폰 / 물리-비주얼 동기화.
 *
 * 정규화 핵심: GLTF 의 root 를 wrapper Group 의 자식으로 넣고, root 의 position 을
 * 바운딩박스 중심의 -center 로 옮겨서 wrapper.local_origin = 비주얼 중심이 되도록 합니다.
 * 그러면 cannon-es body 의 position 을 mesh.position 에 그대로 복사해도 비주얼 중심이
 * body 중심과 정확히 일치 → 인형이 바닥을 뚫고 들어가지 않습니다.
 */
export class DollManager {
  readonly group = new THREE.Group();
  readonly instances: DollInstance[] = [];
  private templateCache = new Map<string, Template>();
  private loader = new GLTFLoader();

  constructor(private physics: Physics) {}

  async preload(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const withModel = DOLLS.filter((d) => d.modelUrl);
    let loaded = 0;
    const total = withModel.length;
    onProgress?.(0, total);
    await Promise.all(
      withModel.map(async (d) => {
        try {
          const gltf = await this.loader.loadAsync(d.modelUrl!);
          const inner = gltf.scene;
          inner.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              const m = o as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          // 1) 모델 자체 스케일 적용 (이후 bbox 가 final size)
          inner.scale.setScalar(d.scale);
          // 2) bbox 측정 → 중심을 inner local origin 으로 옮김
          const box = new THREE.Box3().setFromObject(inner);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          inner.position.sub(center);
          // 3) wrapper 로 감싸 클론 시에도 정규화 유지
          const wrapper = new THREE.Group();
          wrapper.add(inner);
          this.templateCache.set(d.id, {
            object: wrapper,
            halfX: size.x / 2,
            halfY: size.y / 2,
            halfZ: size.z / 2,
          });
        } catch (err) {
          console.warn(`[DollManager] Failed to load GLB for ${d.id}:`, err);
        } finally {
          loaded += 1;
          onProgress?.(loaded, total);
        }
      }),
    );
  }

  spawn(count: number): void {
    const list = rollSpawnList(count);
    const placed: Array<{ x: number; z: number }> = [];
    for (const def of list) {
      let pos = this.randomPosition();
      for (let tries = 0; tries < 6; tries++) {
        const tooClose = placed.some(
          (p) => Math.hypot(p.x - pos.x, p.z - pos.z) < def.bodyHalfExtents.x * 2.4,
        );
        if (!tooClose) break;
        pos = this.randomPosition();
      }
      placed.push(pos);

      // 스폰 y: body half-extent 보다 충분히 위에서 떨어뜨려 자연스럽게 안착
      const tpl = this.templateCache.get(def.id);
      const halfY = tpl?.halfY ?? def.bodyHalfExtents.y;
      const y = halfY + 0.3 + Math.random() * 0.3;
      this.spawnOne(def, pos.x, y, pos.z);
    }
  }

  private randomPosition(): { x: number; z: number } {
    const r = CABINET.innerHalf - 0.2;
    return {
      x: (Math.random() * 2 - 1) * r,
      z: (Math.random() * 2 - 1) * r,
    };
  }

  private spawnOne(def: DollDef, x: number, y: number, z: number): DollInstance {
    let mesh: THREE.Object3D;
    let halfX: number, halfY: number, halfZ: number;

    const tpl = this.templateCache.get(def.id);
    if (tpl) {
      mesh = tpl.object.clone(true);
      // wrapper 자체 scale 은 1 (스케일은 inner 에 베이크됨), 클론도 동일
      halfX = tpl.halfX;
      halfY = tpl.halfY;
      halfZ = tpl.halfZ;
    } else {
      // GLB 없으면 컬러풀 프리미티브로 대체
      const color = def.fallbackColor ?? 0xffaacc;
      const geo =
        def.rarity === 'HR'
          ? new THREE.OctahedronGeometry(0.18, 0)
          : new THREE.BoxGeometry(0.3, 0.3, 0.3);
      mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          metalness: 0.35,
          roughness: 0.45,
          emissive: new THREE.Color(color).multiplyScalar(0.18),
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.scale.setScalar(def.scale);
      halfX = def.bodyHalfExtents.x;
      halfY = def.bodyHalfExtents.y;
      halfZ = def.bodyHalfExtents.z;
    }
    this.group.add(mesh);

    const body = new CANNON.Body({
      mass: def.mass,
      shape: new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)),
      material: this.physics.defaultMaterial,
      angularDamping: 0.4,
      linearDamping: 0.1,
    });
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    this.physics.world.addBody(body);

    const inst: DollInstance = {
      def,
      mesh,
      body,
      halfExtents: { x: halfX, y: halfY, z: halfZ },
      attached: false,
    };
    this.instances.push(inst);
    return inst;
  }

  /** 매 프레임 — 물리 → 시각 동기화. mesh local origin = 비주얼 중심 = body 중심. */
  sync(): void {
    for (const inst of this.instances) {
      if (inst.attached) continue;
      const p = inst.body.position;
      const q = inst.body.quaternion;
      inst.mesh.position.set(p.x, p.y, p.z);
      inst.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  findClosestUnder(x: number, z: number, maxDist = 0.35): DollInstance | null {
    let best: DollInstance | null = null;
    let bestDist = Infinity;
    for (const inst of this.instances) {
      if (inst.attached) continue;
      const dx = inst.body.position.x - x;
      const dz = inst.body.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < bestDist && d < maxDist) {
        bestDist = d;
        best = inst;
      }
    }
    return best;
  }

  /**
   * 잡힌 인형이 크레인을 따라 이동.
   * clawTipY = 닫힌 finger 의 끝(가장 아래) y. 인형 중심을 정확히 이 높이에 둠.
   *
   * 효과: 클로 finger 들이 인형의 가운데(허리쯤)를 감싸안고 있는 모습.
   * 인형 상단/하단이 finger 길이 안쪽에 들어와 시각적으로 finger 가 인형을 뚫지 않음.
   */
  followCrane(inst: DollInstance, cranePos: THREE.Vector3, clawTipY: number): void {
    const targetY = clawTipY;
    inst.body.position.set(cranePos.x, targetY, cranePos.z);
    inst.body.velocity.setZero();
    inst.body.angularVelocity.setZero();
    inst.mesh.position.set(cranePos.x, targetY, cranePos.z);
  }

  detach(inst: DollInstance): void {
    inst.attached = false;
    inst.body.type = CANNON.Body.DYNAMIC;
    inst.body.wakeUp();
  }

  attach(inst: DollInstance): void {
    inst.attached = true;
    inst.body.type = CANNON.Body.KINEMATIC;
    inst.body.velocity.setZero();
    inst.body.angularVelocity.setZero();
  }

  remove(inst: DollInstance): void {
    this.group.remove(inst.mesh);
    this.physics.world.removeBody(inst.body);
    const idx = this.instances.indexOf(inst);
    if (idx >= 0) this.instances.splice(idx, 1);
  }

  reset(count: number): void {
    while (this.instances.length) this.remove(this.instances[0]);
    this.spawn(count);
  }
}
