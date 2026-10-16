import { describe, expect, it } from 'vitest';
import { decodeBase64ToArrayBuffer, encodeArrayBufferToBase64 } from '@/shared/base64';

describe('base64 helpers', () => {
  it('round-trips zip binary payloads through a string-safe format', () => {
    const source = Uint8Array.from([80, 75, 3, 4, 20, 0, 8, 0, 8, 0]);
    const encoded = encodeArrayBufferToBase64(source.buffer);
    const decoded = new Uint8Array(decodeBase64ToArrayBuffer(encoded));

    expect(Array.from(decoded)).toEqual(Array.from(source));
  });
});
