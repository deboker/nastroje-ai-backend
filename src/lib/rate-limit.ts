type WindowConfig = {
  windowMs: number;
  max: number;
};

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

type Counter = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimiter {
  private readonly counters = new Map<string, Counter>();
  private lastCleanupAt = Date.now();

  constructor(private readonly windows: WindowConfig[]) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    this.cleanup(now);

    let retryAfterMs = 0;
    const normalizedKey = key.replace(/\s+/g, ':').slice(0, 500);

    for (const window of this.windows) {
      const counterKey = `${normalizedKey}:${window.windowMs}`;
      const current = this.counters.get(counterKey);

      if (current && current.resetAt > now && current.count >= window.max) {
        retryAfterMs = Math.max(retryAfterMs, current.resetAt - now);
      }
    }

    if (retryAfterMs > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    for (const window of this.windows) {
      const counterKey = `${normalizedKey}:${window.windowMs}`;
      const current = this.counters.get(counterKey);

      if (!current || current.resetAt <= now) {
        this.counters.set(counterKey, {
          count: 1,
          resetAt: now + window.windowMs,
        });
        continue;
      }

      current.count += 1;
    }

    return { allowed: true };
  }

  private cleanup(now: number) {
    if (now - this.lastCleanupAt < 60_000) {
      return;
    }

    this.lastCleanupAt = now;

    for (const [key, counter] of this.counters.entries()) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }
}
