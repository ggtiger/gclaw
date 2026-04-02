import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    '@anthropic-ai/claude-agent-sdk',
    'child_process',
  ],
}

export default nextConfig
