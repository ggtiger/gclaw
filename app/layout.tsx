import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GClaw',
  description: 'AI Chat powered by Claude Code',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
