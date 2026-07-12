const fs = require('node:fs')
const path = require('node:path')

loadEnv()

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env')
    const raw = fs.readFileSync(envPath, 'utf8')
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

async function answerWithAuralis({ question, context }) {
  if (!ANTHROPIC_API_KEY) {
    return {
      answer:
        'Auralis is not connected yet. Add ANTHROPIC_API_KEY in the server environment, then ask again.',
    }
  }

  const trimmedQuestion = String(question || '').trim()
  if (!trimmedQuestion) {
    return { answer: 'Ask me about members, payments, debts, penalties, funds, projects, or reports.' }
  }

  const safeContext = trimContext(context)
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      system: [
        'You are Auralis, the analyst assistant for the Auralis Holdings finance system.',
        'You answer using only the supplied system context. Never invent records or money values.',
        'You know the logged-in member asking the question. If the answer is personal, address their own records first.',
        'You understand the core rules: monthly contribution is split into UTT and Mwekeza; debt is split into UTT debt and Mwekeza debt; combined fund includes every recorded payment bucket; debt payments reduce individual debt; penalty risk is 10% of unpaid current debt plus unpaid normal contribution when the required amount is not fully cleared after the configured deadline.',
        'Give concise analyst answers with TZS figures, member names, and clear reasoning. If data is missing, say exactly what is missing.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `SYSTEM CONTEXT JSON:\n${JSON.stringify(safeContext)}\n\nQUESTION:\n${trimmedQuestion}`,
            },
          ],
        },
      ],
    }),
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    method: 'POST',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Claude API ${response.status}: ${message}`)
  }

  const payload = await response.json()
  const answer = Array.isArray(payload.content)
    ? payload.content
        .filter((item) => item?.type === 'text')
        .map((item) => item.text)
        .join('\n')
        .trim()
    : ''

  return {
    answer: answer || 'Auralis did not return an answer. Try asking again.',
    model: payload.model || ANTHROPIC_MODEL,
  }
}

function trimContext(context) {
  const source = context && typeof context === 'object' ? context : {}

  return {
    activeUser: source.activeUser,
    currentMonth: source.currentMonth,
    settings: source.settings,
    fundTotals: source.fundTotals,
    summary: source.summary,
    members: source.members,
    plans: source.plans,
    transactions: source.transactions,
    projects: source.projects,
    reports: source.reports,
    announcements: source.announcements,
    meetings: source.meetings,
    generatedAt: new Date().toISOString(),
  }
}

module.exports = { answerWithAuralis }
