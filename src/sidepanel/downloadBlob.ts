// src/sidepanel/downloadBlob.ts
// 触发浏览器下载（仅 UI 上下文可用，不要在 background 中引用）

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
