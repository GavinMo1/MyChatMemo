// src/content/ui/floatButton.tsx
// 悬浮状态球 —— 使用 Shadow DOM 实现 CSS 完全隔离
// 与架构文档 §9.1 保持一致

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionType } from '@/shared/protocol';
import { BADGE_STATE_EVENT, BADGE_RESET_DELAY, FLOAT_BUTTON_HOST_ID } from '@/shared/constants';
import type { BadgeStatePayload } from '@/types';
import { BrandGlyph, CheckIcon, LoaderIcon, XIcon } from '@/ui/icons';

type BadgeState = BadgeStatePayload['state'];

// ─────────────────────────────────────────
// 悬浮球 React 组件
// ─────────────────────────────────────────

interface FloatButtonProps {
  onToggleSidebar?: () => void;
  visible: boolean;
}

const BTN_SIZE = 36;

const FloatButtonComponent: React.FC<FloatButtonProps> = ({ onToggleSidebar, visible }) => {
  const [status, setStatus] = useState<BadgeState>('idle');
  const [tooltip, setTooltip] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({
    x: window.innerWidth - BTN_SIZE - 26,
    y: window.innerHeight - BTN_SIZE - 80,
  });
  const dragStartRef = React.useRef({ mouseX: 0, mouseY: 0, elX: 0, elY: 0 });
  const hasDragged = React.useRef(false);

  // 监听来自 Background 的状态更新（同步成功/失败）
  useEffect(() => {
    const fromBackground = (msg: { type: ActionType; payload?: BadgeStatePayload }) => {
      if (msg.type === ActionType.BG_CMD_UPDATE_BADGE_STATE && msg.payload) {
        setStatus(msg.payload.state);
        if (msg.payload.message) setTooltip(msg.payload.message);
        if (msg.payload.state === 'success' || msg.payload.state === 'error') {
          setTimeout(() => setStatus('idle'), BADGE_RESET_DELAY);
        }
      }
    };
    // 监听页面内直接事件（来自 syncManager 的 sendBadgeState）
    const fromPage = (e: Event) => {
      const payload = (e as CustomEvent<BadgeStatePayload>).detail;
      if (!payload) return;
      setStatus(payload.state);
      if (payload.message) setTooltip(payload.message);
      if (payload.state === 'success' || payload.state === 'error') {
        setTimeout(() => setStatus('idle'), BADGE_RESET_DELAY);
      }
    };
    chrome.runtime.onMessage.addListener(fromBackground);
    window.addEventListener(BADGE_STATE_EVENT, fromPage);
    return () => {
      chrome.runtime.onMessage.removeListener(fromBackground);
      window.removeEventListener(BADGE_STATE_EVENT, fromPage);
    };
  }, []);

  // 拖拽逻辑
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      hasDragged.current = false;
      dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, elX: pos.x, elY: pos.y };
      setIsDragging(true);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - dragStartRef.current.mouseX;
        const dy = ev.clientY - dragStartRef.current.mouseY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged.current = true;
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - BTN_SIZE, dragStartRef.current.elX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - BTN_SIZE, dragStartRef.current.elY + dy)),
        });
      };
      const onUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [pos]
  );

  const handleClick = () => {
    if (hasDragged.current) return;
    onToggleSidebar?.();
  };

  const stateStyles: Record<BadgeState, string> = {
    idle: 'background:linear-gradient(135deg, #0f766e, #164e63);',
    extracting: 'background:linear-gradient(135deg, #f59e0b, #d97706);',
    syncing: 'background:linear-gradient(135deg, #0891b2, #0f766e);',
    success: 'background:linear-gradient(135deg, #0f9d7a, #0f766e);',
    error: 'background:linear-gradient(135deg, #dc2626, #991b1b);',
  };

  if (!visible) return null;

  return (
    <div
      role="button"
      aria-label={tooltip || stateLabels[status]}
      title={tooltip || stateLabels[status]}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: BTN_SIZE,
        height: BTN_SIZE,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: 2147483647,
        boxShadow:
          status === 'idle' ? '0 18px 32px rgba(15,118,110,.28)' : '0 18px 32px rgba(15,23,42,.22)',
        userSelect: 'none',
        color: '#fff',
        fontWeight: 700,
        border: '1px solid rgba(255,255,255,0.18)',
        transition: 'background 0.3s, box-shadow 0.3s, opacity 0.25s, transform 0.25s',
        ...parseStyleString(stateStyles[status]),
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {renderStateIcon(status)}
      </div>
    </div>
  );
};

const stateLabels: Record<BadgeState, string> = {
  idle: 'MyChatMemo - 点击打开记忆库',
  extracting: '正在提取消息…',
  syncing: '正在同步中…',
  success: '保存成功！',
  error: '保存失败',
};

function parseStyleString(style: string): React.CSSProperties {
  const result: Record<string, string> = {};
  style
    .split(';')
    .filter(Boolean)
    .forEach((part) => {
      const [k, v] = part.split(':').map((s) => s.trim());
      if (k && v) {
        // camelCase
        const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        result[camel] = v;
      }
    });
  return result as React.CSSProperties;
}

function renderStateIcon(status: BadgeState): React.ReactNode {
  if (status === 'idle') {
    return <BrandGlyph className="h-5 w-5" />;
  }

  if (status === 'success') {
    return <CheckIcon size={16} />;
  }

  if (status === 'error') {
    return <XIcon size={16} />;
  }

  return <LoaderIcon size={16} className="animate-spin-slow" />;
}

// ─────────────────────────────────────────
// 挂载函数：Shadow DOM 注入
// ─────────────────────────────────────────

export interface FloatButtonController {
  show: () => void;
  hide: () => void;
  destroy: () => void;
}

export function mountFloatButton(onToggleSidebar: () => void): FloatButtonController {
  // 清理已有实例
  document.getElementById(FLOAT_BUTTON_HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = FLOAT_BUTTON_HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // 注入旋转动画
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes mcm-float-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04); }
    }
    * { box-sizing: border-box; }
    .animate-spin-slow { animation: spin 1s linear infinite; }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  shadow.appendChild(container);

  let _visible = true;
  const root = createRoot(container);

  function render(visible: boolean) {
    _visible = visible;
    root.render(<FloatButtonComponent onToggleSidebar={onToggleSidebar} visible={visible} />);
  }

  render(true);

  return {
    show: () => render(true),
    hide: () => render(false),
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
}
