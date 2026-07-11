const { getBackendValue, setBackendValue } = require('../backend.cjs')

module.exports = async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  const keyParam = request.query?.key
  const key = Array.isArray(keyParam) ? keyParam.join('/') : keyParam

  if (!key) {
    response.status(400).json({ error: 'Missing state key' })
    return
  }

  try {
    if (request.method === 'GET') {
      const result = await getBackendValue(key)
      response.status(200).json({
        backend: result.backend,
        exists: result.exists,
        key,
        value: result.value,
      })
      return
    }

    if (request.method === 'PUT') {
      const result = await setBackendValue(key, request.body?.value)
      response.status(200).json({
        backend: result.backend,
        ok: true,
        key,
        updatedAt: result.updatedAt,
      })
      return
    }

    response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Server error',
    })
  }
}
