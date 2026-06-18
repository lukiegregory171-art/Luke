/**
 * Generic object pool (P1). Pre-allocates reusable instances so hot-path systems
 * — tracers, particles, decals, damage numbers — never allocate per shot/frame
 * (no GC churn mid-match). Acquire on use, release when done; `created` only
 * grows when demand exceeds the pool, so steady-state reuse allocates nothing.
 *
 * Client-only presentation helper; touches no game state.
 */

export class Pool<T> {
  private readonly free: T[] = [];
  private readonly active = new Set<T>();
  /** Total instances ever created — stays flat once warmed (the reuse proof). */
  created = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.make());
  }

  private make(): T {
    this.created++;
    return this.factory();
  }

  acquire(): T {
    const item = this.free.pop() ?? this.make();
    this.active.add(item);
    return item;
  }

  release(item: T): void {
    if (this.active.delete(item)) {
      this.reset(item);
      this.free.push(item);
    }
  }

  /** Release everything currently active (e.g. on match end). */
  releaseAll(): void {
    for (const item of [...this.active]) this.release(item);
  }

  forEachActive(fn: (item: T) => void): void {
    this.active.forEach(fn);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get freeCount(): number {
    return this.free.length;
  }
}
