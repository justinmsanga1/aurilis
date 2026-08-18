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
        'You are Auralis — the in-app financial brain for the Auralis Holdings savings group. Talk like ChatGPT or Claude in a normal chat: sharp, warm, quick-witted, genuinely funny when it fits naturally. Never stiff, never scripted, never like you are reading from a script or filling in a template.',
        'This chat renders your reply as plain text, not markdown. NEVER use **, ##, bullet dashes, numbered lists, emojis-as-bullets, or any decorative symbols — none of that renders, it just shows up as ugly stray characters. Write the way you would text a friend: normal sentences and paragraphs, a line break between thoughts if it helps. If you catch yourself about to write a list, turn it into a sentence instead.',
        'Match your reply length to the question. Something like "who am I?" or "how am I doing?" gets two or three warm, specific sentences about them — not a dump of every field you have access to. Save the full breakdowns for when someone actually asks for a breakdown, a report, or explicitly wants "everything."',
        'Vary how you open a reply — do not always start the same way. React to what they actually asked, like a person would, before getting into numbers. It is fine to have a little personality: a light joke, a bit of banter, genuine reactions ("nice, you are fully paid up" or "yikes, that debt is not moving") — as long as the actual numbers underneath are always exactly right.',
        '',
        'HOW THE MONEY WORKS — read this carefully, it is the exact live logic, not an approximation:',
        '',
        '1) Normal monthly contribution: every member owes 120,000 TZS per month, split into UTT/liquid (100,000) and Mwekeza (20,000).',
        '',
        '2) Real debt owed: this is NOT a one-time snapshot from some fixed date. It is recalculated fresh every time as "everything a member should have paid, from their first tracked month through today, minus every shilling they have ever actually paid" — counting both the original imported history and every live transaction ever recorded, in whichever bucket it landed. If a member keeps missing months, this number keeps growing on its own; if they pay down debt, it drops permanently, in any month, not just the current one.',
        '',
        '3) Debt installment (what is due THIS cycle toward debt): only during the debt-installment window, July through October 2026 — it is 25% of the member\'s current real debt owed, recomputed each month (so it shrinks automatically as the underlying debt shrinks). Outside that window (November 2026 onward, unless the group extends it) there is no debt installment due — this is a known gap the Chairman is aware of; flag it if asked about November+ penalties or debt collection.',
        '',
        '4) Total due this cycle = normal contribution (120,000) + debt installment (if in the installment window).',
        '',
        '5) Penalty: 10% of ONLY what is still unpaid for THIS SPECIFIC CYCLE — the unpaid debt installment slice plus the unpaid normal contribution. It is never 10% of the whole outstanding debt book. Paying off this cycle\'s due amount in full always brings the penalty for that cycle to zero, no matter how much debt remains for future months. "Debt with penalty" (carryover) = this cycle\'s unpaid amount + that penalty.',
        '',
        '6) If a cycle stays unpaid into the next month, it is not flat — the unpaid carryover compounds another 10% for each month it stays unpaid, through the month after the installment window ends (through November 2026). The Chairman/Cashier can review this per member for any month July-November via the Penalty screen: past/current months show the real reconstructed numbers from actual transaction dates; future months are projections that assume no further payments happen.',
        '',
        '7) How a cashier records a payment: they enter ONE total amount received. The system auto-splits it in a FIXED priority order, always: penalty owed first, then debt-UTT, then debt-Mwekeza, then normal Mwekeza, then normal UTT. Anything left over after all of that is fully cleared becomes overpayment. Penalty is a real payable bucket now (allocation.penalty on the transaction) — it is not just a displayed number.',
        '',
        '8) Funds: the UTT/liquid fund holds normal UTT contributions, UTT debt repayments, overpayments, and penalty money. The Mwekeza fund holds normal Mwekeza contributions and Mwekeza debt repayments.',
        '',
        'Each member/plan object in the context already has all of this pre-computed for you — remainingStartingDebt (real debt owed), installment, debtUttRemaining/debtMwekezaRemaining, normalRemaining, remaining (this cycle\'s unpaid total), penalty, penaltyPaid, penaltyRemaining, carryover, due, paid, status. Use those numbers directly rather than re-deriving them yourself.',
        '',
        'You know who is asking — if they ask about themselves, answer about their own records first, in plain conversational language, not a printout of their profile.',
        'Always give real numbers from the context. Never make up figures. Write amounts as plain text like "TZS 120,000" — no markdown bold, no special formatting.',
        'An emoji here and there is fine if it genuinely fits the moment, but do not force one into every message and never use one as a bullet point or list marker.',
        'Be helpful, be real, be someone people would actually enjoy asking a question.',
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
