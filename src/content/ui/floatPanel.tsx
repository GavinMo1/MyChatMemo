// src/content/ui/floatPanel.tsx
// 悬浮面板 —— 在页面右侧覆盖一个 iframe 加载 sidepanel
// 不挤压网页内容，离开 Kimi 页面自动随 content script 卸载

import React, { useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  FLOAT_PANEL_WIDTH,
  FLOAT_PANEL_MARGIN,
  FLOAT_PANEL_MIN_WIDTH,
  FLOAT_PANEL_MAX_WIDTH,
  FLOAT_PANEL_HOST_ID,
} from '@/shared/constants';

interface FloatPanelProps {
  sidepanelUrl: string;
  visible: boolean;
  onClose: () => void;
}

const FloatPanelComponent: React.FC<FloatPanelProps> = ({ sidepanelUrl, visible, onClose }) => {
  const [, setIsResizing] = useState(false);
  const [width, setWidth] = useState(FLOAT_PANEL_WIDTH);
  const startXRef = useRef(0);
  const startWidthRef = useRef(FLOAT_PANEL_WIDTH);

  // 拖拽调整宽度
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const onMove = (ev: MouseEvent) => {
        const dx = startXRef.current - ev.clientX; // 向左拖 = 变宽
        setWidth(
          Math.max(
            FLOAT_PANEL_MIN_WIDTH,
            Math.min(FLOAT_PANEL_MAX_WIDTH, startWidthRef.current + dx)
          )
        );
      };
      const onUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width]
  );

  if (!visible) return null;

  return (
    <>
      {/* 半透明遮罩（点击关闭） */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.08)',
          zIndex: 2147483640,
          transition: 'opacity 0.2s',
        }}
      />
      {/* 面板容器 */}
      <div
        style={{
          position: 'fixed',
          top: FLOAT_PANEL_MARGIN,
          right: FLOAT_PANEL_MARGIN,
          bottom: FLOAT_PANEL_MARGIN,
          width,
          zIndex: 2147483645,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
          animation: 'mcm-slide-in 0.25s ease-out',
          background: '#ffffff',
        }}
      >
        {/* 拖拽调整宽度的把手 */}
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: 'absolute',
            left: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 10,
          }}
        />
        {/* 悬浮关闭按钮 */}
        <button
          onClick={onClose}
          title="关闭面板"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: 10,
            border: '1px solid rgba(215,224,232,0.9)',
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(10px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: '#7d8b98',
            zIndex: 12,
            boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
            transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.15s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#18212b';
            e.currentTarget.style.borderColor = '#b8c5d1';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.92)';
            e.currentTarget.style.color = '#7d8b98';
            e.currentTarget.style.borderColor = 'rgba(215,224,232,0.9)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          ✕
        </button>
        {/* iframe 加载 sidepanel */}
        <iframe
          src={sidepanelUrl}
          style={{
            flex: 1,
            border: 'none',
            width: '100%',
            background: '#fafafe',
          }}
          allow="clipboard-write"
        />
      </div>
    </>
  );
};

// ─────────────────────────────────────────
// 挂载 & 控制接口
// ─────────────────────────────────────────

export interface FloatPanelController {
  toggle: () => void;
  open: () => void;
  close: () => void;
  isVisible: () => boolean;
  destroy: () => void;
}

export function mountFloatPanel(
  onVisibilityChange?: (visible: boolean) => void
): FloatPanelController {
  // 清理旧实例
  document.getElementById(FLOAT_PANEL_HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = FLOAT_PANEL_HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // 注入动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes mcm-slide-in {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    * { box-sizing: border-box; }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  shadow.appendChild(container);

  // 获取 sidepanel 的 URL（由扩展提供）
  const sidepanelUrl = chrome.runtime.getURL('src/sidepanel/index.html');

  let _visible = false;

  const root = createRoot(container);

  function render(visible: boolean) {
    _visible = visible;
    onVisibilityChange?.(visible);
    root.render(
      <FloatPanelComponent
        sidepanelUrl={sidepanelUrl}
        visible={visible}
        onClose={() => render(false)}
      />
    );
  }

  render(false);

  return {
    toggle: () => render(!_visible),
    open: () => render(true),
    close: () => render(false),
    isVisible: () => _visible,
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
}
