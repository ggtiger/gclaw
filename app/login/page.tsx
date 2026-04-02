import { Suspense } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    }>
      <AuthPage initialMode="login" />
    </Suspense>
  )
}
