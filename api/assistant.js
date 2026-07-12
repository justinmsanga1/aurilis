import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { answerWithAuralis } = require('./assistant-core.cjs')

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = parseRequestBody(request.body)
    const result = await answerWithAuralis(body)
    response.status(200).json(result)
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Assistant error',
    })
  }
}

function parseRequestBody(body) {
  if (!body) return {}
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8'))
  if (typeof body === 'string') return JSON.parse(body)
  return body
}
