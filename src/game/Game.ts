import * as THREE from 'three';
import { Physics } from './Physics';
import { Cabinet } from './Cabinet';
import { DollManager } from './DollManager';
import { Crane, type CraneState } from './Crane';
import { CameraRig, type CameraPreset } from './CameraRig';
import { CABINET, THEMES, applyDifficulty } from '../config/game';
import { settings, type Difficulty, type ThemeId } from '../state/settings';
import { customCamera } from '../state/customCamera';
import { Particles } from '../effects/Particles';
import { sounds } from '../audio/Sounds';

export interface GameCallbacks {
  onStateText: (text: string) => void;
  onSuccess: (dollId: string) => void;
  onFail: (reason: 'no-doll' | 'mid-air-drop' | 'miss') => void;
  onLoadProgress: (loaded: number, total: number) => void;
}

const STATE_TEXT: Record<CraneState, string> = {
  idle: '크레인 대기 중',
  descend: '내려가는 중...',
  close: '인형 집는 중...',
  ascend: '올라가는 중...',
  travel: '배출구로 이동 중...',
  release: '인형 떨어뜨리는 중...',
  return: '복귀 중...',
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cameraRig: CameraRig;
  private physics: Physics;
  private cabinet: Cabinet;
  private dolls: DollManager;
  private crane: Crane;
  private particles: Particles;
  private clock = new THREE.Clock();
  private rafId = 0;

  private hemi!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.PointLight;
  private stage!: THREE.Mesh;

  constructor(private canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    const { width, height } = canvas.getBoundingClientRect();

    // 저장된 설정으로 시작
    const s = settings.get();
    applyDifficulty(s.difficulty);
    const theme = THEMES[s.theme];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.background);
    this.scene.fog = new THREE.Fog(theme.background, theme.fogNear, theme.fogFar);

    this.cameraRig = new CameraRig(width, height, canvas);
    // 저장된 커스텀 앵글이 있으면 시작 시 적용
    const cam = customCamera.get();
    if (cam) this.cameraRig.applyCustom(cam, true);

    this.buildLights(theme);
    this.buildEnv(theme);

    this.physics = new Physics();
    this.cabinet = new Cabinet(this.physics, theme);
    this.scene.add(this.cabinet.group);

    this.dolls = new DollManager(this.physics);
    this.scene.add(this.dolls.group);

    this.crane = new Crane(this.dolls, (state) => {
      this.cb.onStateText(STATE_TEXT[state]);
      if (state === 'descend') sounds.motor();
      else if (state === 'close') sounds.close();
      else if (state === 'ascend') sounds.motor();
      else if (state === 'release') sounds.drop();
    });
    this.scene.add(this.crane.group);

    this.particles = new Particles();
    this.scene.add(this.particles.object);

    window.addEventListener('resize', this.onResize);
  }

  private buildLights(theme: typeof THEMES[ThemeId]): void {
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.7);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(theme.keyColor, 1.4);
    this.keyLight.position.set(2.4, 4, 3);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -3;
    this.keyLight.shadow.camera.right = 3;
    this.keyLight.shadow.camera.top = 3;
    this.keyLight.shadow.camera.bottom = -3;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 12;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(theme.fillColor, 0.4);
    this.fillLight.position.set(-3, 2, -2);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.PointLight(theme.rimColor, 0.8, 6);
    this.rimLight.position.set(0, CABINET.innerHeight + 0.4, 0);
    this.scene.add(this.rimLight);
  }

  private buildEnv(theme: typeof THEMES[ThemeId]): void {
    this.stage = new THREE.Mesh(
      new THREE.CircleGeometry(8, 64),
      new THREE.MeshStandardMaterial({ color: theme.stage, roughness: 0.9, metalness: 0.05 }),
    );
    this.stage.rotation.x = -Math.PI / 2;
    this.stage.position.y = -0.5;
    this.stage.receiveShadow = true;
    this.scene.add(this.stage);
  }

  setTheme(id: ThemeId): void {
    // §1.1.3 — 환경 전환 시 부드러운 페이드 효과
    const fade = document.getElementById('theme-fade');
    const apply = () => {
      const t = THEMES[id];
      (this.scene.background as THREE.Color).setHex(t.background);
      (this.scene.fog as THREE.Fog).color.setHex(t.background);
      (this.scene.fog as THREE.Fog).near = t.fogNear;
      (this.scene.fog as THREE.Fog).far = t.fogFar;
      this.hemi.color.setHex(t.hemiSky);
      this.hemi.groundColor.setHex(t.hemiGround);
      this.keyLight.color.setHex(t.keyColor);
      this.fillLight.color.setHex(t.fillColor);
      this.rimLight.color.setHex(t.rimColor);
      (this.stage.material as THREE.MeshStandardMaterial).color.setHex(t.stage);
      this.cabinet.applyTheme(t);
      // 페이드 오버레이 색도 새 배경에 맞춤
      if (fade) fade.style.background = `#${t.background.toString(16).padStart(6, '0')}`;
      settings.patch({ theme: id });
    };
    if (!fade) { apply(); return; }
    fade.classList.add('active');
    setTimeout(() => {
      apply();
      requestAnimationFrame(() => fade.classList.remove('active'));
    }, 280);
  }

  setDifficulty(d: Difficulty): void {
    applyDifficulty(d);
    this.crane.refreshReticle();
    settings.patch({ difficulty: d });
  }

  saveCustomCamera(): void {
    customCamera.save(this.cameraRig.captureCurrent());
  }

  loadCustomCamera(): boolean {
    const v = customCamera.get();
    if (!v) return false;
    this.cameraRig.applyCustom(v);
    return true;
  }

  hasCustomCamera(): boolean {
    return customCamera.get() !== null;
  }

  async load(): Promise<void> {
    await this.dolls.preload(this.cb.onLoadProgress);
    this.dolls.spawn(8);
  }

  start(): void {
    if (this.rafId) return;
    this.clock.start();
    const tick = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.physics.step(dt);
      this.crane.update(dt);
      this.dolls.sync();
      this.cameraRig.update(dt);
      this.particles.update(dt);
      this.renderer.render(this.scene, this.cameraRig.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  setCameraPreset(name: CameraPreset): void {
    this.cameraRig.applyPreset(name);
  }

  toggleAutoRotate(): boolean {
    this.cameraRig.setAutoRotate(!this.cameraRig.autoRotate);
    return this.cameraRig.autoRotate;
  }

  /** 잡기 시퀀스 실행. 성공 시 콜백으로 dollId 반환, 실패 시 사유 반환 */
  async tryGrab(): Promise<void> {
    if (this.crane.state !== 'idle') return;

    const result = await this.crane.grab({ x: this.cabinet.chuteX, z: this.cabinet.chuteZ });
    if (result.success && result.inst) {
      const dollId = result.inst.def.id;
      sounds.success();
      // chute → Prize Out 도어 애니메이션 (인형이 도어 앞으로 등장)
      await this.animatePrizeOut(result.inst);
      this.dolls.remove(result.inst);
      if (this.dolls.instances.length < 3) {
        this.dolls.spawn(6);
      }
      this.cb.onSuccess(dollId);
    } else if (result.midAirDrop) {
      const at = result.inst
        ? new THREE.Vector3(result.inst.body.position.x, result.inst.body.position.y, result.inst.body.position.z)
        : new THREE.Vector3(this.crane.head.x, this.crane.head.y, this.crane.head.z);
      this.particles.burstFail(at);
      sounds.fail();
      this.cb.onFail('mid-air-drop');
    } else if (!result.hadCandidate) {
      this.particles.burstClose(new THREE.Vector3(this.crane.head.x, 0.3, this.crane.head.z));
      sounds.fail();
      this.cb.onFail('no-doll');
    } else {
      this.particles.burstFail(new THREE.Vector3(this.crane.head.x, 0.3, this.crane.head.z));
      sounds.fail();
      this.cb.onFail('miss');
    }
  }

  isIdle(): boolean {
    return this.crane.state === 'idle';
  }

  /**
   * 인형이 chute 로 떨어진 뒤 Prize Out 도어로 등장하는 애니메이션.
   *  1) 짧게 숨김 (chute 통과 효과)
   *  2) 도어 앞으로 텔레포트 + 살짝 튀어나오는 모션
   *  3) 사용자가 보도록 잠시 hold 후 제거(caller 가 처리)
   */
  private async animatePrizeOut(inst: import('./DollManager').DollInstance): Promise<void> {
    // kinematic 으로 만들어 물리에서 분리, 일단 숨김
    this.dolls.attach(inst);
    inst.mesh.visible = false;
    await sleep(220);

    // Prize Out 도어 앞으로 등장
    const target = this.cabinet.prizeOutFront;
    inst.mesh.visible = true;
    this.particles.burstSuccess(new THREE.Vector3(target.x, target.y + 0.05, target.z));
    sounds.collect();

    // 시작 위치는 도어 안쪽 (살짝 뒤), 끝 위치는 도어 바깥(0.18 앞)
    const startZ = target.z - 0.20;
    const endZ = target.z;
    const dur = 600;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        const z = startZ + (endZ - startZ) * e;
        const yArc = Math.sin(t * Math.PI) * 0.08;
        inst.body.position.set(target.x, target.y + yArc, z);
        inst.body.quaternion.set(0, 0, 0, 1);
        inst.mesh.position.set(target.x, target.y + yArc, z);
        inst.mesh.quaternion.set(0, 0, 0, 1);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });

    // 사용자가 인형을 보고 인지할 시간
    await sleep(900);
  }

  /**
   * D-pad / 방향키로 크레인 평면 이동.
   * 사용자 요청에 따라 **카메라 앵글과 무관하게 월드 축에 고정**:
   *   sx: -1 = -x(좌), +1 = +x(우)
   *   sz: -1 = -z(앞/뒤쪽), +1 = +z(앞쪽)
   * 카메라가 뒤로 돌려져 있어도 ↑ 버튼은 항상 같은 월드 방향을 가리킵니다.
   */
  moveCraneFixed(sx: number, sz: number, dt: number, speed: number): void {
    if (!this.isIdle()) return;
    const m = speed * dt;
    this.crane.moveTarget(sx * m, sz * m);
  }

  private onResize = () => {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    this.cameraRig.resize(width, height);
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}
