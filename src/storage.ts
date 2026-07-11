import { useEffect, useRef, useState } from 'react'

export function useStoredState<T>(key: string, initialValue: T) {
  const hydrated = useRef(false)
  const initialRef = useRef(initialValue)
  const [value, setValue] = useState<T>(initialValue)

  useEffect(() => {
    let cancelled = false

    async function loadFromBackend() {
      try {
        const response = await fetch(`/api/state/${encodeURIComponent(key)}`)
        if (!response.ok) throw new Error('Backend unavailable')

        const payload = (await response.json()) as {
          exists: boolean
          value: T | null
        }

        if (!cancelled && payload.exists) {
          setValue(payload.value as T)
        }

        if (!cancelled && !payload.exists) {
          await fetch(`/api/state/${encodeURIComponent(key)}`, {
            body: JSON.stringify({ value: initialRef.current }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT',
          })
        }
      } catch {
        // Supabase is the only database. Keep in-memory defaults until API recovers.
      } finally {
        if (!cancelled) hydrated.current = true
      }
    }

    void loadFromBackend()

    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (!hydrated.current) return

    void fetch(`/api/state/${encodeURIComponent(key)}`, {
      body: JSON.stringify({ value }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }).catch(() => {
      // Supabase is the only database. Failed writes are not stored locally.
    })
  }, [key, value])

  return [value, setValue] as const
}
