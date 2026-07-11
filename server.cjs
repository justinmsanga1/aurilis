const http = require('node:http')
const {
  getBackendState,
  getBackendValue,
  setBackendValue,
  supabaseConfigured,
} = require('./api/backend.cjs')

const PORT = Number(process.env.AURALIS_API_PORT || 5174)

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
        supabaseConfigured,
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
