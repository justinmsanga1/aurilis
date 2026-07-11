export type FundKey = 'liquid' | 'mwekeza'

export type Role = 'Chairman' | 'Cashier' | 'Secretary' | 'Member'

export type Member = {
  id: string
  fullName: string
  username: string
  password: string
  role: Role
}

export type MonthlyRecord = {
  month: string
  label: string
  liquid: number
  mwekeza: number
}

export type PaymentRecord = {
  memberId: string
  months: MonthlyRecord[]
}

export const settings = {
  appName: 'Auralis Holdings',
  currency: 'TZS',
  liquidContribution: 100000,
  mwekezaContribution: 20000,
  monthlyContribution: 120000,
  dueDay: 1,
  graceDay: 10,
  penaltyRate: 0.1,
  debtInstallmentMonths: ['2026-07', '2026-08', '2026-09', '2026-10'],
}

export const members: Member[] = [
  {
    id: 'geoffrey-kapinga',
    fullName: 'Geoffrey Kapinga',
    username: 'kapinga',
    password: '1234',
    role: 'Chairman',
  },
  {
    id: 'michael-ganai',
    fullName: 'Michael Ganai',
    username: 'ganai',
    password: '1234',
    role: 'Member',
  },
  {
    id: 'robby-machoke',
    fullName: 'Robby Machoke',
    username: 'machoke',
    password: '1234',
    role: 'Member',
  },
  {
    id: 'davis-kagisa',
    fullName: 'Davis Kagisa',
    username: 'kagisa',
    password: '1234',
    role: 'Member',
  },
  {
    id: 'honesta-kawago',
    fullName: 'Honesta Kawago',
    username: 'kawago',
    password: '1234',
    role: 'Member',
  },
  {
    id: 'calvin-mikuza',
    fullName: 'Calvin Mikuza',
    username: 'mikuza',
    password: '1234',
    role: 'Member',
  },
  {
    id: 'zephar-mlowe',
    fullName: 'Zephar Mlowe',
    username: 'mlowe',
    password: '1234',
    role: 'Member',
  },
]

export const monthLabels = [
  { month: '2025-10', label: 'Oct 2025' },
  { month: '2025-11', label: 'Nov 2025' },
  { month: '2025-12', label: 'Dec 2025' },
  { month: '2026-01', label: 'Jan 2026' },
  { month: '2026-02', label: 'Feb 2026' },
  { month: '2026-03', label: 'Mar 2026' },
  { month: '2026-04', label: 'Apr 2026' },
  { month: '2026-05', label: 'May 2026' },
  { month: '2026-06', label: 'Jun 2026' },
  { month: '2026-07', label: 'Jul 2026' },
]

const values: Record<string, Array<[number, number]>> = {
  'geoffrey-kapinga': [
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'michael-ganai': [
    [100000, 20000],
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [100000, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'robby-machoke': [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'davis-kagisa': [
    [100000, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'honesta-kawago': [
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
  ],
  'calvin-mikuza': [
    [100000, 20000],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'zephar-mlowe': [
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [100000, 20000],
    [0, 20000],
    [0, 10000],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
}

export const paymentRecords: PaymentRecord[] = members.map((member) => ({
  memberId: member.id,
  months: monthLabels.map((month, index) => {
    const [liquid, mwekeza] = values[member.id][index]

    return {
      ...month,
      liquid,
      mwekeza,
    }
  }),
}))
