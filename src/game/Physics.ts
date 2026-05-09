import * as CANNON from 'cannon-es';
import { PHYSICS } from '../config/game';

export class Physics {
  readonly world: CANNON.World;
  readonly defaultMaterial: CANNON.Material;
  readonly clawMaterial: CANNON.Material;
  private accumulator = 0;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 10;

    this.defaultMaterial = new CANNON.Material('default');
    this.clawMaterial = new CANNON.Material('claw');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.defaultMaterial, this.defaultMaterial, {
        friction: PHYSICS.friction,
        restitution: PHYSICS.restitution,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.defaultMaterial, this.clawMaterial, {
        friction: 0.9,
        restitution: 0,
      }),
    );
  }

  step(dt: number): void {
    // 가변 프레임 → 고정 step 으로 누적해서 시뮬레이션 안정성 확보
    this.accumulator += Math.min(dt, 0.05);
    while (this.accumulator >= PHYSICS.timeStep) {
      this.world.step(PHYSICS.timeStep);
      this.accumulator -= PHYSICS.timeStep;
    }
  }
}
