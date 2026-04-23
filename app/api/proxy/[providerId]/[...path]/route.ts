/**
 * 协议代理 catch-all：静默处理 SDK 发出的非 /v1/messages 请求
 * 如 /api/event_logging/batch（遥测）等，直接返回 200 避免噪音
 */

import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  return new Response(null, { status: 200 })
}

export async function GET(request: NextRequest) {
  return new Response(null, { status: 200 })
}

export async function PUT(request: NextRequest) {
  return new Response(null, { status: 200 })
}
