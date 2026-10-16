// src/content/ui/timelineNav.tsx
// 时间线导航栏 —— 固定在页面右侧的小圆点导航
// 每个圆点对应一轮用户提问，hover 显示摘要，点击跳转，滚动自动高亮

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { TIMELINE_NAV_HOST_ID } from '@/shared/constants';
import type { BaseAdapter } from '@/content/adapters/base';
import { SmartObserver } from '@/content/smartObserver';

// ─────────────────────────────────────────
// 类型
// ─────────────────────────────────────────

interface TurnEntry {
  /** 用户消息 DOM 元素（用于滚动定位） */
  element: Element;
  /** 用户提问摘要 */
  excerpt: string;
}

// ─────────────────────────────────────────
// 常量
// ─────────────────────────────────────────

const DOT_SIZE = 8;
const MIN_RAIL_PADDING_Y = 120; // 轨道上下最小留白（px）
const MAX_RAIL_HEIGHT_RATIO = 0.62; // 轨道最多占视口高度的比例
const EXCERPT_MAX_LEN = 25; // 摘要截取长度
const SCROLL_OFFSET = 80; // 高亮判定偏移（px）

// ─────────────────────────────────────────
// 从 DOM 扫描用户消息，返回 TurnEntry[]
// ─────────────────────────────────────────

function scanUserTurns(adapter: BaseAdapter): TurnEntry[] {
  return adapter.getUserTurns().map(({ element, text }) => ({
    element,
    excerpt: text.length > EXCERPT_MAX_LEN ? text.slice(0, EXCERPT_MAX_LEN) + '…' : text,
  }));
}
// ─────────────────────────────────────────
// React 组件
// ─────────────────────────────────────────

interface TimelineNavProps {
  adapter: BaseAdapter;
}

const TimelineNavComponent: React.FC<TimelineNavProps> = ({ adapter }) => {
  const [turns, setTurns] = useState<TurnEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoverIndex, setHoverIndex] = useState(-1);

  // ── 扫描用户消息 ──
  const refreshTurns = useCallback(() => {
    setTurns(scanUserTurns(adapter));
  }, [adapter]);

  // 初始扫描 + MutationObserver
  useEffect(() => {
    refreshTurns();
    const timer = setTimeout(refreshTurns, 2000);

    const observer = new SmartObserver({
      resolveTarget: () => adapter.getObservationRoot(),
      onTrigger: refreshTurns,
      onTargetReady: refreshTurns,
    });
    observer.startObserving();

    return () => {
      clearTimeout(timer);
      observer.stop();
    };
  }, [adapter, refreshTurns]);

  // ── 滚动高亮 ──
  useEffect(() => {
    if (turns.length === 0) return;

    const onScroll = () => {
      let closest = -1;
      let closestDist = Infinity;
      turns.forEach((turn, i) => {
        const rect = turn.element.getBoundingClientRect();
        const dist = Math.abs(rect.top - SCROLL_OFFSET);
        if (rect.top < window.innerHeight && rect.bottom > 0 && dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      setActiveIndex(closest);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [turns]);

  // ── 点击跳转 ──
  const handleClick = useCallback(
    (index: number) => {
      turns[index]?.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [turns]
  );

  if (turns.length === 0) return null;

  // 计算居中且更紧凑的轨道范围，避免圆点贴近页面顶底导致难点按
  const viewportHeight = window.innerHeight;
  const preferredRailHeight = viewportHeight * MAX_RAIL_HEIGHT_RATIO;
  const railHeight = Math.min(
    Math.max(viewportHeight - MIN_RAIL_PADDING_Y * 2, 160),
    preferredRailHeight
  );
  const railTop = Math.max((viewportHeight - railHeight) / 2, MIN_RAIL_PADDING_Y);
  const railBottom = railTop;

  // 每个圆点的 Y 坐标：在中部轨道内均匀分布
  const getY = (i: number) => {
    if (turns.length === 1) return '50vh';
    const pct = i / (turns.length - 1);
    return `${railTop + pct * railHeight}px`;
  };

  return (
    <>
      {/* 轨道竖线 */}
      <div
        style={{
          position: 'fixed',
          right: 17,
          top: railTop,
          bottom: railBottom,
          width: 2,
          borderRadius: 1,
          background: 'linear-gradient(180deg, rgba(15,118,110,0.12), rgba(15,23,42,0.08))',
          zIndex: 2147483629,
          pointerEvents: 'none',
        }}
      />

      {/* 圆点 */}
      {turns.map((_turn, i) => {
        const isActive = i === activeIndex;
        const isHover = i === hoverIndex;
        return (
          <div
            key={i}
            onClick={() => handleClick(i)}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(-1)}
            style={{
              position: 'fixed',
              right: 14,
              top: getY(i),
              transform: 'translateY(-50%)',
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: '50%',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: isActive ? '#0f766e' : 'rgba(125,139,152,0.5)',
              boxShadow: isActive ? '0 0 0 4px rgba(15,118,110,0.18)' : 'none',
              zIndex: 2147483630,
              ...(isActive || isHover ? { transform: 'translateY(-50%) scale(1.5)' } : {}),
            }}
          />
        );
      })}

      {/* Tooltip — 悬浮在圆点左侧，水平横排文字框 */}
      {hoverIndex >= 0 && turns[hoverIndex] && (
        <div
          style={{
            position: 'fixed',
            right: 30,
            top: getY(hoverIndex),
            transform: 'translateY(-50%)',
            padding: '6px 12px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(15,23,42,0.88)',
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 2147483631,
            animation: 'mcm-tip-in 0.12s ease-out',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.5)', marginRight: 4 }}>#{hoverIndex + 1}</span>
          {turns[hoverIndex].excerpt}
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────
// 挂载 / 卸载接口
// ─────────────────────────────────────────

export interface TimelineNavController {
  /** 重新扫描消息列表（DOM 变化后外部可手动触发） */
  refresh: () => void;
  /** 销毁 */
  destroy: () => void;
}

export function mountTimelineNav(adapter: BaseAdapter): TimelineNavController {
  // 清理旧实例
  document.getElementById(TIMELINE_NAV_HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = TIMELINE_NAV_HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes mcm-tip-in {
      from { opacity: 0; transform: translateY(-50%) translateX(4px); }
      to   { opacity: 1; transform: translateY(-50%) translateX(0); }
    }
    * { box-sizing: border-box; }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  shadow.appendChild(container);

  let refreshFn: (() => void) | null = null;

  // 通过 key 强制 re-mount 来刷新
  let key = 0;
  function render() {
    root.render(<TimelineNavComponent key={key} adapter={adapter} />);
  }

  const root = createRoot(container);
  render();

  refreshFn = () => {
    key++;
    render();
  };

  return {
    refresh: () => refreshFn?.(),
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
}
