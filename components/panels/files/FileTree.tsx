'use client'

import { useState, useEffect, useRef, memo } from 'react'
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
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])

  return (
    <div ref={ref} className="fixed z-50 rounded-lg shadow-xl border py-1 animate-fade-in" style={{ left: x, top: y, minWidth: 150, backgroundColor: 'var(--color-surface)' }} onClick={e => e.stopPropagation()}>
      {items.map((item, i) => (
        <button key={i} onClick={() => { item.onClick(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer"
          style={{ color: item.danger ? 'var(--color-error)' : 'var(--color-text)' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {item.icon} {item.label}
        </button>
      ))}
    </div>
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
}: TreeViewProps) {
  const filtered = searchQuery ? entries.filter(e => matchesSearch(e, searchQuery)) : entries

  return (
    <>
      {filtered.map((entry) => {
        const isExpanded = expandedFolders.has(entry.path)
        const isSelected = selectedPath === entry.path
        const isRenaming = renamingPath === entry.path
        const paddingLeft = 8 + level * 14

        if (entry.type === 'directory') {
          return (
            <div key={entry.path}>
              <div
                className="flex items-center gap-1 py-[3px] pr-2 cursor-pointer transition-colors group"
                style={{ paddingLeft, backgroundColor: isSelected ? 'var(--color-primary-subtle)' : 'transparent' }}
                onClick={() => onToggleFolder(entry.path)}
                onContextMenu={e => onContextMenu(e, entry)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
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
                />
              )}
            </div>
          )
        }

        return (
          <div
            key={entry.path}
            className="flex items-center gap-1 py-[3px] pr-2 cursor-pointer transition-colors group"
            style={{ paddingLeft: paddingLeft + 12, backgroundColor: isSelected ? 'var(--color-primary-subtle)' : 'transparent' }}
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
