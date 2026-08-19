import { type Member, paymentRecords, settings } from './data'

export type PaymentAllocation = {
  liquid: number
  mwekeza: number
  debt: number
  debtUtt: number
  debtMwekeza: number
  penalty: number
  overpayment: number
}

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Mobile Money' | 'Other'

export type TransactionRecord = {
  id: string
  memberId: string
  date: string
  amount: number
  method: PaymentMethod
  note: string
  recordedBy: string
  allocation: PaymentAllocation
}

export const formatTzs = (amount: number) =>
  new Intl.NumberFormat('en-TZ', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'TZS',
  })
    .format(Math.round(amount))
    .replace('TZS', 'TZS ')

export const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const getMemberRecords = (memberId: string) =>
  paymentRecords.find((record) => record.memberId === memberId)?.months ?? []

export const historicalTotals = () => {
  const liquid = paymentRecords.reduce(
    (sum, record) =>
      sum + record.months.reduce((monthSum, month) => monthSum + month.liquid, 0),
    0,
  )
  const mwekeza = paymentRecords.reduce(
    (sum, record) =>
      sum + record.months.reduce((monthSum, month) => monthSum + month.mwekeza, 0),
    0,
  )

  return {
    liquid,
    mwekeza,
    combined: liquid + mwekeza,
  }
}

export const paidTotalForMonth = (memberId: string, month: string) => {
  const record = getMemberRecords(memberId).find((item) => item.month === month)

  return (record?.liquid ?? 0) + (record?.mwekeza ?? 0)
}

export const paidBreakdownForMonth = (memberId: string, month: string) => {
  const record = getMemberRecords(memberId).find((item) => item.month === month)

  return {
    liquid: record?.liquid ?? 0,
    mwekeza: record?.mwekeza ?? 0,
  }
}

export const paidTotalUntil = (memberId: string, endMonthInclusive: string) =>
  getMemberRecords(memberId)
    .filter((record) => record.month <= endMonthInclusive)
    .reduce((sum, record) => sum + record.liquid + record.mwekeza, 0)

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const currentCycleMonthKey = (date = new Date()) => {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date

  return monthKey(safeDate)
}

const previousMonthKey = (date: Date) =>
  monthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1))

const monthIndex = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)

  return year * 12 + monthNumber
}

export const contributionMonthCountForMember = (
  memberId: string,
  endMonth = currentCycleMonthKey(),
) => {
  const firstRecord = getMemberRecords(memberId)[0]

  return firstRecord ? Math.max(monthIndex(endMonth) - monthIndex(firstRecord.month), 0) : 0
}

export const settledDebtBaseMonth = (date = new Date()) => {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const currentMonth = monthKey(safeDate)

  if (safeDate.getDate() > settings.graceDay) return currentMonth

  return previousMonthKey(safeDate)
}

export const startingDebtForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) => {
  const debt = startingDebtBreakdownForMember(memberId, transactions, asOfDate)

  return debt.utt + debt.mwekeza
}

// Debt is "all-time expected minus all-time paid": every shilling a member has
// ever handed over — whether recorded as a normal contribution or as a debt
// installment, in any month, live or imported — reduces the figure. It must
// NOT be scoped to "this cycle month" or "through the debt base month only":
// a debt-installment payment made in July still needs to count in August,
// September, forever, or it silently reappears as owed the moment the month
// rolls over. When viewing a past or future month (asOfDate), only count
// payments that had actually happened by then — a payment made after the
// viewed date can't reduce a snapshot of an earlier point in time.
const livePaidTotalsForMember = (
  memberId: string,
  transactions: TransactionRecord[],
  asOfDate: Date,
) => {
  const cutoff = dateKey(asOfDate)

  return transactions
    .filter((transaction) => transaction.memberId === memberId && transaction.date <= cutoff)
    .reduce(
      (totals, transaction) => {
        const allocation = normalizeAllocation(transaction.allocation)

        return {
          utt: totals.utt + allocation.liquid + allocation.debtUtt,
          mwekeza: totals.mwekeza + allocation.mwekeza + allocation.debtMwekeza,
        }
      },
      { utt: 0, mwekeza: 0 },
    )
}

export const startingDebtBreakdownForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) => {
  const debtBaseMonth = settledDebtBaseMonth(asOfDate)
  const records = getMemberRecords(memberId)
  const monthsDue = contributionMonthCountForMember(memberId, debtBaseMonth)
  const expectedUtt = monthsDue * settings.liquidContribution
  const expectedMwekeza = monthsDue * settings.mwekezaContribution
  const importedPaid = records
    .filter((record) => record.month <= debtBaseMonth)
    .reduce(
      (totals, record) => ({
        utt: totals.utt + record.liquid,
        mwekeza: totals.mwekeza + record.mwekeza,
      }),
      { utt: 0, mwekeza: 0 },
    )
  const livePaid = livePaidTotalsForMember(memberId, transactions, asOfDate)

  return {
    utt: Math.max(expectedUtt - importedPaid.utt - livePaid.utt, 0),
    mwekeza: Math.max(expectedMwekeza - importedPaid.mwekeza - livePaid.mwekeza, 0),
  }
}

export const debtInstallmentForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) =>
  startingDebtForMember(memberId, transactions, asOfDate) /
  settings.debtInstallmentMonths.length

export const debtInstallmentBreakdownForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) => {
  const debt = startingDebtBreakdownForMember(memberId, transactions, asOfDate)

  return {
    utt: debt.utt / settings.debtInstallmentMonths.length,
    mwekeza: debt.mwekeza / settings.debtInstallmentMonths.length,
  }
}

export type JulyPaymentOverride = Record<
  string,
  PaymentAllocation & {
    amount: number
  }
>

export const emptyPaymentAllocation = (): PaymentAllocation => ({
  liquid: 0,
  mwekeza: 0,
  debt: 0,
  debtUtt: 0,
  debtMwekeza: 0,
  penalty: 0,
  overpayment: 0,
})

export const normalizeAllocation = (allocation?: Partial<PaymentAllocation>) => {
  const legacyDebt = allocation?.debt ?? 0
  const debtUtt = allocation?.debtUtt ?? legacyDebt
  const debtMwekeza = allocation?.debtMwekeza ?? 0

  return {
    liquid: allocation?.liquid ?? 0,
    mwekeza: allocation?.mwekeza ?? 0,
    debt: debtUtt + debtMwekeza,
    debtUtt,
    debtMwekeza,
    penalty: allocation?.penalty ?? 0,
    overpayment: allocation?.overpayment ?? 0,
  }
}

export const transactionsToOverrides = (
  transactions: TransactionRecord[],
  cycleMonth = currentCycleMonthKey(),
) =>
  transactions
    .filter((transaction) => transaction.date.slice(0, 7) === cycleMonth)
    .reduce<JulyPaymentOverride>((totals, transaction) => {
    const current = totals[transaction.memberId] ?? {
      ...emptyPaymentAllocation(),
      amount: 0,
    }
    const allocation = normalizeAllocation(transaction.allocation)

    totals[transaction.memberId] = {
      amount: current.amount + transaction.amount,
      liquid: current.liquid + allocation.liquid,
      mwekeza: current.mwekeza + allocation.mwekeza,
      debt: current.debt + allocation.debt,
      debtUtt: current.debtUtt + allocation.debtUtt,
      debtMwekeza: current.debtMwekeza + allocation.debtMwekeza,
      penalty: current.penalty + allocation.penalty,
      overpayment: current.overpayment + allocation.overpayment,
    }
    return totals
  }, {})

export const transactionTotals = (transactions: TransactionRecord[]) =>
  transactions.reduce(
    (totals, transaction) => {
      const allocation = normalizeAllocation(transaction.allocation)

      return {
        liquid: totals.liquid + allocation.liquid,
        mwekeza: totals.mwekeza + allocation.mwekeza,
        debt: totals.debt + allocation.debt,
        debtUtt: totals.debtUtt + allocation.debtUtt,
        debtMwekeza: totals.debtMwekeza + allocation.debtMwekeza,
        penalty: totals.penalty + allocation.penalty,
        overpayment: totals.overpayment + allocation.overpayment,
        combined: totals.combined + transaction.amount,
      }
    },
    {
      liquid: 0,
      mwekeza: 0,
      debt: 0,
      debtUtt: 0,
      debtMwekeza: 0,
      penalty: 0,
      overpayment: 0,
      combined: 0,
    },
  )

export const liveFundTotals = (
  transactions: TransactionRecord[],
  projectInvestmentTotal = 0,
) => {
  const base = historicalTotals()
  const added = transactionTotals(transactions)
  // Penalty money isn't earmarked for either contribution fund — like an
  // overpayment, it lands in the liquid/UTT pool as group income.
  const liquidBeforeProjects =
    base.liquid + added.liquid + added.debtUtt + added.overpayment + added.penalty

  return {
    liquid: Math.max(liquidBeforeProjects - projectInvestmentTotal, 0),
    mwekeza: base.mwekeza + added.mwekeza + added.debtMwekeza,
    combined: Math.max(base.combined + added.combined - projectInvestmentTotal, 0),
    julyCashAdded: added.combined,
    debtRecovered: added.debt,
    penaltyCollected: added.penalty,
    projectInvestmentTotal,
  }
}

// A cashier enters ONE amount for a member; this decides where it goes.
// Fixed priority, always in this order: penalty first, then debt (UTT slice
// before Mwekeza slice), then this cycle's normal contribution (Mwekeza
// before UTT). Whatever's left over past a fully-cleared cycle becomes
// overpayment. The plan is built from the member's REAL current-cycle
// overrides (not empty) so it already reflects any earlier payment made
// this cycle before this one.
export const allocatePaymentAmount = (
  memberId: string,
  amount: number,
  transactions: TransactionRecord[] = [],
): PaymentAllocation => {
  const paymentOverrides = transactionsToOverrides(transactions)
  const plan = julyPlanForMember(memberId, paymentOverrides, transactions)
  const dueParts: Array<{ key: 'penalty' | 'debtUtt' | 'debtMwekeza' | 'mwekeza' | 'liquid'; amount: number }> = [
    { key: 'penalty', amount: plan.penaltyRemaining },
    { key: 'debtUtt', amount: plan.debtUttRemaining },
    { key: 'debtMwekeza', amount: plan.debtMwekezaRemaining },
    { key: 'mwekeza', amount: plan.mwekezaRemaining },
    { key: 'liquid', amount: plan.liquidRemaining },
  ]
  const allocation = emptyPaymentAllocation()
  let remaining = amount

  for (const part of dueParts) {
    const applied = Math.min(part.amount, remaining)
    allocation[part.key] += applied
    remaining -= applied

    if (remaining <= 0) break
  }

  allocation.overpayment = Math.max(remaining, 0)
  allocation.debt = allocation.debtUtt + allocation.debtMwekeza
  return allocation
}

export const julyPlanForMember = (
  memberId: string,
  paymentOverrides: JulyPaymentOverride,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) => {
  const cycleMonth = currentCycleMonthKey(asOfDate)
  const startingDebt = startingDebtForMember(memberId, transactions, asOfDate)
  const startingDebtBreakdown = startingDebtBreakdownForMember(memberId, transactions, asOfDate)
  const isDebtInstallmentMonth = settings.debtInstallmentMonths.includes(cycleMonth)
  const debtInstallmentBreakdown = isDebtInstallmentMonth
    ? debtInstallmentBreakdownForMember(memberId, transactions, asOfDate)
    : { utt: 0, mwekeza: 0 }
  const installment = isDebtInstallmentMonth
    ? debtInstallmentForMember(memberId, transactions, asOfDate)
    : 0
  const importedPaidBreakdown = paidBreakdownForMonth(memberId, cycleMonth)
  const importedPaid = importedPaidBreakdown.liquid + importedPaidBreakdown.mwekeza
  const manual = paymentOverrides[memberId] ?? {
    ...emptyPaymentAllocation(),
    amount: 0,
  }
  const manualPaid = manual.amount
  const normalContributionPaid =
    importedPaid + manual.liquid + manual.mwekeza + manual.overpayment
  const debtPaid = manual.debtUtt + manual.debtMwekeza
  const penaltyPaid = manual.penalty
  const paid = normalContributionPaid + debtPaid + penaltyPaid
  const liquidRemaining = Math.max(
    settings.liquidContribution - importedPaidBreakdown.liquid - manual.liquid,
    0,
  )
  const mwekezaRemaining = Math.max(
    settings.mwekezaContribution - importedPaidBreakdown.mwekeza - manual.mwekeza,
    0,
  )
  const normalRemaining = liquidRemaining + mwekezaRemaining
  // startingDebtBreakdown already nets out every debt payment the member has
  // ever made (see livePaidTotalsForMember), including one made this cycle
  // month, so it must NOT be reduced by manual.debtUtt/debtMwekeza again here
  // — that would subtract the same payment twice.
  const debtUttRemaining = debtInstallmentBreakdown.utt
  const debtMwekezaRemaining = debtInstallmentBreakdown.mwekeza
  const remainingStartingDebtUtt = startingDebtBreakdown.utt
  const remainingStartingDebtMwekeza = startingDebtBreakdown.mwekeza
  const remainingStartingDebt = remainingStartingDebtUtt + remainingStartingDebtMwekeza
  const due = settings.monthlyContribution + installment
  const debtInstallmentRemaining = debtUttRemaining + debtMwekezaRemaining
  // Penalty applies to what's actually overdue THIS cycle — the unpaid slice
  // of the 25% debt installment plus the unpaid normal contribution — never
  // to the full outstanding debt book. Paying only this cycle's due amount
  // must fully clear the penalty risk, regardless of how much debt remains
  // for future installment months.
  const remaining = normalRemaining + debtInstallmentRemaining
  const debtPenaltyBase = remaining
  const penalty = debtPenaltyBase * settings.penaltyRate
  // penaltyPaid is a real payable bucket now (allocation.penalty), so the
  // penalty owed for this cycle nets out whatever's already been paid toward
  // it, same as debt/normal contribution do.
  const penaltyRemaining = Math.max(penalty - penaltyPaid, 0)
  const carryover = remaining + penaltyRemaining
  const status =
    remaining === 0
      ? 'Paid On Time'
      : paid > 0
        ? 'Partially Paid'
        : 'Overdue Risk'

  return {
    startingDebt,
    installment,
    normalContribution: settings.monthlyContribution,
    due,
    importedPaid,
    manualPaid,
    paid,
    liquidRemaining,
    mwekezaRemaining,
    normalRemaining,
    debtUttRemaining,
    debtMwekezaRemaining,
    remainingStartingDebt,
    remainingStartingDebtUtt,
    remainingStartingDebtMwekeza,
    remaining,
    debtInstallmentRemaining,
    debtPenaltyBase,
    penalty,
    penaltyPaid,
    penaltyRemaining,
    carryover,
    status,
  }
}

export const allJulyPlans = (
  memberList: Member[],
  paymentOverrides: JulyPaymentOverride,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) =>
  memberList.map((member) => ({
    member,
    plan: julyPlanForMember(member.id, paymentOverrides, transactions, asOfDate),
  }))

export const julySummary = (
  memberList: Member[],
  paymentOverrides: JulyPaymentOverride,
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) => {
  const plans = allJulyPlans(memberList, paymentOverrides, transactions, asOfDate)
  const totalDue = plans.reduce((sum, item) => sum + item.plan.due, 0)
  const totalPaid = plans.reduce((sum, item) => sum + item.plan.paid, 0)
  const remaining = plans.reduce((sum, item) => sum + item.plan.remaining, 0)
  const penaltyAtRisk = plans.reduce((sum, item) => sum + item.plan.penalty, 0)
  const membersAtRisk = plans.filter((item) => item.plan.remaining > 0).length

  return {
    totalDue,
    totalPaid,
    remaining,
    penaltyAtRisk,
    membersAtRisk,
  }
}

export const debtBookTotal = (
  memberList: Member[],
  transactions: TransactionRecord[] = [],
  asOfDate: Date = new Date(),
) =>
  memberList.reduce(
    (sum, member) => sum + startingDebtForMember(member.id, transactions, asOfDate),
    0,
  )

const monthAfter = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1
  const nextYear = monthNumber === 12 ? year + 1 : year

  return `${nextYear}-${String(nextMonthNumber).padStart(2, '0')}`
}

// Every month from the first debt-installment month through the month after
// the last one (Jul 2026 -> Nov 2026) — the full window the penalty review
// screen can look at, past or future.
export const penaltyReviewMonths = () => {
  const lastInstallmentMonth =
    settings.debtInstallmentMonths[settings.debtInstallmentMonths.length - 1]

  return [...settings.debtInstallmentMonths, monthAfter(lastInstallmentMonth)]
}

// The last calendar day of a "YYYY-MM" month, used as the snapshot date for
// reviewing that month: past its grace day, so settledDebtBaseMonth treats
// it as fully closed, and late enough to include every transaction actually
// dated within it.
const lastDayOfMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)

  return new Date(year, monthNumber, 0)
}

// A real historical (or, for a future month, projected-if-nothing-changes)
// snapshot for every member as of the end of `month` — reusing the exact
// same debt/penalty math as "today", just anchored to a different date and
// with transactions after that date excluded. This replaces any separate
// approximate compounding formula: it recomputes the whole waterfall for
// that month, so debt, installment, normal contribution, and penalty all
// interact exactly as they would have (or will) for real.
export const penaltyPlansForMonth = (
  memberList: Member[],
  transactions: TransactionRecord[],
  month: string,
) => {
  const asOfDate = lastDayOfMonth(month)
  const cycleMonth = currentCycleMonthKey(asOfDate)
  const paymentOverrides = transactionsToOverrides(transactions, cycleMonth)

  return allJulyPlans(memberList, paymentOverrides, transactions, asOfDate)
}
