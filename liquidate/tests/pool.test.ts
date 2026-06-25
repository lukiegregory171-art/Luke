/**
 * The object pool is the core of P1's "no per-shot allocations" promise, so we
 * prove the property directly: once warmed, a steady acquire→release cycle never
 * constructs a new instance (`created` stays flat). If a refactor reintroduces
 * per-shot `new`, this test fails.
 */

import { describe, expect, it } from 'vitest';
import { Pool } from '../client/src/pool';

describe('Pool', () => {
  it('prewarms the requested number of free instances', () => {
    let made = 0;
    const pool = new Pool(
      () => ({ id: made++ }),
      () => {},
      4,
    );
    expect(pool.created).toBe(4);
    expect(pool.freeCount).toBe(4);
    expect(pool.activeCount).toBe(0);
  });

  it('reuses released instances instead of allocating (no per-shot churn)', () => {
    const pool = new Pool<{ used: boolean }>(
      () => ({ used: false }),
      (o) => (o.used = false),
      2,
    );
    expect(pool.created).toBe(2);

    // A burst that never exceeds the pool size should allocate nothing new.
    for (let i = 0; i < 1000; i++) {
      const a = pool.acquire();
      a.used = true;
      pool.release(a);
    }
    expect(pool.created).toBe(2);

    // Two simultaneous live instances still fit the prewarm — still no growth.
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.created).toBe(2);
    pool.release(a);
    pool.release(b);
  });

  it('grows only when live demand exceeds the pool, then reuses the larger set', () => {
    const pool = new Pool<object>(
      () => ({}),
      () => {},
      1,
    );
    const a = pool.acquire(); // uses the prewarmed one
    const b = pool.acquire(); // exceeds pool -> one allocation
    const c = pool.acquire(); // exceeds pool -> one allocation
    expect(pool.created).toBe(3);
    expect(pool.activeCount).toBe(3);

    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);

    // The peak (3) is now cached; a 3-wide burst allocates nothing further.
    pool.acquire();
    pool.acquire();
    pool.acquire();
    expect(pool.created).toBe(3);
    void a;
    void b;
    void c;
  });

  it('runs reset on release and ignores double/foreign releases', () => {
    let resets = 0;
    const pool = new Pool<{ n: number }>(
      () => ({ n: 0 }),
      (o) => {
        o.n = 0;
        resets++;
      },
      0,
    );
    const item = pool.acquire();
    item.n = 5;
    pool.release(item);
    expect(item.n).toBe(0);
    expect(resets).toBe(1);

    // Releasing again (already free) is a no-op: no extra reset, no bad state.
    pool.release(item);
    expect(resets).toBe(1);
    expect(pool.freeCount).toBe(1);

    // A foreign object was never acquired -> ignored.
    pool.release({ n: 99 });
    expect(resets).toBe(1);
  });

  it('iterates only active instances', () => {
    const pool = new Pool<{ tag: string }>(
      () => ({ tag: '' }),
      () => {},
      0,
    );
    const a = pool.acquire();
    a.tag = 'a';
    const b = pool.acquire();
    b.tag = 'b';
    pool.release(a);

    const seen: string[] = [];
    pool.forEachActive((o) => seen.push(o.tag));
    expect(seen).toEqual(['b']);
  });
});
