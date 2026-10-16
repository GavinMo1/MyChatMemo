// src/ui/Toast.tsx
// Toast 通知组件 - 替换原生 alert/confirm

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 淡入动画
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // 等待淡出动画
  };

  const icons = {
    success: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  const colors = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  return (
    <div
      className={`fixed top-4 right-4 z-[999999] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg transition-all duration-300 ${colors[type]} ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
      style={{ maxWidth: '400px' }}
      role="alert"
    >
      {icons[type]}
      <span className="text-sm font-medium flex-1">{message}</span>
      <button
        onClick={handleClose}
        className="ml-2 opacity-70 hover:opacity-100 transition"
        aria-label="关闭"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};

interface ConfirmDialogProps {
  message: string;
  title?: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  message,
  title,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}) => {
  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && <h3 className="text-lg font-semibold mb-3 text-gray-900">{title}</h3>}
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Toast 管理器
let toastContainer: HTMLDivElement | null = null;
let toastRoot: ReturnType<typeof createRoot> | null = null;
let activeToasts: Array<{ id: number; component: React.ReactElement }> = [];
let toastIdCounter = 0;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
    toastRoot = createRoot(toastContainer);
  }
  return { container: toastContainer, root: toastRoot! };
}

function renderToasts() {
  const { root } = getToastContainer();
  root.render(
    <>
      {activeToasts.map((toast) => (
        <React.Fragment key={toast.id}>{toast.component}</React.Fragment>
      ))}
    </>
  );
}

/**
 * 显示 Toast 通知
 */
export function showToast(options: ToastOptions): void {
  const { message, type = 'info', duration = 3000, onClose } = options;
  const id = toastIdCounter++;

  const handleClose = () => {
    activeToasts = activeToasts.filter((t) => t.id !== id);
    renderToasts();
    onClose?.();
  };

  const component = <Toast message={message} type={type} onClose={handleClose} />;
  activeToasts.push({ id, component });
  renderToasts();

  // 自动关闭
  if (duration > 0) {
    setTimeout(handleClose, duration);
  }
}

/**
 * 显示确认对话框（返回 Promise）
 */
export function showConfirm(message: string): Promise<boolean>;
export function showConfirm(options: ConfirmOptions): void;
export function showConfirm(optionsOrMessage: string | ConfirmOptions): Promise<boolean> | void {
  // 如果传入的是字符串，返回 Promise（兼容旧代码）
  if (typeof optionsOrMessage === 'string') {
    return new Promise<boolean>((resolve) => {
      const message = optionsOrMessage;
      const id = toastIdCounter++;

      const handleClose = () => {
        activeToasts = activeToasts.filter((t) => t.id !== id);
        renderToasts();
      };

      const handleConfirm = () => {
        handleClose();
        resolve(true);
      };

      const handleCancel = () => {
        handleClose();
        resolve(false);
      };

      const component = (
        <ConfirmDialog
          message={message}
          title={undefined}
          confirmText="确认"
          cancelText="取消"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      );

      activeToasts.push({ id, component });
      renderToasts();
    });
  }

  // 如果传入的是 options 对象
  const {
    message,
    title,
    confirmText = '确认',
    cancelText = '取消',
    onConfirm,
    onCancel,
  } = optionsOrMessage;

  const id = toastIdCounter++;

  const handleClose = () => {
    activeToasts = activeToasts.filter((t) => t.id !== id);
    renderToasts();
  };

  const handleConfirm = () => {
    handleClose();
    onConfirm();
  };

  const handleCancel = () => {
    handleClose();
    onCancel?.();
  };

  const component = (
    <ConfirmDialog
      message={message}
      title={title}
      confirmText={confirmText}
      cancelText={cancelText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  activeToasts.push({ id, component });
  renderToasts();
}

// 便捷方法
export const toast = {
  success: (message: string, duration?: number) =>
    showToast({ message, type: 'success', duration }),
  error: (message: string, duration?: number) => showToast({ message, type: 'error', duration }),
  warning: (message: string, duration?: number) =>
    showToast({ message, type: 'warning', duration }),
  info: (message: string, duration?: number) => showToast({ message, type: 'info', duration }),
};
