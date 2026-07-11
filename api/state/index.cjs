const { getBackendState } = require('../backend.cjs')

module.exports = async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const store = await getBackendState()
    response.status(200).json(store)
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Server error',
    })
  }
}
