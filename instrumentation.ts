/**
 * Next.js Instrumentation Hook
 * 服务端启动时自动初始化定时任务调度器
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getScheduler } = await import('./lib/scheduler/scheduler')
    getScheduler()
  }
}
