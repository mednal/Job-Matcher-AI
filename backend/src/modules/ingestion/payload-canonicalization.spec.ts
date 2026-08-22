import {
  canonicalizePayload,
  contentHashOf,
  stripVolatilePaths,
} from './payload-canonicalization';

describe('payload canonicalization', () => {
  describe('key ordering', () => {
    // JSON.stringify preserves insertion order, so a source that reorders its keys
    // would otherwise produce a different hash for an identical posting.
    it('hashes two differently-ordered objects identically', () => {
      const a = { title: 'Junior Dev', company: 'Acme', id: 1 };
      const b = { id: 1, company: 'Acme', title: 'Junior Dev' };

      expect(contentHashOf(a)).toBe(contentHashOf(b));
    });

    it('sorts keys at every depth', () => {
      const a = { outer: { z: 1, a: { y: 2, b: 3 } } };
      const b = { outer: { a: { b: 3, y: 2 }, z: 1 } };

      expect(canonicalizePayload(a)).toBe(canonicalizePayload(b));
    });

    it('preserves array order, which is data rather than formatting', () => {
      expect(contentHashOf({ tags: ['a', 'b'] })).not.toBe(
        contentHashOf({ tags: ['b', 'a'] }),
      );
    });
  });

  describe('volatile paths', () => {
    it('ignores a top-level volatile field', () => {
      const first = { id: 1, fetchedAt: '2026-08-22T00:00:00.000Z' };
      const second = { id: 1, fetchedAt: '2026-08-23T09:41:12.000Z' };

      expect(contentHashOf(first, ['fetchedAt'])).toBe(
        contentHashOf(second, ['fetchedAt']),
      );
    });

    it('ignores a nested volatile field addressed by a dot path', () => {
      const first = { meta: { requestId: 'r1', page: 1 }, id: 1 };
      const second = { meta: { requestId: 'r2', page: 1 }, id: 1 };

      expect(contentHashOf(first, ['meta.requestId'])).toBe(
        contentHashOf(second, ['meta.requestId']),
      );
    });

    it('still distinguishes a real change in a sibling of a volatile field', () => {
      const first = { meta: { requestId: 'r1', page: 1 }, id: 1 };
      const second = { meta: { requestId: 'r2', page: 2 }, id: 1 };

      expect(contentHashOf(first, ['meta.requestId'])).not.toBe(
        contentHashOf(second, ['meta.requestId']),
      );
    });

    it('applies a path to every element of an array', () => {
      const first = {
        items: [
          { id: 1, ts: 'a' },
          { id: 2, ts: 'a' },
        ],
      };
      const second = {
        items: [
          { id: 1, ts: 'z' },
          { id: 2, ts: 'z' },
        ],
      };

      expect(contentHashOf(first, ['items.ts'])).toBe(
        contentHashOf(second, ['items.ts']),
      );
    });

    it('is a no-op when no paths are declared', () => {
      const payload = { id: 1, fetchedAt: 'x' };

      expect(stripVolatilePaths(payload, [])).toBe(payload);
    });

    // The stored document keeps everything; only the hash looks away.
    it('never mutates the input payload', () => {
      const payload = { id: 1, meta: { requestId: 'r1' } };
      const snapshot = JSON.stringify(payload);

      contentHashOf(payload, ['meta.requestId']);

      expect(JSON.stringify(payload)).toBe(snapshot);
    });

    it('tolerates a declared path the payload does not contain', () => {
      expect(() => contentHashOf({ id: 1 }, ['meta.requestId'])).not.toThrow();
    });

    it('ignores empty segments in a path', () => {
      expect(contentHashOf({ id: 1, a: 2 }, ['a.'])).toBe(
        contentHashOf({ id: 1 }, []),
      );
    });
  });

  describe('hashing', () => {
    it('produces a hex sha256', () => {
      expect(contentHashOf({ id: 1 })).toMatch(/^[0-9a-f]{64}$/);
    });

    it('changes when any non-volatile field changes', () => {
      expect(contentHashOf({ title: 'Junior Dev' })).not.toBe(
        contentHashOf({ title: 'Senior Dev' }),
      );
    });

    it('distinguishes a null value from an absent key', () => {
      expect(contentHashOf({ a: 1, b: null })).not.toBe(
        contentHashOf({ a: 1 }),
      );
    });

    it('treats undefined values as absent, so they cannot flip a hash', () => {
      expect(contentHashOf({ a: 1, b: undefined })).toBe(
        contentHashOf({ a: 1 }),
      );
    });

    it('distinguishes a number from its string form', () => {
      expect(contentHashOf({ id: 1 })).not.toBe(contentHashOf({ id: '1' }));
    });

    it('handles primitives and arrays at the root', () => {
      expect(() => contentHashOf('a string')).not.toThrow();
      expect(() => contentHashOf([1, 2, 3])).not.toThrow();
      expect(() => contentHashOf(null)).not.toThrow();
    });

    it('serializes dates by ISO value rather than by object identity', () => {
      const iso = '2026-08-22T00:00:00.000Z';

      expect(contentHashOf({ at: new Date(iso) })).toBe(
        contentHashOf({ at: iso }),
      );
    });
  });
});
