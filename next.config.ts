import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    '@anthropic-ai/claude-agent-sdk',
    'child_process',
  ],
  // 远程部署时启用 CORS（设置环境变量 GCLAW_CORS_ENABLED=true）
  async headers() {
    if (process.env.GCLAW_CORS_ENABLED !== 'true') return []
    return [{
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
      ],
    }]
  },
}

export default nextConfig
