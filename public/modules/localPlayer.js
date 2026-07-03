import { createMovementState, simulateMovementTick } from './shared/movement.js';
import { TICK_DT } from './shared/constants.js';

// Client-side prediction: simulate movement locally the instant input happens
// (so it feels responsive), then reconcile against the server's authoritative
// position by replaying any inputs the server hasn't acknowledged yet.
export class LocalPlayer {
  constructor(spawn, colliders) {
    this.movement = createMovementState(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.colliders = colliders;
    this.seq = 0;
    this.pendingInputs = [];
  }

  buildInput(inputManager) {
    return {
      seq: ++this.seq,
      forward: inputManager.keys.forward,
      back: inputManager.keys.back,
      left: inputManager.keys.left,
      right: inputManager.keys.right,
      sprint: inputManager.keys.sprint,
      jump: inputManager.consumeJump(),
      dash: inputManager.consumeDash(),
      yaw: inputManager.yaw,
      pitch: inputManager.pitch,
    };
  }

  step(input) {
    this.movement = simulateMovementTick(this.movement, input, TICK_DT, this.colliders);
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > 240) this.pendingInputs.shift();
    return input;
  }

  reconcile(serverState, yourSeq) {
    this.pendingInputs = this.pendingInputs.filter((input) => input.seq > yourSeq);

    this.movement = {
      ...this.movement,
      x: serverState.x,
      y: serverState.y,
      z: serverState.z,
    };

    for (const input of this.pendingInputs) {
      this.movement = simulateMovementTick(this.movement, input, TICK_DT, this.colliders);
    }
  }
}
