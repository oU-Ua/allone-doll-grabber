import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA } from '../config/game';

export type CameraPreset = 'front' | 'side' | 'top' | 'diagonal';

/**
 * OrbitControls 기반 카메라.
 * - 사용자 드래그(마우스/터치) → 궤도 회전
 * - 휠/핀치 → 줌
 * - 사전 설정 뷰 / 자동 회전 / 커스텀 앵글 저장 지원
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(width: number, height: number, dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);

    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.7;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 6;
    // 바닥 아래로 내려가지 않도록, 그리고 완전 위에서만 보지 않도록 제한
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    // OrbitControls 자체 자동회전 사용
    this.controls.autoRotateSpeed = 1.6;

    this.applyPreset('front', true);
  }

  applyPreset(name: CameraPreset, _instant = true): void {
    const p = CAMERA.presets[name];
    this.camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
    this.controls.target.set(p.look[0], p.look[1], p.look[2]);
    this.controls.autoRotate = false;
    this.controls.update();
  }

  applyCustom(view: { pos: [number, number, number]; look: [number, number, number] }, _instant = true): void {
    this.camera.position.set(view.pos[0], view.pos[1], view.pos[2]);
    this.controls.target.set(view.look[0], view.look[1], view.look[2]);
    this.controls.autoRotate = false;
    this.controls.update();
  }

  captureCurrent(): { pos: [number, number, number]; look: [number, number, number] } {
    return {
      pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      look: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    };
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }
  get autoRotate(): boolean {
    return this.controls.autoRotate;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(_dt: number): void {
    this.controls.update();
  }
}
