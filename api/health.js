import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { checkBackendConnection, supabaseConfigured } = require('./backend.cjs')

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const store = await checkBackendConnection()
    response.status(200).json({
      backend: store.backend,
      ok: true,
      service: 'Auralis Holdings API',
      supabaseConfigured,
      updatedAt: store.updatedAt,
    })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error instanceof Error ? error.message : 'Server error',
    })
  }
}
