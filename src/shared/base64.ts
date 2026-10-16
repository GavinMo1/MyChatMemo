type NodeBufferLike = {
  from(
    data: Uint8Array | string,
    encoding?: string
  ): {
    toString(encoding: string): string;
    buffer: ArrayBufferLike;
    byteOffset: number;
    byteLength: number;
  };
};

function getNodeBuffer(): NodeBufferLike | undefined {
  return (globalThis as typeof globalThis & { Buffer?: NodeBufferLike }).Buffer;
}

export function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const nodeBuffer = getNodeBuffer();

  if (nodeBuffer) {
    return nodeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const nodeBuffer = getNodeBuffer();

  if (nodeBuffer) {
    const decoded = nodeBuffer.from(base64, 'base64');
    return Uint8Array.from(new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength))
      .buffer;
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
