import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'

type EventType =
  | 'page_view'
  | 'drawer_open'
  | 'export_csv'
  | 'ai_question'
  | 'ai_session'
  | 'filter_change'
  | 'generate_rekomendasi'

interface TrackOptions {
  page?: string
  metadata?: Record<string, unknown>
  duration_sec?: number
}

// Fire-and-forget — tidak await, tidak block UI
function fireEvent(event_type: EventType, opts: TrackOptions = {}) {
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type,
        page: opts.page,
        metadata: opts.metadata,
        duration_sec: opts.duration_sec,
      }),
    }).catch(() => {}) // silent fail
  } catch {
    // silent fail
  }
}

// Hook utama — pasang di setiap halaman untuk track page_view + duration
export function useTracking() {
  const router   = useRouter()
  const startRef = useRef<number>(Date.now())
  const pageRef  = useRef<string>(router.pathname)

  useEffect(() => {
    const page = router.pathname
    startRef.current = Date.now()
    pageRef.current  = page

    // Track page view saat mount
    fireEvent('page_view', { page })

    // Track duration saat user meninggalkan halaman
    const handleUnload = () => {
      const duration_sec = Math.round((Date.now() - startRef.current) / 1000)
      if (duration_sec >= 3) { // minimal 3 detik dianggap meaningful
        fireEvent('page_view', { page, duration_sec, metadata: { type: 'leave' } })
      }
    }

    // Visibility change (tab switch, minimize)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleUnload()
    }

    window.addEventListener('beforeunload', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      handleUnload()
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [router.pathname])

  // Track event manual — pakai di komponen
  const track = useCallback((event_type: EventType, metadata?: Record<string, unknown>) => {
    fireEvent(event_type, { page: pageRef.current, metadata })
  }, [])

  return { track }
}

// Export fungsi standalone untuk dipakai di luar hook
export { fireEvent as trackEvent }
