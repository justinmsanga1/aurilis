import { type Member, paymentRecords, settings } from './data'

export type PaymentAllocation = {
  liquid: number
  mwekeza: number
  debt: number
  debtUtt: number
  debtMwekeza: number
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

const monthSpanInclusive = (startMonth: string, endMonth: string) =>
  Math.max(monthIndex(endMonth) - monthIndex(startMonth) + 1, 0)

export const contributionMonthCountForMember = (
  memberId: string,
  endMonth = currentCycleMonthKey(),
) => {
  const firstRecord = getMemberRecords(memberId)[0]

  return firstRecord ? monthSpanInclusive(firstRecord.month, endMonth) : 0
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
) => {
  const debt = startingDebtBreakdownForMember(memberId, transactions)

  return debt.utt + debt.mwekeza
}

// Live transactions can cover months the frozen historical import (src/data.ts)
// has no row for, e.g. the current cycle month. Without crediting them here, a
// member who pays their normal dues in full still shows a phantom "debt"
// installment + penalty for that month, since the import never learns about it.
const paidFromTransactionsThrough = (
  memberId: string,
  endMonthInclusive: string,
  transactions: TransactionRecord[],
) =>
  transactions
    .filter(
      (transaction) =>
        transaction.memberId === memberId &&
        transaction.date.slice(0, 7) <= endMonthInclusive,
    )
    .reduce(
      (totals, transaction) => {
        const allocation = normalizeAllocation(transaction.allocation)

        return {
          utt: totals.utt + allocation.liquid,
          mwekeza: totals.mwekeza + allocation.mwekeza,
        }
      },
      { utt: 0, mwekeza: 0 },
    )

export const startingDebtBreakdownForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
) => {
  const debtBaseMonth = settledDebtBaseMonth()
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
  const livePaid = paidFromTransactionsThrough(memberId, debtBaseMonth, transactions)

  return {
    utt: Math.max(expectedUtt - importedPaid.utt - livePaid.utt, 0),
    mwekeza: Math.max(expectedMwekeza - importedPaid.mwekeza - livePaid.mwekeza, 0),
  }
}

export const debtInstallmentForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
) => startingDebtForMember(memberId, transactions) / settings.debtInstallmentMonths.length

export const debtInstallmentBreakdownForMember = (
  memberId: string,
  transactions: TransactionRecord[] = [],
) => {
  const debt = startingDebtBreakdownForMember(memberId, transactions)

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
  const liquidBeforeProjects = base.liquid + added.liquid + added.debtUtt + added.overpayment

  return {
    liquid: Math.max(liquidBeforeProjects - projectInvestmentTotal, 0),
    mwekeza: base.mwekeza + added.mwekeza + added.debtMwekeza,
    combined: Math.max(base.combined + added.combined - projectInvestmentTotal, 0),
    julyCashAdded: added.combined,
    debtRecovered: added.debt,
    projectInvestmentTotal,
  }
}

export const allocateJulyPayment = (
  memberId: string,
  amount: number,
  alreadyPaid: number,
  transactions: TransactionRecord[] = [],
): PaymentAllocation => {
  const plan = julyPlanForMember(memberId, {}, transactions)
  const dueParts = [
    { key: 'liquid' as const, amount: settings.liquidContribution },
    { key: 'mwekeza' as const, amount: settings.mwekezaContribution },
    { key: 'debt' as const, amount: plan.installment },
  ]
  const allocation: PaymentAllocation = {
    liquid: 0,
    mwekeza: 0,
    debt: 0,
    debtUtt: 0,
    debtMwekeza: 0,
    overpayment: 0,
  }
  let cursor = alreadyPaid
  let remaining = amount

  for (const part of dueParts) {
    const alreadyCovered = Math.min(cursor, part.amount)
    cursor = Math.max(cursor - part.amount, 0)
    const partRemaining = Math.max(part.amount - alreadyCovered, 0)
    const applied = Math.min(partRemaining, remaining)
    allocation[part.key] += applied
    remaining -= applied

    if (remaining <= 0) break
  }

  allocation.overpayment = Math.max(remaining, 0)
  allocation.debtUtt = allocation.debt
  return allocation
}

export const julyPlanForMember = (
  memberId: string,
  paymentOverrides: JulyPaymentOverride,
  transactions: TransactionRecord[] = [],
) => {
  const cycleMonth = currentCycleMonthKey()
  const startingDebt = startingDebtForMember(memberId, transactions)
  const startingDebtBreakdown = startingDebtBreakdownForMember(memberId, transactions)
  const isDebtInstallmentMonth = settings.debtInstallmentMonths.includes(cycleMonth)
  const debtInstallmentBreakdown = isDebtInstallmentMonth
    ? debtInstallmentBreakdownForMember(memberId, transactions)
    : { utt: 0, mwekeza: 0 }
  const installment = isDebtInstallmentMonth
    ? debtInstallmentForMember(memberId, transactions)
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
  const paid = normalContributionPaid + debtPaid
  const liquidRemaining = Math.max(
    settings.liquidContribution - importedPaidBreakdown.liquid - manual.liquid,
    0,
  )
  const mwekezaRemaining = Math.max(
    settings.mwekezaContribution - importedPaidBreakdown.mwekeza - manual.mwekeza,
    0,
  )
  const normalRemaining = liquidRemaining + mwekezaRemaining
  const debtUttRemaining = Math.max(debtInstallmentBreakdown.utt - manual.debtUtt, 0)
  const debtMwekezaRemaining = Math.max(
    debtInstallmentBreakdown.mwekeza - manual.debtMwekeza,
    0,
  )
  const remainingStartingDebtUtt = Math.max(
    startingDebtBreakdown.utt - manual.debtUtt,
    0,
  )
  const remainingStartingDebtMwekeza = Math.max(
    startingDebtBreakdown.mwekeza - manual.debtMwekeza,
    0,
  )
  const remainingStartingDebt = remainingStartingDebtUtt + remainingStartingDebtMwekeza
  const due = settings.monthlyContribution + installment
  const remaining = normalRemaining + debtUttRemaining + debtMwekezaRemaining
  const debtInstallmentRemaining = debtUttRemaining + debtMwekezaRemaining
  const debtPenaltyBase = remaining > 0 ? remainingStartingDebt + normalRemaining : 0
  const penalty = debtPenaltyBase * settings.penaltyRate
  const carryover = remaining > 0 ? remaining + penalty : 0
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
    carryover,
    status,
  }
}

export const allJulyPlans = (
  memberList: Member[],
  paymentOverrides: JulyPaymentOverride,
  transactions: TransactionRecord[] = [],
) =>
  memberList.map((member) => ({
    member,
    plan: julyPlanForMember(member.id, paymentOverrides, transactions),
  }))

export const julySummary = (
  memberList: Member[],
  paymentOverrides: JulyPaymentOverride,
  transactions: TransactionRecord[] = [],
) => {
  const plans = allJulyPlans(memberList, paymentOverrides, transactions)
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
) =>
  memberList.reduce(
    (sum, member) => sum + startingDebtForMember(member.id, transactions),
    0,
  )
