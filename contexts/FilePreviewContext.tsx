'use client'

import { createContext, useContext } from 'react'

const FilePreviewContext = createContext<{
  previewFile: (filePath: string) => void
} | null>(null)

export const FilePreviewProvider = FilePreviewContext.Provider

export function useFilePreview() {
  return useContext(FilePreviewContext)
}
