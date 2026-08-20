const path = require('node:path')

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || ''
const SUPABASE_TABLE = process.env.SUPABASE_STATE_TABLE || 'auralis_state'
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY)
const RETRYABLE_SUPABASE_CODES = new Set(['PGRST002'])
const SUPABASE_REQUEST_TIMEOUT_MS = 6000
const STRUCTURED_STATE = {
  'auralis-members-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_members',
  },
  'auralis-transactions-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_transactions',
  },
  'auralis-projects-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_projects',
  },
  'auralis-announcements-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_announcements',
  },
  'auralis-meetings-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_meetings',
  },
  'auralis-chat-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_chat_messages',
  },
  'auralis-avatars-v1': {
    idColumn: 'member_id',
    kind: 'avatarMap',
    table: 'auralis_avatars',
  },
  'auralis-reports-v1': {
    idColumn: 'id',
    kind: 'array',
    table: 'auralis_reports',
  },
}

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env')
    const raw = require('node:fs').readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // .env is optional in production.
  }
}

async function supabaseRequest(pathname, options = {}) {
  if (!USE_SUPABASE) {
    throw new Error('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  const maxAttempts = options.method && options.method !== 'GET' ? 1 : 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
        ...options,
        signal: controller.signal,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })

      const text = await response.text()

      if (response.ok) return text ? JSON.parse(text) : null

      const details = parseSupabaseError(text)
      const retryable =
        response.status === 503 && RETRYABLE_SUPABASE_CODES.has(details.code)

      if (!retryable || attempt === maxAttempts) {
        const error = new Error(`Supabase ${response.status}: ${text}`)
        error.statusCode = response.status
        error.supabaseCode = details.code
        throw error
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        if (error?.name === 'AbortError') {
          const timeoutError = new Error('Supabase request timed out')
          timeoutError.statusCode = 503
          throw timeoutError
        }

        throw error
      }
    } finally {
      clearTimeout(timeout)
    }

    await delay(attempt * 750)
  }

  throw new Error('Supabase request failed')
}

function parseSupabaseError(text) {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isBackendUnavailable(error) {
  return error?.statusCode === 503
}

async function getBackendState() {
  const state = {}
  let updatedAt = ''

  try {
    const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=key,value,updated_at`)
    for (const row of rows) {
      state[row.key] = row.value
      if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at
    }

    if (rows.length > 0) {
      return {
        backend: 'supabase',
        createdAt: updatedAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
        state,
      }
    }
  } catch (error) {
    if (isBackendUnavailable(error)) throw error
    // Older installs may not have the compact table yet; structured tables
    // below remain a fallback source.
  }

  for (const [key, config] of Object.entries(STRUCTURED_STATE)) {
    try {
      const result = await getStructuredValue(config)
      if (result.exists) state[key] = result.value
      if (result.updatedAt && (!updatedAt || result.updatedAt > updatedAt)) {
        updatedAt = result.updatedAt
      }
    } catch (error) {
      if (isBackendUnavailable(error)) throw error
      // Structured tables may not exist in older installs; the legacy table
      // below is still the fallback source of truth for those projects.
    }
  }

  return {
    backend: 'supabase',
    createdAt: updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
    state,
  }
}

async function checkBackendConnection() {
  await supabaseRequest(`${SUPABASE_TABLE}?select=key&limit=1`)
  return {
    backend: 'supabase',
    ok: true,
    supabaseConfigured: USE_SUPABASE,
  }
}

async function getBackendValue(key) {
  const config = STRUCTURED_STATE[key]
  try {
    const legacy = await getLegacyBackendValue(key)
    if (legacy.exists) return legacy
  } catch (error) {
    if (isBackendUnavailable(error)) throw error
    // Fall through to structured tables for older installs.
  }

  if (config) {
    try {
      const result = await getStructuredValue(config)
      if (result.exists) {
        await setLegacyBackendValue(key, result.value)
        return { ...result, cached: true }
      }

      return result
    } catch (error) {
      if (isBackendUnavailable(error)) throw error

      return {
        backend: 'supabase',
        exists: false,
        missingStructuredTable: error instanceof Error ? error.message : 'Structured table unavailable',
        updatedAt: '',
        value: null,
      }
    }
  }

  return getLegacyBackendValue(key)
}

async function getLegacyBackendValue(key) {
  const rows = await supabaseRequest(
    `${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}&select=key,value,updated_at`,
  )
  return {
    backend: 'supabase',
    exists: rows.length > 0,
    value: rows.length > 0 ? rows[0].value : null,
    updatedAt: rows.length > 0 ? rows[0].updated_at : '',
  }
}

async function setBackendValue(key, value) {
  return setLegacyBackendValue(key, value)
}

async function setLegacyBackendValue(key, value) {
  const updatedAt = new Date().toISOString()
  await supabaseRequest(`${SUPABASE_TABLE}?on_conflict=key`, {
    body: JSON.stringify({ key, value, updated_at: updatedAt }),
    headers: {
      Prefer: 'resolution=merge-duplicates',
    },
    method: 'POST',
  })
  return { backend: 'supabase', updatedAt }
}

async function getStructuredValue(config) {
  const rows = await supabaseRequest(`${config.table}?select=*&order=sort_order.asc`)
  const updatedAt = rows.reduce(
    (latest, row) => (!latest || row.updated_at > latest ? row.updated_at : latest),
    '',
  )

  if (config.kind === 'avatarMap') {
    return {
      backend: 'supabase',
      exists: rows.length > 0,
      updatedAt,
      value: rows.reduce((avatars, row) => {
        avatars[row.member_id] = row.image
        return avatars
      }, {}),
    }
  }

  return {
    backend: 'supabase',
    exists: rows.length > 0,
    updatedAt,
    value: rows.map((row) => row.data),
  }
}

module.exports = {
  checkBackendConnection,
  getBackendState,
  getBackendValue,
  setBackendValue,
  supabaseConfigured: USE_SUPABASE,
}
