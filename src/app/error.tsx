'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  // Never surface arbitrary Error.message/stack to the browser — Next.js can pass
  // internal + DB detail strings here. Log for diagnosis, show a generic message.
  if (typeof console !== 'undefined') {
    console.error('App error boundary caught:', error)
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Something went wrong!</h1>
        <p className="text-gray-600 mb-8">We couldn&apos;t load this page. Please try again.</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
