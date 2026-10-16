// src/sidepanel/components/ConversationDetail.tsx

import React, { useEffect, useMemo, useState } from 'react';
import type { ConversationWithMessages, Message } from '@/types';
import {
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  TrashIcon,
} from '@/ui/icons';

interface Props {
  conversation: ConversationWithMessages;
  onDeleteMessage: (conversationId: string, messageId: string) => void | Promise<void>;
}

const COLLAPSE_CHAR_THRESHOLD = 320;
const COLLAPSE_LINE_THRESHOLD = 8;

const ConversationDetail: React.FC<Props> = ({ conversation, onDeleteMessage }) => {
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const messages = useMemo(
    () => [...conversation.messages].sort((a, b) => a.metadata.position - b.metadata.position),
    [conversation.messages]
  );
  const messageIds = messages.map((message) => message.id).join('|');

  useEffect(() => {
    setExpandedThinking(new Set());
    setExpandedMessages(new Set());
  }, [conversation.id, messageIds]);

  const toggleThinking = (id: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleMessage = (id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 p-5 animate-slideUp">
      <div className="rounded-[22px] border border-[var(--c-border)] bg-white/85 px-4 py-4 shadow-[var(--c-shadow-soft)]">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--c-text-3)]">
          <span className="rounded-full bg-[var(--c-surface)] px-3 py-1.5 font-medium text-[var(--c-text-2)]">
            共 {messages.length} 条消息
          </span>
        </div>
        <a
          href={conversation.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-[13px] font-medium text-[var(--c-brand)] transition hover:text-[var(--c-brand-dark)]"
        >
          <ExternalLinkIcon size={14} />
          原始链接
        </a>
      </div>

      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          conversationId={conversation.id}
          message={message}
          thinkingExpanded={expandedThinking.has(message.id)}
          messageExpanded={expandedMessages.has(message.id)}
          onToggleThinking={() => toggleThinking(message.id)}
          onToggleMessage={() => toggleMessage(message.id)}
          onDelete={() => onDeleteMessage(conversation.id, message.id)}
        />
      ))}
    </div>
  );
};

interface BubbleProps {
  conversationId: string;
  message: Message;
  thinkingExpanded: boolean;
  messageExpanded: boolean;
  onToggleThinking: () => void;
  onToggleMessage: () => void;
  onDelete: () => void | Promise<void>;
}

const MessageBubble: React.FC<BubbleProps> = ({
  message,
  thinkingExpanded,
  messageExpanded,
  onToggleThinking,
  onToggleMessage,
  onDelete,
}) => {
  const isUser = message.sender === 'user';
  const isLongMessage = shouldCollapseMessage(message);
  const isCollapsed = isLongMessage && !messageExpanded;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-[22px] px-4 py-3.5 text-[14px] leading-7 whitespace-pre-wrap break-words shadow-[var(--c-shadow-soft)] ${
          isUser
            ? 'rounded-tr-md border border-[rgba(20,78,99,.24)] bg-[linear-gradient(135deg,var(--c-brand),var(--c-brand-dark))] text-white'
            : 'rounded-tl-md border border-[var(--c-border)] bg-white/92 text-[var(--c-text)]'
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isUser ? 'text-white/65' : 'text-[var(--c-text-3)]'}`}
          >
            {isUser ? '用户消息' : 'AI 回复'}
          </span>
          <button
            onClick={() => void onDelete()}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition ${
              isUser
                ? 'border-white/12 text-white/70 hover:bg-white/10 hover:text-white'
                : 'border-[var(--c-border)] text-[var(--c-text-3)] hover:border-[rgba(220,38,38,.18)] hover:bg-[rgba(220,38,38,.06)] hover:text-[var(--c-danger)]'
            }`}
            title="删除这条消息"
          >
            <TrashIcon size={14} />
          </button>
        </div>

        {message.thinking && (
          <div className="mb-3">
            <button
              onClick={onToggleThinking}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                isUser
                  ? 'border-white/20 text-white/85 hover:bg-white/10'
                  : 'border-[var(--c-border)] text-[var(--c-text-2)] hover:bg-[var(--c-surface)]'
              }`}
            >
              <BrainIcon size={13} />
              {thinkingExpanded ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
              {thinkingExpanded ? '隐藏思考过程' : '查看思考过程'}
            </button>
            {thinkingExpanded && (
              <div
                className={`mt-3 rounded-2xl border px-3 py-3 text-[12px] leading-6 italic whitespace-pre-wrap ${
                  isUser
                    ? 'border-white/15 bg-white/10 text-white/75'
                    : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-3)]'
                }`}
              >
                {message.thinking}
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <div className={isCollapsed ? 'max-h-[15rem] overflow-hidden' : ''}>
            {message.content}
          </div>
          {isCollapsed && (
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 ${
                isUser
                  ? 'bg-[linear-gradient(180deg,rgba(15,118,110,0),rgba(22,78,99,.94))]'
                  : 'bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.98))]'
              }`}
            />
          )}
        </div>

        {isLongMessage && (
          <button
            onClick={onToggleMessage}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
              isUser
                ? 'border-white/18 text-white/85 hover:bg-white/10'
                : 'border-[var(--c-border)] text-[var(--c-text-2)] hover:bg-[var(--c-surface)]'
            }`}
          >
            {messageExpanded ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
            {messageExpanded ? '收起全文' : '展开全文'}
          </button>
        )}

        <div
          className={`mt-2 text-right font-mono text-[10px] tracking-[0.08em] ${isUser ? 'text-white/55' : 'text-[var(--c-text-3)]'}`}
        >
          {new Date(message.updatedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
};

function shouldCollapseMessage(message: Message): boolean {
  const lineCount = message.content.split('\n').length;
  return message.content.length > COLLAPSE_CHAR_THRESHOLD || lineCount > COLLAPSE_LINE_THRESHOLD;
}

export default ConversationDetail;
