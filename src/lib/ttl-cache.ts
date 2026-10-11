/** In-memory cache whose entries expire. It is simply emptied once it reaches its size limit. */
export function createTtlCache<T>(ttlMs: number, maxEntries = 500) {
  const entries = new Map<string, { expiresAt: number; value: T }>();

  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      if (entries.size >= maxEntries) entries.clear();
      entries.set(key, { expiresAt: Date.now() + ttlMs, value });
    },
  };
}
