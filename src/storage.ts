import { useEffect, useRef, useState } from 'react'

export type StorageStatus = 'paused' | 'loading' | 'loaded' | 'stale'

type StorageListener = (key: string, status: StorageStatus) => void
type BackendStateSnapshot = {
  state?: Record<string, unknown>
}

const listeners = new Set<StorageListener>()
let backendStatePromise: Promise<BackendStateSnapshot> | null = null
const liveStorageKey = 'auralis-live-data-enabled'
const liveCooldownKey = 'auralis-live-data-cooldown-until'
const liveFailureCountKey = 'auralis-live-data-failure-count'
const loadTimeoutMs = 20_000
const saveDebounceMs = 900
const manualReconnectCooldownMs = 15_000
const failureCooldownsMs = [60_000, 120_000, 300_000, 600_000]

export function isLiveStorageEnabled() {
  if (getLiveStorageCooldownRemaining() > 0) return false

  return window.sessionStorage.getItem(liveStorageKey) !== 'false'
}

export function getLiveStorageCooldownRemaining() {
  const cooldownUntil = Number(window.sessionStorage.getItem(liveCooldownKey) ?? '0')

  return Math.max(cooldownUntil - Date.now(), 0)
}

export function enableLiveStorage() {
  if (getLiveStorageCooldownRemaining() > 0) return false

  startLiveStorageSession()
  return true
}

export function forceEnableLiveStorage() {
  clearBackendFailures()
  startLiveStorageSession()
  return true
}

function startLiveStorageSession() {
  window.sessionStorage.setItem(liveStorageKey, 'true')
  window.sessionStorage.setItem(
    liveCooldownKey,
    String(Date.now() + manualReconnectCooldownMs),
  )
  backendStatePromise = null
  window.location.reload()
}

export function pauseLiveStorage() {
  window.sessionStorage.removeItem(liveStorageKey)
  backendStatePromise = null
}

function clearBackendFailures() {
  window.sessionStorage.removeItem(liveFailureCountKey)
  window.sessionStorage.removeItem(liveCooldownKey)
}

function registerBackendFailure() {
  const failureCount = Number(window.sessionStorage.getItem(liveFailureCountKey) ?? '0') + 1
  const cooldown =
    failureCooldownsMs[Math.min(failureCount - 1, failureCooldownsMs.length - 1)]

  window.sessionStorage.setItem(liveFailureCountKey, String(failureCount))
  window.sessionStorage.setItem(liveCooldownKey, String(Date.now() + cooldown))
  pauseLiveStorage()
}

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
  backendStatePromise ??= fetchWithTimeout('/api/state').then(async (response) => {
    if (!response.ok) throw new Error('Backend unavailable')
    const payload = (await response.json()) as BackendStateSnapshot
    clearBackendFailures()
    return payload
  })

  return backendStatePromise
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), loadTimeoutMs)

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout))
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
  const lastSynced = useRef(serialize(initialValue))
  const [value, setValue] = useState<T>(initialValue)
  const [status, setStatus] = useState<StorageStatus>(
    isLiveStorageEnabled() ? 'loading' : 'paused',
  )

  useEffect(() => {
    let cancelled = false

    async function loadFromBackend() {
      if (!isLiveStorageEnabled()) {
        setStatus('paused')
        notify(key, 'paused')
        hydrated.current = true
        return
      }

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
        registerBackendFailure()
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

    const timeout = window.setTimeout(() => {
      void fetchWithTimeout(`/api/state/${encodeURIComponent(key)}`, {
        body: nextValue ? `{"value":${nextValue}}` : JSON.stringify({ value }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      .then((response) => {
        if (!response.ok) throw new Error('Backend unavailable')
        clearBackendFailures()
        lastSynced.current = nextValue
      })
      .catch((error) => {
        console.error(`Auralis storage save failed for ${key}`, error)
        registerBackendFailure()
        setStatus('stale')
        notify(key, 'stale')
      })
    }, saveDebounceMs)

    return () => window.clearTimeout(timeout)
  }, [key, status, value])

  return [value, setValue] as const
}
