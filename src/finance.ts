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

export const startingDebtForMember = (memberId: string) => {
  const debt = startingDebtBreakdownForMember(memberId)

  return debt.utt + debt.mwekeza
}

export const startingDebtBreakdownForMember = (memberId: string) => {
  const debtBaseMonth = '2026-06'
  const monthsDue = getMemberRecords(memberId).filter(
    (record) => record.month <= debtBaseMonth,
  ).length
  const expectedUtt = monthsDue * settings.liquidContribution
  const expectedMwekeza = monthsDue * settings.mwekezaContribution
  const paid = getMemberRecords(memberId)
    .filter((record) => record.month <= debtBaseMonth)
    .reduce(
      (totals, record) => ({
        utt: totals.utt + record.liquid,
        mwekeza: totals.mwekeza + record.mwekeza,
      }),
      { utt: 0, mwekeza: 0 },
    )

  return {
    utt: Math.max(expectedUtt - paid.utt, 0),
    mwekeza: Math.max(expectedMwekeza - paid.mwekeza, 0),
  }
}

export const debtInstallmentForMember = (memberId: string) =>
  startingDebtForMember(memberId) / settings.debtInstallmentMonths.length

export const debtInstallmentBreakdownForMember = (memberId: string) => {
  const debt = startingDebtBreakdownForMember(memberId)

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

export const transactionsToOverrides = (transactions: TransactionRecord[]) =>
  transactions.reduce<JulyPaymentOverride>((totals, transaction) => {
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
) => {
  const startingDebt = startingDebtForMember(memberId)
  const startingDebtBreakdown = startingDebtBreakdownForMember(memberId)
  const debtInstallmentBreakdown = debtInstallmentBreakdownForMember(memberId)
  const installment = debtInstallmentForMember(memberId)
  const importedPaidBreakdown = paidBreakdownForMonth(memberId, '2026-07')
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
