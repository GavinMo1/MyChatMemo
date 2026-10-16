// src/popup/Popup.tsx
// 浏览器图标弹窗 —— 研究工作台风格

import React, { useEffect, useState } from 'react';
import * as ipc from '@/browser/ipc';
import type { ConversationMeta } from '@/types';
import { PLATFORM_LABELS } from '@/shared/constants';
import { BrandGlyph, MessageSquareIcon, SparkIcon } from '@/ui/icons';
import {
  getExtensionContextInvalidatedMessage,
  isExtensionContextInvalidatedError,
} from '@/shared/extensionContext';
import { createLogger } from '@/infrastructure/logger';

const logger = createLogger('Popup');

const Popup: React.FC = () => {
  const [recentConvs, setRecentConvs] = useState<ConversationMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [invalidatedMessage, setInvalidatedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (invalidatedMessage) return;

    ipc
      .listConversations()
      .then((list) => setRecentConvs(list.slice(0, 5)))
      .catch((err) => {
        if (isExtensionContextInvalidatedError(err)) {
          setInvalidatedMessage(getExtensionContextInvalidatedMessage('popup'));
          return;
        }
        logger.error('加载最近对话失败', {}, err);
      })
      .finally(() => setIsLoading(false));
  }, [invalidatedMessage]);

  return (
    <div className="min-w-[320px] p-4">
      <div className="overflow-hidden rounded-[26px] border border-[var(--c-border)] bg-[var(--c-card)] shadow-[var(--c-shadow)] backdrop-blur-md">
        <div className="border-b border-[var(--c-border)] bg-[linear-gradient(135deg,rgba(15,118,110,.14),rgba(255,255,255,.94))] px-5 py-5">
          <div className="flex items-start gap-3">
            <BrandGlyph className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="m-0 text-[18px] font-semibold tracking-[0.01em] text-[var(--c-text)]">
                  MyChatMemo
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--c-brand)]">
                  <SparkIcon size={11} />
                  Lab
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[var(--c-text-2)]">
                用研究工作台的方式浏览、检索和归档 AI 对话。
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-3)]">
              最近保存
            </div>
            <div className="text-[11px] font-mono text-[var(--c-text-3)]">
              {recentConvs.length} items
            </div>
          </div>

          {invalidatedMessage ? (
            <div className="rounded-[18px] border border-[rgba(245,158,11,.24)] bg-[rgba(245,158,11,.08)] px-4 py-4 text-[13px] leading-6 text-[var(--c-text-2)]">
              {invalidatedMessage}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-[18px] border border-[var(--c-border)] bg-white/75 px-4 py-8 text-[13px] text-[var(--c-text-3)]">
              <span className="animate-pulse">·</span>
              <span>加载中…</span>
            </div>
          ) : recentConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] border border-[var(--c-border)] bg-white/75 px-4 py-8 text-center text-[13px] text-[var(--c-text-3)]">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-brand)]">
                <MessageSquareIcon size={20} />
              </span>
              <span>还没有保存的对话</span>
            </div>
          ) : (
            <ul className="m-0 space-y-2 p-0 list-none">
              {recentConvs.map((conv) => (
                <li
                  key={conv.id}
                  className="rounded-[18px] border border-[var(--c-border)] bg-white/88 px-3.5 py-3 shadow-[0_8px_16px_rgba(15,23,42,.04)]"
                >
                  <div className="truncate text-[13px] font-semibold text-[var(--c-text)]">
                    {conv.title || '无标题'}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--c-text-3)]">
                    <span className="rounded-full bg-[rgba(15,118,110,.12)] px-2 py-1 font-semibold text-[var(--c-brand)]">
                      {PLATFORM_LABELS[conv.platform] ?? conv.platform}
                    </span>
                    <span>{conv.stats.messageCount} 条消息</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Popup;
