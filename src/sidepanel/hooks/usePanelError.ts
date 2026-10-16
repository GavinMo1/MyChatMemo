// src/sidepanel/hooks/usePanelError.ts
// 面板级错误处理：识别扩展上下文失效并给出统一提示

import { useCallback, useState } from 'react';
import {
  getExtensionContextInvalidatedMessage,
  isExtensionContextInvalidatedError,
} from '@/shared/extensionContext';
import { createLogger } from '@/infrastructure/logger';

const logger = createLogger('SidePanel');

export function usePanelError() {
  const [invalidatedMessage, setInvalidatedMessage] = useState<string | null>(null);

  /**
   * 处理面板操作错误。
   * 返回 true 表示是"扩展上下文失效"（已设置提示条，调用方应直接 return）；
   * 返回 false 表示普通错误（已记日志，调用方可继续兜底处理）。
   */
  const handlePanelError = useCallback((label: string, err: unknown): boolean => {
    if (isExtensionContextInvalidatedError(err)) {
      setInvalidatedMessage(getExtensionContextInvalidatedMessage('sidepanel'));
      return true;
    }

    logger.error(label, {}, err);
    return false;
  }, []);

  return { invalidatedMessage, handlePanelError };
}
