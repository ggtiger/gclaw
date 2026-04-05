import type { Extension } from '@codemirror/state'
import {
  File,
  FileCode,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileJson,
  FileArchive,
  FileVideo,
  FileAudio,
  Folder,
  Presentation,
  BookOpen,
} from 'lucide-react'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'
import { rust } from '@codemirror/lang-rust'
import { cpp } from '@codemirror/lang-cpp'
import { php } from '@codemirror/lang-php'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'

// ─── 类型定义 ───

export interface TreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeEntry[]
}

export interface FilesPanelProps {
  projectId: string
  onToggleFullscreen?: () => void
  isFullscreen?: boolean
}

export interface MenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

// ─── 文件类型分类 ───

const CODE_EXTS = new Set([
  'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
  'css', 'scss', 'sass', 'less', 'sql', 'graphql', 'vue', 'svelte',
  'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'htm',
])

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'])

export type FileCategory = 'code' | 'image' | 'markdown' | 'html' | 'text' | 'pdf' | 'word' | 'excel' | 'ppt' | 'unknown'

export function getFileCategory(name: string): FileCategory {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (CODE_EXTS.has(ext)) return 'code'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['xls', 'xlsx'].includes(ext)) return 'excel'
  if (['ppt', 'pptx'].includes(ext)) return 'ppt'
  if (ext === 'pdf') return 'pdf'
  if (['txt', 'log', 'ini', 'cfg', 'conf', 'env'].includes(ext) || !ext) return 'text'
  return 'unknown'
}

// ─── 文件图标映射 ───

export function getFileIcon(name: string, type: 'file' | 'directory') {
  if (type === 'directory') {
    return { icon: Folder, color: 'text-blue-500' }
  }
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return { icon: FileText, color: 'text-red-500' }
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { icon: FileSpreadsheet, color: 'text-green-600' }
  if (['docx', 'doc'].includes(ext)) return { icon: BookOpen, color: 'text-blue-600' }
  if (['md', 'markdown'].includes(ext)) return { icon: BookOpen, color: 'text-gray-500' }
  if (['ppt', 'pptx'].includes(ext)) return { icon: Presentation, color: 'text-orange-500' }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return { icon: FileImage, color: 'text-purple-500' }
  if (['zip', 'gz', 'tar', 'rar', '7z'].includes(ext)) return { icon: FileArchive, color: 'text-yellow-600' }
  if (['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)) return { icon: FileVideo, color: 'text-pink-500' }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return { icon: FileAudio, color: 'text-cyan-500' }
  if (ext === 'json') return { icon: FileJson, color: 'text-yellow-500' }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'yaml', 'yml', 'sh', 'bash'].includes(ext)) {
    return { icon: FileCode, color: 'text-gray-500' }
  }
  return { icon: File, color: 'text-gray-400' }
}

// ─── CodeMirror 工具函数 ───

function getLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript',
    jsx: 'javascript', py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    kt: 'kotlin', swift: 'swift', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    php: 'php', sh: 'bash', bash: 'bash', css: 'css', scss: 'scss', sql: 'sql',
    json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', html: 'html', htm: 'html',
  }
  return map[ext] || ''
}

export function getCodeMirrorExtensions(fileName: string): Extension[] {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, () => Extension> = {
    js: () => javascript({ jsx: false }), mjs: () => javascript({ jsx: false }), cjs: () => javascript({ jsx: false }),
    ts: () => javascript({ jsx: false, typescript: true }), tsx: () => javascript({ jsx: true, typescript: true }),
    jsx: () => javascript({ jsx: true }),
    json: () => json(),
    html: () => html(), htm: () => html(),
    css: () => css(), scss: () => css(),
    md: () => markdown(), markdown: () => markdown(),
    py: () => python(),
    java: () => java(),
    go: () => go(),
    rs: () => rust(),
    c: () => cpp(), cpp: () => cpp(), h: () => cpp(), hpp: () => cpp(),
    php: () => php(),
    sql: () => sql(),
    xml: () => xml(), svg: () => xml(),
    yaml: () => yaml(), yml: () => yaml(),
  }
  const fn = langMap[ext]
  return fn ? [fn()] : []
}

export function getLanguageLabel(fileName: string): string {
  return getLanguage(fileName) || 'code'
}
