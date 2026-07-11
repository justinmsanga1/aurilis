const http = require('node:http')
const path = require('node:path')

loadEnv()

const PORT = Number(process.env.AURALIS_API_PORT || 5174)
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || ''
const SUPABASE_TABLE = process.env.SUPABASE_STATE_TABLE || 'auralis_state'
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY)
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
    const envPath = path.join(__dirname, '.env')
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
    // .env is optional.
  }
}

async function supabaseRequest(pathname, options = {}) {
  if (!USE_SUPABASE) {
    throw new Error('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Supabase ${response.status}: ${message}`)
  }

  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function getBackendState() {
  const state = {}
  let updatedAt = ''

  for (const key of Object.keys(STRUCTURED_STATE)) {
    const result = await getBackendValue(key)
    if (result.exists) state[key] = result.value
    if (result.updatedAt && (!updatedAt || result.updatedAt > updatedAt)) {
      updatedAt = result.updatedAt
    }
  }

  try {
    const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=key,value,updated_at`)
    for (const row of rows) {
      if (!(row.key in state)) state[row.key] = row.value
      if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at
    }
  } catch {
    // The legacy table is optional after structured tables are installed.
  }

  return {
    backend: 'supabase',
    createdAt: updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
    state,
  }
}

async function getBackendValue(key) {
  const config = STRUCTURED_STATE[key]

  if (config) {
    try {
      const result = await getStructuredValue(config)
      if (result.exists) return result

      const legacy = await getLegacyBackendValue(key)
      if (legacy.exists) {
        await setStructuredValue(config, legacy.value)
        return { ...legacy, backend: 'supabase', migrated: true }
      }

      return result
    } catch (error) {
      const legacy = await getLegacyBackendValue(key)
      if (legacy.exists) return legacy
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
  const config = STRUCTURED_STATE[key]
  if (config) {
    try {
      return await setStructuredValue(config, value)
    } catch {
      return setLegacyBackendValue(key, value)
    }
  }

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
  const rows = await supabaseRequest(
    `${config.table}?select=*&order=sort_order.asc`,
  )
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
    value: rows
      .map((row) => row.data)
      .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))),
  }
}

async function setStructuredValue(config, value) {
  const updatedAt = new Date().toISOString()
  const deleteFilter = `${config.idColumn}=not.is.null`
  await supabaseRequest(`${config.table}?${deleteFilter}`, {
    method: 'DELETE',
  })

  const rows = toStructuredRows(config, value, updatedAt)
  if (rows.length > 0) {
    await supabaseRequest(config.table, {
      body: JSON.stringify(rows),
      headers: {
        Prefer: 'return=minimal',
      },
      method: 'POST',
    })
  }

  return { backend: 'supabase', updatedAt }
}

function toStructuredRows(config, value, updatedAt) {
  if (config.kind === 'avatarMap') {
    if (!value || typeof value !== 'object') return []
    return Object.entries(value)
      .filter(([, image]) => typeof image === 'string' && image)
      .map(([memberId, image], index) => ({
        image,
        member_id: memberId,
        sort_order: index,
        updated_at: updatedAt,
      }))
  }

  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && typeof item === 'object' && item.id)
    .map(({ item, index }) => ({
      data: item,
      id: item.id,
      sort_order: index,
      updated_at: updatedAt,
    }))
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(payload))
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function stateKeyFromUrl(url) {
  const prefix = '/api/state/'
  if (!url.pathname.startsWith(prefix)) return ''
  return decodeURIComponent(url.pathname.slice(prefix.length))
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)

    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {})
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      const store = await getBackendState()
      sendJson(response, 200, {
        backend: store.backend,
        ok: true,
        service: 'Auralis Holdings API',
        supabaseConfigured: USE_SUPABASE,
        updatedAt: store.updatedAt,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/state') {
      const store = await getBackendState()
      sendJson(response, 200, store)
      return
    }

    const key = stateKeyFromUrl(url)
    if (key && request.method === 'GET') {
      const result = await getBackendValue(key)
      sendJson(response, 200, {
        backend: result.backend,
        exists: result.exists,
        key,
        value: result.value,
      })
      return
    }

    if (key && request.method === 'PUT') {
      const body = await readBody(request)
      const result = await setBackendValue(key, body.value)
      sendJson(response, 200, {
        backend: result.backend,
        ok: true,
        key,
        updatedAt: result.updatedAt,
      })
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Server error',
    })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Auralis API running on http://0.0.0.0:${PORT}`)
})
