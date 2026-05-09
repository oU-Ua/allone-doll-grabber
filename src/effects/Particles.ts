import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

/**
 * 가벼운 파티클 시스템 — 외부 라이브러리 없이 Points 한 개로 모든 파티클을 관리.
 * 성공/실패 등 짧은 이펙트용. 동시 최대 ~512개.
 */
export class Particles {
  readonly object: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geometry: THREE.BufferGeometry;
  private maxParticles: number;

  constructor(maxParticles = 512) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setDrawRange(0, 0);

    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: this.makeSpriteTexture(),
    });

    this.object = new THREE.Points(this.geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
  }

  private makeSpriteTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.65)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  /** 성공 폭죽 — 색색 별이 위로 솟구침 */
  burstSuccess(at: THREE.Vector3): void {
    const palette = [0xffd23f, 0xff5fa2, 0x6affff, 0x4ef88f, 0xffffff];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 1.8;
      const elev = 0.6 + Math.random() * 1.4;
      this.spawn({
        pos: at.clone(),
        vel: new THREE.Vector3(Math.cos(angle) * speed, elev, Math.sin(angle) * speed),
        life: 0,
        maxLife: 0.9 + Math.random() * 0.5,
        size: 0.06 + Math.random() * 0.06,
        color: new THREE.Color(palette[(Math.random() * palette.length) | 0]),
      });
    }
  }

  /** 실패 — 회색 먼지가 옆으로 흩어짐 */
  burstFail(at: THREE.Vector3): void {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 0.7;
      this.spawn({
        pos: at.clone(),
        vel: new THREE.Vector3(Math.cos(angle) * speed, 0.4 + Math.random() * 0.4, Math.sin(angle) * speed),
        life: 0,
        maxLife: 0.5 + Math.random() * 0.3,
        size: 0.04 + Math.random() * 0.04,
        color: new THREE.Color(0xc0c4d0),
      });
    }
  }

  /** 잡기 시도 시 집게 부근 스파크 */
  burstClose(at: THREE.Vector3): void {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 0.6;
      this.spawn({
        pos: at.clone(),
        vel: new THREE.Vector3(Math.cos(angle) * speed, -0.2 + Math.random() * 0.4, Math.sin(angle) * speed),
        life: 0,
        maxLife: 0.3 + Math.random() * 0.2,
        size: 0.03 + Math.random() * 0.03,
        color: new THREE.Color(0xffe7b3),
      });
    }
  }

  private spawn(p: Particle): void {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  update(dt: number): void {
    const survivors: Particle[] = [];
    const g = -3.5; // 중력
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vel.y += g * dt;
      p.vel.multiplyScalar(0.985);
      p.pos.addScaledVector(p.vel, dt);
      survivors.push(p);
    }
    this.particles = survivors;

    const n = Math.min(this.particles.length, this.maxParticles);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      const fade = 1 - p.life / p.maxLife;
      this.positions[i * 3 + 0] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      this.colors[i * 3 + 0] = p.color.r * fade;
      this.colors[i * 3 + 1] = p.color.g * fade;
      this.colors[i * 3 + 2] = p.color.b * fade;
      this.sizes[i] = p.size * fade;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
  }
}
