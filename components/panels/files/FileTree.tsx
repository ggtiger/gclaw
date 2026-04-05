'use client'

import { useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { TreeEntry, MenuItem } from './types'

import { getFileIcon } from './types'

export function FileIconSm({ name, type }: { name: string; type: 'file' | 'directory' }) {
  const c = getFileIcon(name, type)
  const Icon = c.icon
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 shrink-0">
      <Icon size={15} className={c.color} />
    </span>
  )
}

// ─── 右键菜单 ───

function ContextMenu({
  x, y, items, onClose,
}: {
  x: number; y: number; items: MenuItem[]; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // 位置修正：防止超出视口
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) el.style.left = `${window.innerWidth - rect.width - 8}px`
    if (rect.bottom > window.innerHeight) el.style.top = `${window.innerHeight - rect.height - 8}px`
  }, [x, y])

  return createPortal(
    <>
      {/* 全屏透明遮罩：点击/右键关闭菜单 */}
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      {/* 菜单面板 */}
      <div ref={ref} className="fixed rounded-lg shadow-xl border py-1 animate-fade-in" style={{ left: x, top: y, minWidth: 150, zIndex: 9999, backgroundColor: 'var(--color-surface)' }}>
        {items.map((item, i) => (
          <button key={i}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: item.danger ? 'var(--color-error)' : 'var(--color-text)' }}
            onClick={e => { e.stopPropagation(); item.onClick(); onClose() }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body
  )
}

export { ContextMenu }

// ─── 树视图节点 ───

interface TreeViewProps {
  entries: TreeEntry[]
  selectedPath: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (entry: TreeEntry) => void
  onContextMenu: (e: React.MouseEvent, entry: TreeEntry) => void
  renamingPath: string | null
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
  renameInputRef: React.RefObject<HTMLInputElement | null>
  searchQuery: string
  level: number
  // 拖拽视觉反馈
  draggedPath: string | null
  dropTargetPath: string | null
}

function matchesSearch(entry: TreeEntry, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (entry.name.toLowerCase().includes(q)) return true
  if (entry.type === 'directory' && entry.children) {
    return entry.children.some(c => matchesSearch(c, q))
  }
  return false
}

export const TreeView = memo(function TreeView({
  entries, selectedPath, expandedFolders, onToggleFolder, onSelectFile,
  onContextMenu, renamingPath, renameValue, onRenameChange, onRenameConfirm,
  onRenameCancel, renameInputRef, searchQuery, level,
  draggedPath, dropTargetPath,
}: TreeViewProps) {
  const filtered = searchQuery ? entries.filter(e => matchesSearch(e, searchQuery)) : entries

  return (
    <>
      {filtered.map((entry) => {
        const isExpanded = expandedFolders.has(entry.path)
        const isSelected = selectedPath === entry.path
        const isRenaming = renamingPath === entry.path
        const paddingLeft = 8 + level * 14
        const isDragged = draggedPath === entry.path

        if (entry.type === 'directory') {
          const isDropTarget = dropTargetPath === entry.path && draggedPath !== entry.path
          return (
            <div key={entry.path}>
              <div
                data-entry-path={entry.path}
                data-entry-type="directory"
                className="flex items-center gap-1 py-[3px] pr-2 cursor-pointer transition-colors group"
                style={{
                  paddingLeft,
                  backgroundColor: isDropTarget
                    ? 'var(--color-primary-subtle)'
                    : isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                  outline: isDropTarget ? '1.5px dashed var(--color-primary)' : 'none',
                  borderRadius: isDropTarget ? 3 : 0,
                  opacity: isDragged ? 0.4 : 1,
                }}
                onClick={() => onToggleFolder(entry.path)}
                onContextMenu={e => onContextMenu(e, entry)}
                onMouseEnter={e => { if (!isSelected && !isDropTarget) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseLeave={e => { if (!isSelected && !isDropTarget) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {isExpanded
                  ? <ChevronDown size={12} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                  : <ChevronRight size={12} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                }
                <FileIconSm name={entry.name} type="directory" />
                <span className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{entry.name}</span>
              </div>
              {isExpanded && entry.children && (
                <TreeView
                  entries={entry.children}
                  selectedPath={selectedPath}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                  onContextMenu={onContextMenu}
                  renamingPath={renamingPath}
                  renameValue={renameValue}
                  onRenameChange={onRenameChange}
                  onRenameConfirm={onRenameConfirm}
                  onRenameCancel={onRenameCancel}
                  renameInputRef={renameInputRef}
                  searchQuery={searchQuery}
                  level={level + 1}
                  draggedPath={draggedPath}
                  dropTargetPath={dropTargetPath}
                />
              )}
            </div>
          )
        }

        return (
          <div
            key={entry.path}
            data-entry-path={entry.path}
            data-entry-type="file"
            className="flex items-center gap-1 py-[3px] pr-2 cursor-pointer transition-colors group"
            style={{
              paddingLeft: paddingLeft + 12,
              backgroundColor: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
              opacity: isDragged ? 0.4 : 1,
            }}
            onClick={() => onSelectFile(entry)}
            onContextMenu={e => onContextMenu(e, entry)}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <FileIconSm name={entry.name} type="file" />
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => onRenameChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onRenameConfirm(); if (e.key === 'Escape') onRenameCancel() }}
                onBlur={onRenameConfirm}
                className="text-sm bg-transparent border-b outline-none flex-1 min-w-0"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{entry.name}</span>
            )}
          </div>
        )
      })}
    </>
  )
})
