import { useEffect, useRef, useState } from 'react'

export type StorageStatus = 'loading' | 'loaded' | 'stale'

type StorageListener = (key: string, status: StorageStatus) => void
type BackendStateSnapshot = {
  state?: Record<string, unknown>
}

const listeners = new Set<StorageListener>()
let backendStatePromise: Promise<BackendStateSnapshot> | null = null

export function onStorageStatus(listener: StorageListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(key: string, status: StorageStatus) {
  for (const listener of listeners) listener(key, status)
}

function loadBackendState() {
  backendStatePromise ??= fetch('/api/state').then(async (response) => {
    if (!response.ok) throw new Error('Backend unavailable')
    return (await response.json()) as BackendStateSnapshot
  })

  return backendStatePromise
}

function serialize(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

export function useStoredState<T>(key: string, initialValue: T) {
  const hydrated = useRef(false)
  const initialRef = useRef(initialValue)
  const lastSynced = useRef(serialize(initialRef.current))
  const [value, setValue] = useState<T>(initialValue)
  const [status, setStatus] = useState<StorageStatus>('loading')

  useEffect(() => {
    let cancelled = false

    async function loadFromBackend() {
      try {
        const payload = await loadBackendState()
        const state = payload.state ?? {}
        const exists = Object.hasOwn(state, key)
        const loadedValue = exists ? (state[key] as T) : initialRef.current

        if (!cancelled) {
          lastSynced.current = serialize(loadedValue)
          setValue(loadedValue)
          setStatus('loaded')
          notify(key, 'loaded')
        }
      } catch (error) {
        console.error(`Auralis storage load failed for ${key}`, error)
        // The backend is unreachable, so the current value is NOT the real
        // state — flag it so the UI can warn instead of silently showing
        // wrong numbers.
        if (!cancelled) {
          setStatus('stale')
          notify(key, 'stale')
        }
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
    if (!hydrated.current || status !== 'loaded') return
    const nextValue = serialize(value)
    if (nextValue === lastSynced.current) return

    void fetch(`/api/state/${encodeURIComponent(key)}`, {
      body: nextValue ? `{"value":${nextValue}}` : JSON.stringify({ value }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Backend unavailable')
        lastSynced.current = nextValue
      })
      .catch((error) => {
        console.error(`Auralis storage save failed for ${key}`, error)
        setStatus('stale')
        notify(key, 'stale')
      })
  }, [key, status, value])

  return [value, setValue] as const
}
