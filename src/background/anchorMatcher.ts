// 以消息为单位的 Rabin-Karp 锚点匹配，最多尝试 6 条消息的窗口。
// 哈希只用于筛选，必须逐条精确验证，且拒绝重复锚点。
// 16 位素数确保滚动哈希的乘积仍为精确的 JS 整数。
const MOD = 65521;
const BASE = 31;

function tokenHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * BASE + value.charCodeAt(i)) % MOD;
  }
  return hash;
}

export function findAnchorFast(
  anchorFingerprints: string[],
  storedMessages: Array<{ content: string; position: number }>
): { storedPosition: number; anchorSize: number } | null {
  const currentHashes = anchorFingerprints.slice(0, 6).map(tokenHash);
  const storedHashes = storedMessages.map((message) => tokenHash(message.content));
  for (let size = Math.min(6, currentHashes.length, storedHashes.length); size >= 1; size--) {
    let patternHash = 0;
    let windowHash = 0;
    let power = 1;
    for (let i = 0; i < size; i++) {
      patternHash = (patternHash * BASE + currentHashes[i]) % MOD;
      windowHash = (windowHash * BASE + storedHashes[i]) % MOD;
      if (i > 0) power = (power * BASE) % MOD;
    }
    let matchIndex = -1;
    for (let start = 0; start <= storedHashes.length - size; start++) {
      if (
        windowHash === patternHash &&
        anchorFingerprints
          .slice(0, size)
          .every((fingerprint, offset) => fingerprint === storedMessages[start + offset].content)
      ) {
        // 最长前缀已重复，更短的前缀也无法消除歧义。
        if (matchIndex !== -1) return null;
        matchIndex = start;
      }
      if (start < storedHashes.length - size) {
        const outgoing = (storedHashes[start] * power) % MOD;
        windowHash = ((windowHash - outgoing + MOD) * BASE + storedHashes[start + size]) % MOD;
      }
    }
    if (matchIndex !== -1) {
      return { storedPosition: storedMessages[matchIndex].position, anchorSize: size };
    }
  }
  return null;
}

/** 全文指纹；不再把前 100 个字符相同的不同消息视为同一锚点。 */
export function generateFingerprint(content: string): string {
  return content;
}
