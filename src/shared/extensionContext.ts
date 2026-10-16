export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('extension context invalidated');
}

export function getExtensionContextInvalidatedMessage(target: 'sidepanel' | 'popup'): string {
  return target === 'popup'
    ? '扩展已更新，请关闭并重新打开这个弹窗。'
    : '扩展已更新，请关闭并重新打开这个面板。';
}

export function getErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message;
    if (typeof error === 'string') return error;
    const serialized = JSON.stringify(error);
    if (typeof serialized === 'string') return serialized;
  } catch {
    // 循环对象、bigint 或自定义 toJSON 可能无法序列化。
  }
  try {
    return String(error);
  } catch {
    return '未知错误';
  }
}
