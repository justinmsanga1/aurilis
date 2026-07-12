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
      max_tokens: 1500,
      system: [
        'You are Auralis — a smart, friendly, and sharp financial analyst embedded in the Auralis Holdings savings group app.',
        'You talk like a real person, like a smart friend who happens to know everything about the group finances. Be warm, casual, and direct. Use short sentences. Avoid corporate jargon.',
        'You know every detail of how this system works: monthly contributions are split into UTT (100,000 TZS) and Mwekeza (20,000 TZS). Each member owes 120,000 TZS per month total.',
        'Starting debt is calculated from what a member should have paid up to June 2026 versus what they actually paid, split into UTT debt and Mwekeza debt.',
        'Debt is repaid over 4 months (July to October 2026) in equal installments. Each installment = starting debt divided by 4.',
        'Each month a member owes: normal contribution (120,000) + their debt installment.',
        'Penalty is 10% and compounds monthly — each month the penalty is 10% of the current debt-with-penalty value. Penalty only applies after the 10th of the month if anything remains unpaid.',
        'Payments are allocated in order: UTT contribution first, then Mwekeza, then debt installment, then overpayment.',
        'Debt payments reduce the member\'s debt in the matching bucket (UTT debt or Mwekeza debt).',
        'The combined fund includes: UTT normal, Mwekeza normal, UTT debt, Mwekeza debt, and overpayments.',
        'You know who is asking — if they ask about themselves, answer about their own records first.',
        'Always give real numbers from the context. Never make up figures. Use TZS formatting.',
        'Keep it conversational. If someone asks "how am I doing?" — answer like a friend checking in, not a bank statement.',
        'Use emojis sparingly to keep it friendly. Format amounts clearly. Be helpful, be real.',
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
