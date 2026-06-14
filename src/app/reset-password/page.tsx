import { Suspense } from 'react'
import ResetPasswordForm from './ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="animate-pulse text-blue-300">Loading...</div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
