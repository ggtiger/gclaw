'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  // ESC 键关闭支持
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* 内容区域 */}
      <div className="relative max-w-2xl w-full mx-4 max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl flex flex-col">
        {/* 标题栏 */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
