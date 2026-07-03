// Entity interpolation: buffer incoming snapshots and render slightly in the
// past, smoothly blending between the two surrounding samples. This hides
// network jitter for every player that isn't the local one.

export const INTERP_DELAY_MS = 100;

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class RemotePlayer {
  constructor(state) {
    this.id = state.id;
    this.buffer = [{ t: performance.now(), state }];
    this.render = { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch };
    this.latest = state;
  }

  pushState(state) {
    this.buffer.push({ t: performance.now(), state });
    if (this.buffer.length > 40) this.buffer.shift();
    this.latest = state;
  }

  interpolate(now) {
    const renderTime = now - INTERP_DELAY_MS;
    const buf = this.buffer;
    if (buf.length === 0) return this.render;

    if (renderTime <= buf[0].t) {
      this.render = { ...buf[0].state };
      return this.render;
    }
    const last = buf[buf.length - 1];
    if (renderTime >= last.t) {
      this.render = { ...last.state };
      return this.render;
    }

    let older = buf[0];
    let newer = last;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= renderTime && buf[i + 1].t >= renderTime) {
        older = buf[i];
        newer = buf[i + 1];
        break;
      }
    }

    const span = newer.t - older.t;
    const alpha = span > 0 ? (renderTime - older.t) / span : 0;
    this.render = {
      x: lerp(older.state.x, newer.state.x, alpha),
      y: lerp(older.state.y, newer.state.y, alpha),
      z: lerp(older.state.z, newer.state.z, alpha),
      yaw: lerpAngle(older.state.yaw, newer.state.yaw, alpha),
      pitch: lerp(older.state.pitch, newer.state.pitch, alpha),
    };
    return this.render;
  }
}
