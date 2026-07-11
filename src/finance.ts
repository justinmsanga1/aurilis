import { type Member, paymentRecords, settings } from './data'

export type PaymentAllocation = {
  liquid: number
  mwekeza: number
  debt: number
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

export const paidTotalUntil = (memberId: string, endMonthInclusive: string) =>
  getMemberRecords(memberId)
    .filter((record) => record.month <= endMonthInclusive)
    .reduce((sum, record) => sum + record.liquid + record.mwekeza, 0)

export const startingDebtForMember = (memberId: string) => {
  const debtBaseMonth = '2026-06'
  const monthsDue = getMemberRecords(memberId).filter(
    (record) => record.month <= debtBaseMonth,
  ).length
  const expected = monthsDue * settings.monthlyContribution
  const paid = paidTotalUntil(memberId, debtBaseMonth)

  return Math.max(expected - paid, 0)
}

export const debtInstallmentForMember = (memberId: string) =>
  startingDebtForMember(memberId) / settings.debtInstallmentMonths.length

export type JulyPaymentOverride = Record<string, number>

export const transactionsToOverrides = (transactions: TransactionRecord[]) =>
  transactions.reduce<JulyPaymentOverride>((totals, transaction) => {
    totals[transaction.memberId] = (totals[transaction.memberId] ?? 0) + transaction.amount
    return totals
  }, {})

export const transactionTotals = (transactions: TransactionRecord[]) =>
  transactions.reduce(
    (totals, transaction) => ({
      liquid: totals.liquid + transaction.allocation.liquid,
      mwekeza: totals.mwekeza + transaction.allocation.mwekeza,
      debt: totals.debt + transaction.allocation.debt,
      overpayment: totals.overpayment + transaction.allocation.overpayment,
      combined: totals.combined + transaction.amount,
    }),
    {
      liquid: 0,
      mwekeza: 0,
      debt: 0,
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
  const liquidBeforeProjects = base.liquid + added.liquid + added.debt + added.overpayment

  return {
    liquid: Math.max(liquidBeforeProjects - projectInvestmentTotal, 0),
    mwekeza: base.mwekeza + added.mwekeza,
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
): PaymentAllocation => {
  const plan = julyPlanForMember(memberId, {})
  const dueParts = [
    { key: 'liquid' as const, amount: settings.liquidContribution },
    { key: 'mwekeza' as const, amount: settings.mwekezaContribution },
    { key: 'debt' as const, amount: plan.installment },
  ]
  const allocation: PaymentAllocation = {
    liquid: 0,
    mwekeza: 0,
    debt: 0,
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
  return allocation
}

export const julyPlanForMember = (
  memberId: string,
  paymentOverrides: JulyPaymentOverride,
) => {
  const startingDebt = startingDebtForMember(memberId)
  const installment = debtInstallmentForMember(memberId)
  const importedPaid = paidTotalForMonth(memberId, '2026-07')
  const manualPaid = paymentOverrides[memberId] ?? 0
  const paid = importedPaid + manualPaid
  const due = settings.monthlyContribution + installment
  const remaining = Math.max(due - paid, 0)
  const debtPaid = Math.max(paid - settings.monthlyContribution, 0)
  const debtInstallmentRemaining = Math.max(installment - debtPaid, 0)
  const debtPenaltyBase = debtInstallmentRemaining > 0 ? startingDebt : 0
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
) =>
  memberList.map((member) => ({
    member,
    plan: julyPlanForMember(member.id, paymentOverrides),
  }))

export const julySummary = (
  memberList: Member[],
  paymentOverrides: JulyPaymentOverride,
) => {
  const plans = allJulyPlans(memberList, paymentOverrides)
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

export const debtBookTotal = (memberList: Member[]) =>
  memberList.reduce((sum, member) => sum + startingDebtForMember(member.id), 0)
