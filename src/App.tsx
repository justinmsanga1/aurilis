import {
  ArrowLeft,
  Bell,
  Bot,
  Camera,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  Trash2,
  TriangleAlert,
  Trophy,
  Home,
  Landmark,
  LogOut,
  Menu,
  MessageCircle,
  Megaphone,
  PieChart,
  Plus,
  ReceiptText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import { type CSSProperties, type ChangeEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import { type FundKey, type Member, members as seedMembers, settings } from './data'
import {
  allJulyPlans,
  allocatePaymentAmount,
  contributionMonthCountForMember,
  currentCycleMonthKey,
  debtBookTotal,
  formatTzs,
  getMemberRecords,
  historicalTotals,
  initials,
  julyPlanForMember,
  julySummary,
  liveFundTotals,
  normalizeAllocation,
  penaltyPlansForMonth,
  penaltyReviewMonths,
  transactionTotals,
  transactionsToOverrides,
  type PaymentMethod,
  type TransactionRecord,
} from './finance'
import {
  enableLiveStorage,
  forceEnableLiveStorage,
  getLiveStorageCooldownRemaining,
  onStorageStatus,
  type StorageStatus,
  useStoredState,
} from './storage'

type Tab =
  | 'dashboard'
  | 'members'
  | 'payments'
  | 'penalty'
  | 'funds'
  | 'projects'
  | 'reports'
  | 'settings'
  | 'notices'
  | 'meetings'
  | 'chat'
  | 'profile'

type LoginState = {
  username: string
  password: string
  error: string
}

const appTabs: Tab[] = [
  'dashboard',
  'members',
  'payments',
  'penalty',
  'funds',
  'projects',
  'reports',
  'settings',
  'notices',
  'meetings',
  'chat',
  'profile',
]

const tabFromHash = (): Tab => {
  const hash = window.location.hash.replace('#', '')

  return appTabs.includes(hash as Tab) ? (hash as Tab) : 'dashboard'
}

const writeTabHash = (tab: Tab) => {
  if (window.location.hash === `#${tab}`) return
  window.history.replaceState(null, '', `#${tab}`)
}

type AvatarMap = Record<string, string>

type MemberDraft = {
  fullName: string
  username: string
  password: string
}

type PaymentDraft = {
  memberId: string
  amount: string
  method: PaymentMethod
  date: string
  note: string
}

type NoticeType = 'Reminder' | 'Meeting' | 'Project Update' | 'Emergency'

type Announcement = {
  id: string
  type: NoticeType
  title: string
  body: string
  date: string
  createdBy: string
}

type AnnouncementDraft = {
  type: NoticeType
  title: string
  body: string
}

type Meeting = {
  id: string
  title: string
  date: string
  time: string
  location: string
  agenda: string
  minutes: string
  actionItems: string
  attendance: Record<string, boolean>
  createdBy: string
}

type MeetingDraft = {
  title: string
  date: string
  time: string
  location: string
  agenda: string
}

type ChatMessage = {
  id: string
  memberId: string
  body: string
  createdAt: string
}

type ProjectRole = 'Project Chairman' | 'Project Cashier' | 'Project Member'
type ProjectStatus = 'Planning' | 'Active' | 'Completed' | 'Paused'
type ProjectEntryType = 'Income' | 'Expense'

type ProjectMemberAssignment = {
  memberId: string
  role: ProjectRole
}

type ProjectEntry = {
  id: string
  type: ProjectEntryType
  amount: number
  date: string
  note: string
}

type ProjectRecord = {
  id: string
  name: string
  description: string
  startDate: string
  investmentAmount: number
  status: ProjectStatus
  members: ProjectMemberAssignment[]
  entries: ProjectEntry[]
  createdBy: string
}

type ProjectDraft = {
  name: string
  description: string
  startDate: string
  investmentAmount: string
  status: ProjectStatus
  memberRoles: Record<string, ProjectRole | ''>
}

type ProjectEntryDraft = {
  type: ProjectEntryType
  amount: string
  date: string
  note: string
}

type BalanceAdjustment = {
  id: string
  fund: FundKey
  amount: number
  date: string
  reason: string
  adjustedBy: string
  createdAt: string
}

type BalanceAdjustmentDraft = {
  fund: FundKey
  direction: 'increase' | 'decrease'
  amount: string
  date: string
  reason: string
}

type BackupPayload = {
  app: 'Auralis Holdings'
  version: 1
  exportedAt: string
  members: Member[]
  transactions: TransactionRecord[]
  projects: ProjectRecord[]
  announcements: Announcement[]
  meetings: Meeting[]
  chatMessages: ChatMessage[]
  avatars: AvatarMap
  reports?: ReportSnapshot[]
  balanceAdjustments?: BalanceAdjustment[]
}

type ReportSnapshot = {
  id: string
  scope: 'Chairman' | 'Cashier' | 'Member'
  memberId: string
  action: 'copy' | 'csv'
  title: string
  body: string
  createdAt: string
  createdBy: string
}

type AssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  body: string
  createdAt: string
}

type ReportScope = 'mine' | 'group'
type ReportRange = 'month' | 'last3' | 'all'

const navItems: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'members', label: 'Members', icon: UsersRound },
  { id: 'payments', label: 'Payments', icon: ReceiptText },
  { id: 'projects', label: 'Projects', icon: PieChart },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'reports', label: 'Reports', icon: ReceiptText },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'notices', label: 'Updates', icon: Megaphone },
  { id: 'funds', label: 'Funds', icon: Landmark },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const tabsWithComingSoon: Array<{ label: string; icon: typeof Home }> = []

const todayInputValue = () => {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

const dateInputValue = (date: Date) => {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : new Date(date)
  safeDate.setMinutes(safeDate.getMinutes() - safeDate.getTimezoneOffset())

  return safeDate.toISOString().slice(0, 10)
}

const parseMoney = (value: string) => {
  const amount = Number(value.replace(/,/g, '').trim())

  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

const formatDateLabel = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateValue

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

const monthLabelForDate = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date

  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(safeDate)
}

const shortMonthLabelForDate = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date

  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
  }).format(safeDate)
}

const deadlineForDate = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date

  return new Date(safeDate.getFullYear(), safeDate.getMonth(), settings.graceDay)
}

const deadlineLabelForDate = (dateValue: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(deadlineForDate(dateValue))

const isPastDeadline = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false

  return date.getTime() > deadlineForDate(dateValue).getTime()
}

const monthKeyFromDateValue = (dateValue: string) => {
  const date = new Date(`${dateValue}T00:00:00`)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date

  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`
}

const monthKeysForReportRange = (
  range: ReportRange,
  baseDateValue = todayInputValue(),
) => {
  if (range === 'all') return null

  const date = new Date(`${baseDateValue}T00:00:00`)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const monthCount = range === 'last3' ? 3 : 1

  return Array.from({ length: monthCount }, (_, index) => {
    const target = new Date(safeDate.getFullYear(), safeDate.getMonth() - index, 1)

    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
  })
}

const transactionInReportRange = (
  transaction: TransactionRecord,
  range: ReportRange,
  baseDateValue = todayInputValue(),
) => {
  const allowedMonths = monthKeysForReportRange(range, baseDateValue)
  if (!allowedMonths) return true

  return allowedMonths.includes(monthKeyFromDateValue(transaction.date))
}

const reportRangeLabel = (range: ReportRange) => {
  if (range === 'month') return 'This month'
  if (range === 'last3') return 'Last 3 months'

  return 'All time'
}

const contributionTotalsForRange = (
  memberId: string,
  transactions: TransactionRecord[],
  range: ReportRange,
  baseDateValue = todayInputValue(),
) => {
  const allowedMonths = monthKeysForReportRange(range, baseDateValue)
  const imported = getMemberRecords(memberId)
    .filter((record) => !allowedMonths || allowedMonths.includes(record.month))
    .reduce((sum, record) => sum + record.liquid + record.mwekeza, 0)
  const manual = transactions
    .filter(
      (transaction) =>
        transaction.memberId === memberId &&
        transactionInReportRange(transaction, range, baseDateValue),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  return {
    imported,
    manual,
    total: imported + manual,
  }
}

const balanceAdjustmentTotals = (adjustments: BalanceAdjustment[]) =>
  adjustments.reduce(
    (totals, adjustment) => ({
      liquid: totals.liquid + (adjustment.fund === 'liquid' ? adjustment.amount : 0),
      mwekeza:
        totals.mwekeza + (adjustment.fund === 'mwekeza' ? adjustment.amount : 0),
    }),
    { liquid: 0, mwekeza: 0 },
  )

const applyBalanceAdjustments = (
  fundTotals: ReturnType<typeof liveFundTotals>,
  adjustments: BalanceAdjustment[],
) => {
  const adjustmentTotals = balanceAdjustmentTotals(adjustments)
  const liquid = fundTotals.liquid + adjustmentTotals.liquid
  const mwekeza = fundTotals.mwekeza + adjustmentTotals.mwekeza

  return {
    ...fundTotals,
    liquid,
    mwekeza,
    combined: liquid + mwekeza,
    calculated: fundTotals,
    adjustments: adjustmentTotals,
    adjustmentTotal: adjustmentTotals.liquid + adjustmentTotals.mwekeza,
  }
}

function App() {
  const currentDateValue = todayInputValue()
  const currentMonthLabel = monthLabelForDate(currentDateValue)
  const [appMembers, setAppMembers] = useStoredState<Member[]>(
    'auralis-members-v1',
    seedMembers,
  )
  const [activeUserId, setActiveUserId] = useState<string | null>(() =>
    window.localStorage.getItem('auralis-active-user-id'),
  )
  const [login, setLogin] = useState<LoginState>({
    username: '',
    password: '',
    error: '',
  })
  const fallbackUser = appMembers[0] ?? seedMembers[0]
  const activeUser = activeUserId
    ? (appMembers.find((member) => member.id === activeUserId) ?? null)
    : null
  const isAdmin = activeUser?.role === 'Chairman'
  const canRecordPayments = activeUser?.role === 'Chairman' || activeUser?.role === 'Cashier'
  const canManageReports = activeUser?.role === 'Cashier'
  const canManageComms = activeUser?.role === 'Chairman' || activeUser?.role === 'Secretary'
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromHash())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [storageHealth, setStorageHealth] = useState<Record<string, StorageStatus>>({})
  const [liveCooldownRemaining, setLiveCooldownRemaining] = useState(() =>
    getLiveStorageCooldownRemaining(),
  )

  useEffect(() => {
    return onStorageStatus((key, status) => {
      setStorageHealth((current) => ({ ...current, [key]: status }))
    })
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveCooldownRemaining(getLiveStorageCooldownRemaining())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [seenNotifications, setSeenNotifications] = useState<Record<string, number>>(
    () => {
      try {
        return JSON.parse(window.localStorage.getItem('auralis-seen-notifications') ?? '{}')
      } catch {
        return {}
      }
    },
  )
  const [selectedMemberId, setSelectedMemberId] = useState(fallbackUser.id)
  const [memberDetailOpen, setMemberDetailOpen] = useState(false)
  const [memberDraft, setMemberDraft] = useState<MemberDraft>({
    fullName: '',
    username: '',
    password: '1234',
  })
  const [announcements, setAnnouncements] = useStoredState<Announcement[]>(
    'auralis-announcements-v1',
    [
      {
        id: 'notice-july-contribution',
        type: 'Reminder',
        title: `${currentMonthLabel} contribution cycle is open`,
        body: 'Members should complete the normal contribution plus current debt due before the day-10 guard.',
        date: currentDateValue,
        createdBy: 'geoffrey-kapinga',
      },
    ],
  )
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft>({
    type: 'Reminder',
    title: '',
    body: '',
  })
  const [meetings, setMeetings] = useStoredState<Meeting[]>('auralis-meetings-v1', [
    {
      id: 'meeting-july-review',
      title: `${currentMonthLabel} contribution review`,
      date: dateInputValue(deadlineForDate(currentDateValue)),
      time: '19:00',
      location: 'Online',
      agenda: 'Review monthly payments, current debt due progress, and penalty guard status.',
      minutes: '',
      actionItems: '',
      attendance: {},
      createdBy: 'geoffrey-kapinga',
    },
  ])
  const [meetingDraft, setMeetingDraft] = useState<MeetingDraft>({
    title: '',
    date: dateInputValue(deadlineForDate(currentDateValue)),
    time: '19:00',
    location: '',
    agenda: '',
  })
  const [chatMessages, setChatMessages] = useStoredState<ChatMessage[]>(
    'auralis-chat-v1',
    [
      {
        id: 'chat-welcome',
        memberId: 'geoffrey-kapinga',
        body: 'Welcome to the Auralis Holdings group room.',
        createdAt: new Date().toISOString(),
      },
    ],
  )
  const [chatDraft, setChatDraft] = useState('')
  const [assistantDraft, setAssistantDraft] = useState('')
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: 'auralis-welcome',
      role: 'assistant',
      body: "Hey! I'm Auralis, your group's finance buddy. I know all the numbers — payments, debts, penalties, funds, you name it. Just ask me anything about the money stuff.",
      createdAt: new Date().toISOString(),
    },
  ])
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const [reportCopied, setReportCopied] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [reports, setReports] = useStoredState<ReportSnapshot[]>(
    'auralis-reports-v1',
    [],
  )
  const [balanceAdjustments, setBalanceAdjustments] = useStoredState<
    BalanceAdjustment[]
  >('auralis-balance-adjustments-v1', [])
  const [balanceAdjustmentDraft, setBalanceAdjustmentDraft] =
    useState<BalanceAdjustmentDraft>({
      fund: 'liquid',
      direction: 'increase',
      amount: '',
      date: todayInputValue(),
      reason: '',
    })
  const [transactions, setTransactions] = useStoredState<TransactionRecord[]>(
    'auralis-transactions-v1',
    [],
  )
  const [projects, setProjects] = useStoredState<ProjectRecord[]>(
    'auralis-projects-v1',
    [],
  )
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>({
    name: '',
    description: '',
    startDate: currentDateValue,
    investmentAmount: '',
    status: 'Planning',
    memberRoles: {},
  })
  const [projectEntryDrafts, setProjectEntryDrafts] = useState<
    Record<string, ProjectEntryDraft>
  >({})
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({
    memberId: fallbackUser.id,
    amount: '',
    method: 'Mobile Money',
    date: todayInputValue(),
    note: `${currentMonthLabel} contribution received`,
  })
  const [avatars, setAvatars] = useStoredState<AvatarMap>('auralis-avatars-v1', {})

  const selectedMember =
    appMembers.find((member) => member.id === selectedMemberId) ?? activeUser ?? fallbackUser
  const availableNavItems = navItems.filter((item) => {
    if (!isAdmin && item.id === 'settings') return false
    if (!canRecordPayments && item.id === 'payments') return false
    return true
  })
  const paymentOverrides = transactionsToOverrides(transactions)
  const projectInvestmentTotal = projects.reduce(
    (sum, project) => sum + project.investmentAmount,
    0,
  )
  const calculatedFundTotals = liveFundTotals(transactions, projectInvestmentTotal)
  const fundTotals = applyBalanceAdjustments(calculatedFundTotals, balanceAdjustments)
  const summary = julySummary(appMembers, paymentOverrides, transactions)
  const plans = allJulyPlans(appMembers, paymentOverrides, transactions)
  const selectedPlan = julyPlanForMember(selectedMember.id, paymentOverrides, transactions)
  const visibleProjects = projects
  const collectionRate =
    summary.totalDue > 0 ? Math.round((summary.totalPaid / summary.totalDue) * 100) : 0

  const penaltyTrendData = useMemo(() => {
    const monthMap = new Map<string, number>()
    for (const transaction of transactions) {
      const alloc = normalizeAllocation(transaction.allocation)
      if (alloc.penalty <= 0) continue
      const mk = transaction.date.slice(0, 7)
      monthMap.set(mk, (monthMap.get(mk) ?? 0) + alloc.penalty)
    }
    const sorted = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
    const last7 = sorted.slice(-7)
    let cumulative = 0
    return last7.map(([month, penalty]) => {
      cumulative += penalty
      return { month, penalty, cumulative }
    })
  }, [transactions])

  const totalPenaltyCollected = penaltyTrendData.reduce((s, d) => s + d.penalty, 0)

  const topDebtors = useMemo(
    () =>
      [...plans]
        .sort((a, b) => b.plan.remaining - a.plan.remaining)
        .slice(0, 4),
    [plans],
  )
  const notificationItems = [
    ...announcements.slice(0, 3).map((notice) => ({
      id: `notice-${notice.id}`,
      title: notice.title,
      body: `${notice.type} / ${notice.date}`,
      tone: notice.type === 'Emergency' ? 'danger' : 'info',
    })),
    ...meetings.slice(0, 2).map((meeting) => ({
      id: `meeting-${meeting.id}`,
      title: meeting.title,
      body: `${meeting.date} at ${meeting.time}`,
      tone: 'calendar',
    })),
    ...chatMessages.slice(-3).reverse().map((message) => {
      const member = appMembers.find((item) => item.id === message.memberId)

      return {
        id: `chat-${message.id}`,
        title: member ? `${member.fullName} sent a chat` : 'New chat message',
        body: message.body,
        tone: 'chat',
      }
    }),
    ...transactions.slice(0, 3).map((transaction) => {
      const member = appMembers.find((item) => item.id === transaction.memberId)

      return {
        id: `payment-${transaction.id}`,
        title: `${formatTzs(transaction.amount)} recorded`,
        body: `${member?.fullName ?? 'Member'} / ${transaction.date}`,
        tone: 'money',
      }
    }),
  ].slice(0, 6)
  const notificationOwner = activeUser?.id ?? 'guest'
  const chatSeenKey = `${notificationOwner}:chat`
  const updatesSeenKey = `${notificationOwner}:updates`
  const chatSeenAt = seenNotifications[chatSeenKey] ?? 0
  const updatesSeenAt = seenNotifications[updatesSeenKey] ?? 0
  const chatUnreadCount = activeUser
    ? chatMessages.filter(
        (message) =>
          message.memberId !== activeUser.id && Date.parse(message.createdAt) > chatSeenAt,
      ).length
    : 0
  const updateNotificationTimes = [
    ...announcements.map((notice) => Date.parse(`${notice.date}T23:59:59`)),
    ...meetings.map((meeting) => Date.parse(`${meeting.date}T${meeting.time || '00:00'}`)),
  ].filter(Number.isFinite)
  const updatesUnreadCount = updateNotificationTimes.filter((time) => time > updatesSeenAt).length
  const notificationBadgeCount = chatUnreadCount + updatesUnreadCount
  const mobileCoreIds: Tab[] = isAdmin
    ? ['dashboard', 'members', 'payments', 'projects']
    : canRecordPayments
      ? ['dashboard', 'members', 'payments', 'chat']
      : ['dashboard', 'members', 'projects', 'chat']
  const mobileCoreItems = availableNavItems.filter((item) =>
    mobileCoreIds.includes(item.id),
  )
  const mobileMenuItems = availableNavItems.filter(
    (item) => !mobileCoreIds.includes(item.id),
  )
  const badgeForTab = (tab: Tab) => {
    if (tab === 'chat') return chatUnreadCount
    if (tab === 'notices' || tab === 'meetings') return updatesUnreadCount
    return 0
  }
  const mobileMenuBadgeCount = mobileMenuItems.reduce(
    (sum, item) => sum + badgeForTab(item.id),
    0,
  )
  const markNotificationSeen = (kind: 'chat' | 'updates') => {
    const key = kind === 'chat' ? chatSeenKey : updatesSeenKey
    setSeenNotifications((current) => ({
      ...current,
      [key]: Date.now(),
    }))
  }
  const navigateTo = (tab: Tab) => {
    if (!canRecordPayments && (tab === 'payments' || tab === 'penalty')) return
    if (!isAdmin && tab === 'settings') return
    if (tab === 'chat') markNotificationSeen('chat')
    if (tab === 'notices' || tab === 'meetings') markNotificationSeen('updates')
    setActiveTab(tab)
    writeTabHash(tab)
    setMobileMenuOpen(false)
    setNotificationsOpen(false)
    if (tab === 'members') setMemberDetailOpen(false)
  }

  useEffect(() => {
    if (!activeUserId) {
      window.localStorage.removeItem('auralis-active-user-id')
      return
    }

    window.localStorage.setItem('auralis-active-user-id', activeUserId)
  }, [activeUserId])

  useEffect(() => {
    if (
      (!canRecordPayments && (activeTab === 'payments' || activeTab === 'penalty')) ||
      (!isAdmin && activeTab === 'settings')
    ) {
      setActiveTab('dashboard')
      writeTabHash('dashboard')
    }
  }, [activeTab, canRecordPayments, isAdmin])

  useEffect(() => {
    writeTabHash(activeTab)
  }, [activeTab])

  useEffect(() => {
    const syncTabFromHash = () => {
      const nextTab = tabFromHash()

      if (nextTab === activeTab) return
      setActiveTab(nextTab)
      if (nextTab === 'members') setMemberDetailOpen(false)
    }

    window.addEventListener('hashchange', syncTabFromHash)
    return () => window.removeEventListener('hashchange', syncTabFromHash)
  }, [activeTab])

  useEffect(() => {
    window.localStorage.setItem(
      'auralis-seen-notifications',
      JSON.stringify(seenNotifications),
    )
  }, [seenNotifications])

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault()
    const found = appMembers.find(
      (member) =>
        member.username.toLowerCase() === login.username.trim().toLowerCase() &&
        member.password === login.password,
    )

    if (!found) {
      setLogin((current) => ({
        ...current,
        error: 'Check the username and password.',
      }))
      return
    }

    setActiveUserId(found.id)
    setSelectedMemberId(found.id)
    window.localStorage.setItem('auralis-active-user-id', found.id)
    const loginTab = found.role === 'Chairman' ? 'dashboard' : 'profile'
    setActiveTab(loginTab)
    writeTabHash(loginTab)
  }

  const handleAvatar = (memberId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return

      setAvatars((current) => ({
        ...current,
        [memberId]: reader.result as string,
      }))
    }
    reader.readAsDataURL(file)
  }

  const recordPayment = (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser) return
    const amount = parseMoney(paymentDraft.amount)

    if (!Number.isFinite(amount) || amount <= 0) return

    const allocation = allocatePaymentAmount(paymentDraft.memberId, amount, transactions)

    const transaction: TransactionRecord = {
      id: `txn-${Date.now()}`,
      memberId: paymentDraft.memberId,
      date: paymentDraft.date,
      amount,
      method: paymentDraft.method,
      note: paymentDraft.note,
      recordedBy: activeUser.id,
      allocation,
    }

    setTransactions((current) => [transaction, ...current])
    setSelectedMemberId(paymentDraft.memberId)
    setMemberDetailOpen(true)
    setActiveTab('members')
    setPaymentDraft((current) => ({
      ...current,
      amount: '',
      note: `${monthLabelForDate(current.date)} contribution received`,
    }))
  }

  const addMember = (event: React.FormEvent) => {
    event.preventDefault()
    const fullName = memberDraft.fullName.trim()
    const username = memberDraft.username.trim().toLowerCase()
    const password = memberDraft.password.trim() || '1234'

    if (!fullName || !username) return
    if (appMembers.some((member) => member.username.toLowerCase() === username)) return

    const id = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    const nextMember: Member = {
      id,
      fullName,
      username,
      password,
      role: 'Member',
    }

    setAppMembers((current) => [...current, nextMember])
    setMemberDraft({ fullName: '', username: '', password: '1234' })
  }

  const makeChairman = (memberId: string) => {
    if (!activeUser) return
    setAppMembers((current) =>
      current.map((member) => ({
        ...member,
        role:
          member.id === memberId
            ? 'Chairman'
            : member.role === 'Chairman'
              ? 'Member'
              : member.role,
      })),
    )
    if (memberId !== activeUser.id) {
      setActiveTab('profile')
      setMemberDetailOpen(false)
    }
  }

  const makeCashier = (memberId: string) => {
    setAppMembers((current) =>
      current.map((member) => ({
        ...member,
        role:
          member.id === memberId
            ? member.role === 'Cashier'
              ? 'Member'
              : 'Cashier'
            : member.role,
      })),
    )
  }

  const makeSecretary = (memberId: string) => {
    setAppMembers((current) =>
      current.map((member) => ({
        ...member,
        role:
          member.id === memberId
            ? member.role === 'Secretary'
              ? 'Member'
              : 'Secretary'
            : member.role,
      })),
    )
  }

  const deleteTransaction = (transactionId: string) => {
    setTransactions((current) =>
      current.filter((transaction) => transaction.id !== transactionId),
    )
  }

  const deleteMember = (memberId: string) => {
    if (!activeUser) return
    if (memberId === activeUser.id) return
    setAppMembers((current) => current.filter((member) => member.id !== memberId))
    setTransactions((current) =>
      current.filter((transaction) => transaction.memberId !== memberId),
    )
    setProjects((current) =>
      current.map((project) => ({
        ...project,
        members: project.members.filter((member) => member.memberId !== memberId),
      })),
    )
    setSelectedMemberId(activeUser.id)
    setMemberDetailOpen(false)
  }

  const updateProjectMemberRole = (memberId: string, role: ProjectRole | '') => {
    setProjectDraft((current) => ({
      ...current,
      memberRoles: {
        ...current.memberRoles,
        [memberId]: role,
      },
    }))
  }

  const createProject = (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser) return
    const name = projectDraft.name.trim()
    const investmentAmount = Number(projectDraft.investmentAmount)
    const members = Object.entries(projectDraft.memberRoles)
      .filter(([, role]) => role)
      .map(([memberId, role]) => ({
        memberId,
        role: role as ProjectRole,
      }))

    if (!name || !Number.isFinite(investmentAmount) || investmentAmount <= 0) return
    if (investmentAmount > calculatedFundTotals.combined) return

    setProjects((current) => [
      {
        id: `project-${Date.now()}`,
        name,
        description: projectDraft.description.trim(),
        startDate: projectDraft.startDate,
        investmentAmount,
        status: projectDraft.status,
        members,
        entries: [],
        createdBy: activeUser.id,
      },
      ...current,
    ])
    setProjectDraft({
      name: '',
      description: '',
      startDate: currentDateValue,
      investmentAmount: '',
      status: 'Planning',
      memberRoles: {},
    })
  }

  const updateProjectStatus = (projectId: string, status: ProjectStatus) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, status } : project,
      ),
    )
  }

  const updateProjectEntryDraft = (
    projectId: string,
    patch: Partial<ProjectEntryDraft>,
  ) => {
    setProjectEntryDrafts((current) => ({
      ...current,
      [projectId]: {
        type: current[projectId]?.type ?? 'Income',
        amount: current[projectId]?.amount ?? '',
        date: current[projectId]?.date ?? new Date().toISOString().slice(0, 10),
        note: current[projectId]?.note ?? '',
        ...patch,
      },
    }))
  }

  const addProjectEntry = (projectId: string, event: React.FormEvent) => {
    event.preventDefault()
    const draft = projectEntryDrafts[projectId]
    const amount = Number(draft?.amount)

    if (!draft || !Number.isFinite(amount) || amount <= 0) return

    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              entries: [
                {
                  id: `project-entry-${Date.now()}`,
                  type: draft.type,
                  amount,
                  date: draft.date,
                  note: draft.note.trim(),
                },
                ...project.entries,
              ],
            }
          : project,
      ),
    )
    setProjectEntryDrafts((current) => ({
      ...current,
      [projectId]: {
        type: draft.type,
        amount: '',
        date: draft.date,
        note: '',
      },
    }))
  }

  const createAnnouncement = (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser) return
    const title = announcementDraft.title.trim()
    const body = announcementDraft.body.trim()

    if (!title || !body) return

    setAnnouncements((current) => [
      {
        id: `notice-${Date.now()}`,
        type: announcementDraft.type,
        title,
        body,
        date: new Date().toISOString().slice(0, 10),
        createdBy: activeUser.id,
      },
      ...current,
    ])
    setAnnouncementDraft({ type: 'Reminder', title: '', body: '' })
  }

  const createMeeting = (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser) return
    const title = meetingDraft.title.trim()
    const agenda = meetingDraft.agenda.trim()

    if (!title || !meetingDraft.date || !meetingDraft.time) return

    setMeetings((current) => [
      {
        id: `meeting-${Date.now()}`,
        title,
        date: meetingDraft.date,
        time: meetingDraft.time,
        location: meetingDraft.location.trim() || 'To be confirmed',
        agenda,
        minutes: '',
        actionItems: '',
        attendance: {},
        createdBy: activeUser.id,
      },
      ...current,
    ])
    setMeetingDraft({
      title: '',
      date: dateInputValue(deadlineForDate(currentDateValue)),
      time: '19:00',
      location: '',
      agenda: '',
    })
  }

  const toggleAttendance = (meetingId: string, memberId: string) => {
    setMeetings((current) =>
      current.map((meeting) =>
        meeting.id === meetingId
          ? {
              ...meeting,
              attendance: {
                ...meeting.attendance,
                [memberId]: !meeting.attendance[memberId],
              },
            }
          : meeting,
      ),
    )
  }

  const updateMeetingField = (
    meetingId: string,
    field: 'minutes' | 'actionItems',
    value: string,
  ) => {
    setMeetings((current) =>
      current.map((meeting) =>
        meeting.id === meetingId ? { ...meeting, [field]: value } : meeting,
      ),
    )
  }

  const sendChatMessage = (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser) return
    const body = chatDraft.trim()

    if (!body) return

    setChatMessages((current) => [
      ...current,
      {
        id: `chat-${Date.now()}`,
        memberId: activeUser.id,
        body,
        createdAt: new Date().toISOString(),
      },
    ])
    setChatDraft('')
  }

  const deleteChatMessage = (messageId: string) => {
    setChatMessages((current) => current.filter((message) => message.id !== messageId))
  }

  const buildAssistantContext = () => ({
    activeUser,
    currentMonth: monthLabelForDate(currentDateValue),
    settings,
    mathRules: {
      monthlyContribution:
        'Monthly contribution is UTT (100,000) plus Mwekeza (20,000) = 120,000 TZS.',
      debt:
        'Real debt owed is recalculated fresh every time: everything a member should have paid from their first tracked month through today, minus everything they have ever actually paid (imported history + every live transaction, any bucket, any month). It is not a fixed snapshot — it grows if they keep missing months and shrinks permanently whenever they pay debt down.',
      debtInstallment:
        'Only during the installment window (July-October 2026): this cycle\'s debt installment is 25% of the current real debt owed, recomputed each month. Outside that window (November 2026+) no debt installment is due — a known gap, flag it if asked.',
      penalty:
        'Penalty is 10% of ONLY this cycle\'s unpaid amount (unpaid debt installment + unpaid normal contribution) — never 10% of the whole debt book. carryover ("debt with penalty") = this cycle\'s unpaid amount + that penalty. If a cycle stays unpaid, the carryover compounds another 10% each following month through November 2026.',
      paymentAllocationOrder:
        'A cashier enters one total amount. It auto-splits in fixed order: penalty owed first, then debt-UTT, then debt-Mwekeza, then normal Mwekeza, then normal UTT, with any leftover becoming overpayment. Penalty is a real payable bucket (allocation.penalty), not just a displayed number.',
      funds:
        'UTT/liquid fund holds normal UTT contributions, UTT debt repayments, overpayments, and penalty money. Mwekeza fund holds normal Mwekeza contributions and Mwekeza debt repayments.',
    },
    fundTotals,
    calculatedFundTotals,
    balanceAdjustments,
    summary,
    members: appMembers.map((member) => ({
      ...member,
      password: undefined,
      records: getMemberRecords(member.id),
    })),
    plans: plans.map(({ member, plan }) => ({
      memberId: member.id,
      memberName: member.fullName,
      role: member.role,
      plan,
    })),
    transactions: transactions.map((transaction) => ({
      ...transaction,
      allocation: normalizeAllocation(transaction.allocation),
    })),
    projects: visibleProjects,
    reports: reports.slice(0, 20),
    announcements,
    meetings,
  })

  const sendAssistantMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser || assistantLoading) return
    const question = assistantDraft.trim()

    if (!question) return

    const userMessage: AssistantMessage = {
      id: `auralis-user-${Date.now()}`,
      role: 'user',
      body: question,
      createdAt: new Date().toISOString(),
    }

    setAssistantMessages((current) => [...current, userMessage])
    setAssistantDraft('')
    setAssistantError('')
    setAssistantLoading(true)

    try {
      const response = await fetch('/api/assistant', {
        body: JSON.stringify({
          question,
          context: buildAssistantContext(),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      const payload = (await response.json()) as { answer?: string; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Auralis assistant failed')

      setAssistantMessages((current) => [
        ...current,
        {
          id: `auralis-answer-${Date.now()}`,
          role: 'assistant',
          body: payload.answer || 'I could not answer that yet.',
          createdAt: new Date().toISOString(),
        },
      ])
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : 'Auralis assistant failed')
    } finally {
      setAssistantLoading(false)
    }
  }

  const saveReportSnapshot = (
    action: ReportSnapshot['action'],
    title: string,
    body: string,
  ) => {
    if (!activeUser) return

    const snapshot: ReportSnapshot = {
      id: `report-${Date.now()}-${action}`,
      scope: activeUser.role === 'Cashier' ? 'Cashier' : isAdmin ? 'Chairman' : 'Member',
      memberId: activeUser.id,
      action,
      title,
      body,
      createdAt: new Date().toISOString(),
      createdBy: activeUser.id,
    }

    setReports((current) => [snapshot, ...current].slice(0, 200))
  }

  const copyReport = async (title: string, text: string) => {
    await navigator.clipboard.writeText(text)
    saveReportSnapshot('copy', title, text)
    setReportCopied(true)
    window.setTimeout(() => setReportCopied(false), 1600)
  }

  const recordBalanceAdjustment = (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeUser || activeUser.role !== 'Cashier') return

    const amount = parseMoney(balanceAdjustmentDraft.amount)
    const reason = balanceAdjustmentDraft.reason.trim()

    if (amount <= 0 || !reason) return

    const adjustment: BalanceAdjustment = {
      id: `balance-adjustment-${Date.now()}`,
      fund: balanceAdjustmentDraft.fund,
      amount: balanceAdjustmentDraft.direction === 'decrease' ? -amount : amount,
      date: balanceAdjustmentDraft.date,
      reason,
      adjustedBy: activeUser.id,
      createdAt: new Date().toISOString(),
    }

    setBalanceAdjustments((current) => [adjustment, ...current])
    setBalanceAdjustmentDraft((current) => ({
      ...current,
      amount: '',
      date: todayInputValue(),
      reason: '',
    }))
  }

  const exportBackup = () => {
    const backup: BackupPayload = {
      app: 'Auralis Holdings',
      version: 1,
      exportedAt: new Date().toISOString(),
      members: appMembers,
      transactions,
      projects,
      announcements,
      meetings,
      chatMessages,
      avatars,
      reports,
      balanceAdjustments,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `auralis-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setBackupMessage('Backup exported.')
  }

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<BackupPayload>

        if (parsed.app !== 'Auralis Holdings' || parsed.version !== 1) {
          setBackupMessage('This backup file is not valid for Auralis Holdings.')
          return
        }

        setAppMembers(Array.isArray(parsed.members) ? parsed.members : seedMembers)
        setTransactions(
          Array.isArray(parsed.transactions) ? parsed.transactions : [],
        )
        setProjects(Array.isArray(parsed.projects) ? parsed.projects : [])
        setAnnouncements(
          Array.isArray(parsed.announcements) ? parsed.announcements : [],
        )
        setMeetings(Array.isArray(parsed.meetings) ? parsed.meetings : [])
        setChatMessages(
          Array.isArray(parsed.chatMessages) ? parsed.chatMessages : [],
        )
        setAvatars(parsed.avatars && typeof parsed.avatars === 'object' ? parsed.avatars : {})
        setReports(Array.isArray(parsed.reports) ? parsed.reports : [])
        setBalanceAdjustments(
          Array.isArray(parsed.balanceAdjustments)
            ? parsed.balanceAdjustments
            : [],
        )
        setSelectedMemberId(parsed.members?.[0]?.id ?? seedMembers[0].id)
        setActiveUserId(parsed.members?.[0]?.id ?? seedMembers[0].id)
        setBackupMessage('Backup restored.')
      } catch {
        setBackupMessage('Could not read that backup file.')
      } finally {
        event.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  if (!activeUser) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <div className="brand-lockup">
            <div className="brand-mark">AH</div>
            <div>
              <p className="eyebrow">Private group finance</p>
              <h1>Auralis Holdings</h1>
            </div>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Username
              <input
                autoComplete="username"
                placeholder="Enter your username"
                value={login.username}
                onChange={(event) =>
                  setLogin((current) => ({
                    ...current,
                    username: event.target.value,
                    error: '',
                  }))
                }
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                placeholder="Enter your password"
                type="password"
                value={login.password}
                onChange={(event) =>
                  setLogin((current) => ({
                    ...current,
                    password: event.target.value,
                    error: '',
                  }))
                }
              />
            </label>
            {login.error ? <p className="form-error">{login.error}</p> : null}
            <button className="primary-button" type="submit">
              <ShieldCheck size={18} />
              Sign in
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <div className="brand-mark">AH</div>
          <div>
            <strong>Auralis</strong>
            <span>
              {isAdmin
                ? 'Chairman Console'
                : activeUser.role === 'Cashier'
                  ? 'Cashier Console'
                  : 'Member Portal'}
            </span>
          </div>
        </div>
        <nav className="desktop-nav" aria-label="Main navigation">
          {availableNavItems.map((item) => (
            <button
              className={activeTab === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => navigateTo(item.id)}
              type="button"
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="coming-stack">
          {tabsWithComingSoon.map((item) => (
            <div className="coming-pill" key={item.label}>
              <item.icon size={16} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-strip">
            <span>{currentMonthLabel} cycle</span>
            <b>{collectionRate}% collected</b>
            <small>{summary.membersAtRisk} at risk</small>
          </div>
          <div className="topbar-actions">
            <button
              className={notificationsOpen ? 'icon-button alert active' : 'icon-button alert'}
              type="button"
              aria-label="Notifications"
              onClick={() => {
                const shouldOpen = !notificationsOpen
                if (shouldOpen) {
                  markNotificationSeen('chat')
                  markNotificationSeen('updates')
                }
                setNotificationsOpen(shouldOpen)
              }}
            >
              <Bell size={20} />
              {notificationBadgeCount > 0 ? (
                <b className="nav-badge top-alert">{Math.min(notificationBadgeCount, 9)}</b>
              ) : null}
            </button>
            <Avatar
              memberName={activeUser.fullName}
              avatar={avatars[activeUser.id]}
              size="small"
            />
          </div>
          {notificationsOpen ? (
            <div className="notification-popover">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Live updates</p>
                  <h2>Notifications</h2>
                </div>
                <Bell size={18} />
              </div>
              <div className="notification-list">
                {notificationItems.length === 0 ? (
                  <div className="notification-item empty">
                    <strong>No notifications yet</strong>
                    <span>New notices, meetings, and payments will appear here.</span>
                  </div>
                ) : (
                  notificationItems.map((item) => (
                    <button
                      className={`notification-item ${item.tone}`}
                      key={item.id}
                      onClick={() => setNotificationsOpen(false)}
                      type="button"
                    >
                      <i />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.body}</small>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </header>

        {Object.values(storageHealth).some(
          (status) => status === 'stale' || status === 'paused',
        ) ? (
          <div className="storage-warning-banner" role="alert">
            <TriangleAlert size={16} />
            <span>
              Live database loading is paused to protect Supabase while it recovers.
              Figures below are offline seed values until you reconnect.
            </span>
            <button
              onClick={() => {
                if (liveCooldownRemaining > 0) {
                  forceEnableLiveStorage()
                  return
                }

                setLiveCooldownRemaining(getLiveStorageCooldownRemaining())
                enableLiveStorage()
              }}
              type="button"
            >
              {liveCooldownRemaining > 0
                ? 'Reset and load'
                : 'Load live data'}
            </button>
          </div>
        ) : null}

        {activeTab === 'dashboard' ? (
          <Dashboard
            activeUser={activeUser}
            avatars={avatars}
            canRecord={canRecordPayments}
            collectionRate={collectionRate}
            debtTotal={debtBookTotal(appMembers, transactions)}
            fundTotals={fundTotals}
            memberCount={appMembers.length}
            onOpenPenalty={() => setActiveTab('penalty')}
            penaltyTrendData={penaltyTrendData}
            totalPenaltyCollected={totalPenaltyCollected}
            personalPlan={julyPlanForMember(activeUser.id, paymentOverrides, transactions)}
            plans={plans}
            projectCount={projects.length}
            summary={summary}
            topDebtors={topDebtors}
            transactions={transactions}
            openMember={(memberId) => {
              setSelectedMemberId(memberId)
              setMemberDetailOpen(true)
              setActiveTab('members')
            }}
          />
        ) : null}

        {activeTab === 'penalty' && canRecordPayments ? (
          <PenaltyView
            avatars={avatars}
            members={appMembers}
            onBack={() => setActiveTab('dashboard')}
            onOpenMember={(memberId) => {
              setSelectedMemberId(memberId)
              setMemberDetailOpen(true)
              setActiveTab('members')
            }}
            transactions={transactions}
          />
        ) : null}

        {activeTab === 'members' ? (
          <MembersView
            activeUser={activeUser}
            avatars={avatars}
            detailOpen={memberDetailOpen}
            draft={memberDraft}
            isAdmin={isAdmin}
            onAvatar={handleAvatar}
            onBack={() => setMemberDetailOpen(false)}
            onDelete={deleteMember}
            onDraft={setMemberDraft}
            onMakeChairman={makeChairman}
            onMakeCashier={makeCashier}
            onMakeSecretary={makeSecretary}
            onMemberAdd={addMember}
            onSelect={(memberId) => {
              setSelectedMemberId(memberId)
              setMemberDetailOpen(true)
            }}
            plans={plans}
            selectedMember={selectedMember}
            selectedPlan={selectedPlan}
            transactions={transactions}
          />
        ) : null}

        {activeTab === 'payments' ? (
          <PaymentsView
            canRecord={canRecordPayments}
            members={appMembers}
            draft={paymentDraft}
            onDraft={setPaymentDraft}
            onDeleteTransaction={deleteTransaction}
            onRecord={recordPayment}
            plans={plans}
            transactions={transactions}
          />
        ) : null}

        {activeTab === 'funds' ? (
          <FundsView
            adjustments={balanceAdjustments}
            activeUser={activeUser}
            canAdjustBalance={activeUser.role === 'Cashier'}
            draft={balanceAdjustmentDraft}
            fundTotals={fundTotals}
            members={appMembers}
            onAdjust={recordBalanceAdjustment}
            onDraft={setBalanceAdjustmentDraft}
            transactions={transactions}
          />
        ) : null}

        {activeTab === 'projects' ? (
          <ProjectsView
            activeUser={activeUser}
            canManage={isAdmin}
            draft={projectDraft}
            entryDrafts={projectEntryDrafts}
            fundTotals={calculatedFundTotals}
            members={appMembers}
            onCreate={createProject}
            onDraft={setProjectDraft}
            onEntryDraft={updateProjectEntryDraft}
            onEntrySave={addProjectEntry}
            onMemberRole={updateProjectMemberRole}
            onStatus={updateProjectStatus}
            projects={visibleProjects}
          />
        ) : null}

        {activeTab === 'reports' ? (
          <ReportsView
            activeUser={activeUser}
            canManageReports={canManageReports}
            copied={reportCopied}
            fundTotals={fundTotals}
            isAdmin={isAdmin}
            members={appMembers}
            onCopy={copyReport}
            onSnapshot={saveReportSnapshot}
            plans={plans}
            projects={visibleProjects}
            summary={summary}
            transactions={transactions}
          />
        ) : null}

        {activeTab === 'settings' && isAdmin ? (
          <SettingsView
            backupMessage={backupMessage}
            chatCount={chatMessages.length}
            memberCount={appMembers.length}
            meetingCount={meetings.length}
            noticeCount={announcements.length}
            onBackup={exportBackup}
            onImport={importBackup}
            projectCount={projects.length}
            transactionCount={transactions.length}
          />
        ) : null}

        {activeTab === 'notices' || activeTab === 'meetings' ? (
          <UpdatesView
            announcements={announcements}
            canManage={canManageComms}
            members={appMembers}
            meetingDraft={meetingDraft}
            meetings={meetings}
            noticeDraft={announcementDraft}
            onCreateMeeting={createMeeting}
            onCreateNotice={createAnnouncement}
            onMeetingDraft={setMeetingDraft}
            onMeetingField={updateMeetingField}
            onNoticeDraft={setAnnouncementDraft}
            onToggleAttendance={toggleAttendance}
          />
        ) : null}

        {activeTab === 'chat' ? (
          <ChatView
            activeUser={activeUser}
            avatars={avatars}
            draft={chatDraft}
            isAdmin={isAdmin}
            members={appMembers}
            messages={chatMessages}
            onDelete={deleteChatMessage}
            onDraft={setChatDraft}
            onSend={sendChatMessage}
          />
        ) : null}

        {activeTab === 'profile' ? (
          <ProfileView
            announcements={announcements}
            avatar={avatars[activeUser.id]}
            meetings={meetings}
            user={activeUser}
            plan={julyPlanForMember(activeUser.id, paymentOverrides, transactions)}
            projects={visibleProjects}
            transactions={transactions.filter(
              (transaction) => transaction.memberId === activeUser.id,
            )}
            onAvatar={handleAvatar}
            onLogout={() => {
              setActiveUserId(null)
              window.localStorage.removeItem('auralis-active-user-id')
              setActiveTab('dashboard')
            }}
            onOpenReport={() => setActiveTab('reports')}
          />
        ) : null}
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {mobileCoreItems.map((item) => (
          <button
            className={activeTab === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => navigateTo(item.id)}
            type="button"
          >
            <item.icon size={20} />
            <span>{item.label}</span>
            {badgeForTab(item.id) > 0 ? (
              <b className="nav-badge">{Math.min(badgeForTab(item.id), 9)}</b>
            ) : null}
          </button>
        ))}
        {mobileMenuItems.length > 0 ? (
          <button
            className={mobileMenuOpen ? 'active' : ''}
            onClick={() => setMobileMenuOpen((open) => !open)}
            type="button"
          >
            <Menu size={20} />
            <span>Menu</span>
            {mobileMenuBadgeCount > 0 ? (
              <b className="nav-badge">{Math.min(mobileMenuBadgeCount, 9)}</b>
            ) : null}
          </button>
        ) : null}
      </nav>
      {mobileMenuOpen ? (
        <div
          className="mobile-menu-panel"
          onClick={() => setMobileMenuOpen(false)}
          role="presentation"
        >
          <div className="mobile-menu-card" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-profile">
              <Avatar
                memberName={activeUser.fullName}
                avatar={avatars[activeUser.id]}
                size="medium"
              />
              <div>
                <strong>{activeUser.fullName}</strong>
                <span>{activeUser.role}</span>
              </div>
              <button
                className="icon-button drawer-close"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
                aria-label="Close menu"
              >
                <Menu size={18} />
              </button>
            </div>
            <div className="mobile-menu-list">
              {mobileMenuItems.map((item) => (
                <button
                  className={activeTab === item.id ? 'active' : ''}
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  type="button"
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {badgeForTab(item.id) > 0 ? (
                    <b className="nav-badge drawer">{Math.min(badgeForTab(item.id), 9)}</b>
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <FloatingAssistant
        draft={assistantDraft}
        error={assistantError}
        loading={assistantLoading}
        messages={assistantMessages}
        onDraft={setAssistantDraft}
        onSend={sendAssistantMessage}
        user={activeUser}
      />
    </div>
  )
}

function Dashboard({
  activeUser,
  avatars,
  canRecord,
  collectionRate,
  debtTotal,
  fundTotals,
  memberCount,
  onOpenPenalty,
  penaltyTrendData,
  totalPenaltyCollected,
  personalPlan,
  plans,
  projectCount,
  summary,
  topDebtors,
  transactions,
  openMember,
}: {
  activeUser: Member
  avatars: AvatarMap
  canRecord: boolean
  collectionRate: number
  debtTotal: number
  fundTotals: ReturnType<typeof historicalTotals>
  memberCount: number
  onOpenPenalty: () => void
  penaltyTrendData: Array<{ month: string; penalty: number; cumulative: number }>
  totalPenaltyCollected: number
  personalPlan: ReturnType<typeof julyPlanForMember>
  plans: ReturnType<typeof allJulyPlans>
  projectCount: number
  summary: ReturnType<typeof julySummary>
  topDebtors: ReturnType<typeof allJulyPlans>
  transactions: TransactionRecord[]
  openMember: (memberId: string) => void
}) {
  const currentDateValue = todayInputValue()
  const currentMonthLabel = monthLabelForDate(currentDateValue)
  const paidMembers = Math.max(memberCount - summary.membersAtRisk, 0)
  const personalProgress =
    personalPlan.due > 0
      ? Math.min(Math.round((personalPlan.paid / personalPlan.due) * 100), 100)
      : 0
  const paidPlans = topDebtors.filter(({ plan }) => plan.remaining === 0).length
  const partialPlans = topDebtors.filter(
    ({ plan }) => plan.paid > 0 && plan.remaining > 0,
  ).length
  const riskPlans = topDebtors.filter(({ plan }) => plan.paid === 0).length
  const progressRows = [
    {
      label: 'Fully paid',
      value: paidPlans,
      tone: 'paid',
    },
    {
      label: 'Partial',
      value: partialPlans,
      tone: 'partial',
    },
    {
      label: 'At risk',
      value: riskPlans,
      tone: 'risk',
    },
  ]
  const penaltyMessage =
    personalPlan.remaining > 0
      ? `${formatTzs(personalPlan.penalty)} at risk`
      : 'No penalty risk'
  const penaltyTrendBars =
    penaltyTrendData.length > 0
      ? penaltyTrendData
      : [
          { month: currentCycleMonthKey(), penalty: 0, cumulative: 0 },
          { month: currentCycleMonthKey(), penalty: 0, cumulative: 0 },
          { month: currentCycleMonthKey(), penalty: 0, cumulative: 0 },
          { month: currentCycleMonthKey(), penalty: 0, cumulative: 0 },
        ]
  const overallContributorStats = plans.map(({ member, plan }) => {
    const imported = getMemberRecords(member.id).reduce(
      (sum, record) => sum + record.liquid + record.mwekeza,
      0,
    )
    const live = transactions
      .filter((transaction) => transaction.memberId === member.id)
      .reduce((sum, transaction) => {
        const allocation = normalizeAllocation(transaction.allocation)

        return (
          sum +
          allocation.liquid +
          allocation.mwekeza +
          allocation.debtUtt +
          allocation.debtMwekeza +
          allocation.overpayment
        )
      }, 0)

    return {
      member,
      plan,
      total: imported + live,
    }
  })
  const rankedContributors = [...overallContributorStats].sort((a, b) => {
    const paidDifference = b.total - a.total
    if (paidDifference !== 0) return paidDifference
    return a.member.fullName.localeCompare(b.member.fullName)
  })
  const topContributor = rankedContributors[0]
  const lowestContributor = [...overallContributorStats].sort((a, b) => {
    const paidDifference = a.total - b.total
    if (paidDifference !== 0) return paidDifference
    return b.plan.remaining - a.plan.remaining
  })[0]

  return (
    <section className="dashboard-bento">
      <article className="bento-card bento-balance">
        <div>
          <span>Combined Fund</span>
          <strong>{formatTzs(fundTotals.combined)}</strong>
        </div>
        <small>{collectionRate}% collected this cycle</small>
        <div className="balance-spark">
          <i />
          <i />
          <i />
          <i />
        </div>
      </article>

      <article className="bento-card bento-mini bento-mini-blue">
        <CircleDollarSign size={18} />
        <div>
          <span>UTT Balance</span>
          <strong>{formatTzs(fundTotals.liquid)}</strong>
        </div>
      </article>

      <article className="bento-card bento-mini">
        <WalletCards size={18} />
        <div>
          <span>Mwekeza</span>
          <strong>{formatTzs(fundTotals.mwekeza)}</strong>
        </div>
      </article>

      <article className="bento-card personal-risk-card">
        <div className="personal-risk-head">
          <div>
            <span>{activeUser.fullName}</span>
            <strong>{formatTzs(personalPlan.remaining)}</strong>
          </div>
          <b className={personalPlan.remaining > 0 ? 'risk-hot' : 'risk-clear'}>
            {personalPlan.status}
          </b>
        </div>
        <div className="personal-risk-grid">
          <div>
            <span>Debt due {currentMonthLabel}</span>
            <strong>{formatTzs(personalPlan.installment)}</strong>
          </div>
          <div>
            <span>Penalty risk</span>
            <strong>{penaltyMessage}</strong>
          </div>
          <div>
            <span>Deadline</span>
            <strong>{deadlineLabelForDate(currentDateValue)}</strong>
          </div>
        </div>
        <div className="personal-risk-progress">
          <span>{personalProgress}% covered</span>
          <i>
            <b style={{ width: `${personalProgress}%` }} />
          </i>
        </div>
      </article>

      <article className="bento-card bento-penalty-trend">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Penalty collected</p>
            <h2>{formatTzs(totalPenaltyCollected)}</h2>
          </div>
          <CircleDollarSign size={20} />
        </div>
        <div className="penalty-trend-bars">
          {penaltyTrendBars.map((d, index) => {
            const maxPenalty = Math.max(...penaltyTrendBars.map((x) => x.penalty), 1)
            const height = d.penalty > 0 ? Math.round((d.penalty / maxPenalty) * 100) : 12

            return (
              <div
                className={d.penalty > 0 ? 'penalty-trend-col' : 'penalty-trend-col empty'}
                key={`${d.month}-${index}`}
              >
                <i style={{ height: `${Math.max(height, 8)}%` }} />
                <span>{d.month.slice(5)}</span>
              </div>
            )
          })}
        </div>
        <div className="penalty-trend-summary">
          <small>
            {penaltyTrendData.length > 0
              ? `${penaltyTrendData.length} month${penaltyTrendData.length === 1 ? '' : 's'} tracked`
              : 'No penalty cash collected yet'}
          </small>
          <strong>{formatTzs(totalPenaltyCollected)} total</strong>
        </div>
      </article>

      <article className="bento-card bento-trend">
        <div>
          <span>Contribution Trend</span>
          <div className="trend-bars">
            <i style={{ height: '22%' }} />
            <i style={{ height: '44%' }} />
            <i style={{ height: '68%' }} />
            <i style={{ height: '92%' }} />
            <i style={{ height: `${Math.max(collectionRate, 18)}%` }} />
            <i style={{ height: '48%' }} />
            <i style={{ height: '30%' }} />
          </div>
        </div>
        <div>
          <small>LIVE</small>
          <strong>{collectionRate >= 75 ? 'High' : collectionRate >= 45 ? 'Watch' : 'Low'}</strong>
        </div>
      </article>

      <article className="bento-card cycle-progress-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">{currentMonthLabel} progress</p>
            <h2>{collectionRate}% collected</h2>
          </div>
          <ReportRing percent={collectionRate} label={formatTzs(summary.totalPaid)} />
        </div>
        <div className="cycle-progress-track" aria-label={`${currentMonthLabel} member payment progress`}>
          {progressRows.map((row) => (
            <i
              className={`cycle-segment ${row.tone}`}
              key={row.label}
              style={{
                width: `${memberCount > 0 ? Math.max((row.value / memberCount) * 100, row.value > 0 ? 8 : 0) : 0}%`,
              }}
            />
          ))}
        </div>
        <div className="cycle-progress-rows">
          {progressRows.map((row) => (
            <div className={`cycle-progress-row ${row.tone}`} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
        <div className="cycle-progress-money">
          <span>Remaining</span>
          <strong>{formatTzs(summary.remaining)}</strong>
        </div>
      </article>

      <article className="bento-card bento-center">
        <ReportRing
          percent={memberCount > 0 ? Math.round((paidMembers / memberCount) * 100) : 0}
          label={`${paidMembers}/${memberCount}`}
        />
        <span>Paid Status</span>
      </article>

      <article className="bento-card bento-center">
        <div className="project-orb">
          <PieChart size={22} />
        </div>
        <strong>{projectCount}</strong>
        <span>Active Projects</span>
      </article>

      {topContributor && lowestContributor ? (
        <article className="bento-card contribution-standout-card">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Contribution pulse</p>
              <h2>Overall standouts</h2>
            </div>
            <Trophy size={20} />
          </div>
          <div className="contribution-standout-grid">
            <button
              className="contribution-standout-person praise"
              onClick={() => openMember(topContributor.member.id)}
              type="button"
            >
              <Avatar
                avatar={avatars[topContributor.member.id]}
                memberName={topContributor.member.fullName}
                size="small"
              />
              <div>
                <span>Top contributor</span>
                <strong>{topContributor.member.fullName}</strong>
                <small>{formatTzs(topContributor.total)} contributed overall</small>
              </div>
              <b>Keep leading us</b>
            </button>
            <button
              className="contribution-standout-person warning"
              onClick={() => openMember(lowestContributor.member.id)}
              type="button"
            >
              <Avatar
                avatar={avatars[lowestContributor.member.id]}
                memberName={lowestContributor.member.fullName}
                size="small"
              />
              <div>
                <span>Needs push</span>
                <strong>{lowestContributor.member.fullName}</strong>
                <small>{formatTzs(lowestContributor.total)} contributed overall</small>
              </div>
              <b>Letting us down</b>
            </button>
          </div>
        </article>
      ) : null}

      <article className="bento-card action-list-card debtors-bento-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Action list</p>
            <h2>Largest {currentMonthLabel} balances</h2>
          </div>
          <CircleDollarSign size={20} />
        </div>
        <div className="debtor-list">
          {topDebtors.map(({ member, plan }) => {
            const paidPercent = plan.due > 0 ? Math.min((plan.paid / plan.due) * 100, 100) : 0

            return (
            <button
              className="member-row debtor-bento-row"
              key={member.id}
              onClick={() => openMember(member.id)}
              type="button"
            >
              <Avatar
                avatar={avatars[member.id]}
                memberName={member.fullName}
                size="small"
              />
              <div>
                <strong>{member.fullName}</strong>
                <span>{plan.status}</span>
                <i className="debtor-progress">
                  <em style={{ width: `${paidPercent}%` }} />
                </i>
              </div>
              <b>{formatTzs(plan.remaining)}</b>
              <ChevronRight size={18} />
            </button>
          )})}
        </div>
      </article>

      <article className="bento-card insight-panel debt-insight-card debt-book-bento-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Debt book</p>
            <h2>{formatTzs(debtTotal)}</h2>
          </div>
          <PieChart size={20} />
        </div>
        <div className="debt-book-visual">
          <ReportRing percent={25} label="4 months" />
          <div>
            <span>Recovery plan</span>
            <strong>July - October</strong>
          </div>
        </div>
        <p>
          Opening debt is split across July, August, September, and October,
          then added on top of the normal monthly contribution.
        </p>
        <div className="installment-strip">
          {settings.debtInstallmentMonths.map((month) => (
            <span key={month}>{month.slice(5)}</span>
          ))}
        </div>
      </article>

      {canRecord ? (
        <button
          className="bento-card insight-panel debt-insight-card penalty-bento-card"
          onClick={onOpenPenalty}
          type="button"
        >
          <div className="panel-title">
            <div>
              <p className="eyebrow">Penalty</p>
              <h2>{formatTzs(summary.penaltyAtRisk)}</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p>
            {summary.membersAtRisk} member{summary.membersAtRisk === 1 ? '' : 's'} at risk
            this cycle. Tap to see every member and filter by month.
          </p>
          <span className="penalty-bento-cta">
            View all members <ChevronRight size={16} />
          </span>
        </button>
      ) : null}
    </section>
  )
}

function PenaltyView({
  avatars,
  members,
  onBack,
  onOpenMember,
  transactions,
}: {
  avatars: AvatarMap
  members: Member[]
  onBack: () => void
  onOpenMember: (memberId: string) => void
  transactions: TransactionRecord[]
}) {
  const months = penaltyReviewMonths()
  const currentMonth = currentCycleMonthKey()
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const rows = penaltyPlansForMonth(members, transactions, selectedMonth)
    .slice()
    .sort((a, b) => b.plan.penaltyRemaining - a.plan.penaltyRemaining)
  const totalPenalty = rows.reduce((sum, { plan }) => sum + plan.penaltyRemaining, 0)
  const atRiskCount = rows.filter(({ plan }) => plan.penaltyRemaining > 0).length
  const selectedMonthLabel = shortMonthLabelForDate(`${selectedMonth}-01`)
  const isFutureMonth = selectedMonth > currentMonth
  const isPastMonth = selectedMonth < currentMonth

  return (
    <section className="penalty-review-layout">
      <button className="ghost-button back-button" onClick={onBack} type="button">
        <ArrowLeft size={18} />
        Dashboard
      </button>

      <article className="panel penalty-review-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Penalty stats</p>
            <h2>{selectedMonthLabel}</h2>
          </div>
          <ShieldCheck size={20} />
        </div>

        <div className="month-filter-row">
          {months.map((month) => (
            <button
              className={month === selectedMonth ? 'active' : ''}
              key={month}
              onClick={() => setSelectedMonth(month)}
              type="button"
            >
              {shortMonthLabelForDate(`${month}-01`)}
            </button>
          ))}
        </div>

        {isFutureMonth ? (
          <p className="penalty-review-note">
            Projected: assumes no further payments happen between now and{' '}
            {selectedMonthLabel}.
          </p>
        ) : isPastMonth ? (
          <p className="penalty-review-note">
            Historical: reconstructed from transactions actually recorded by{' '}
            {selectedMonthLabel}.
          </p>
        ) : null}

        <div className="penalty-review-summary">
          <Metric label="Total penalty" value={formatTzs(totalPenalty)} />
          <Metric label="Members at risk" value={`${atRiskCount} / ${rows.length}`} />
        </div>

        <div className="penalty-review-list">
          {rows.map(({ member, plan }) => (
            <button
              className="member-row penalty-review-row"
              key={member.id}
              onClick={() => onOpenMember(member.id)}
              type="button"
            >
              <Avatar avatar={avatars[member.id]} memberName={member.fullName} size="small" />
              <div>
                <strong>{member.fullName}</strong>
                <span>{plan.status}</span>
              </div>
              <b className={plan.penaltyRemaining > 0 ? 'risk-hot' : 'risk-clear'}>
                {formatTzs(plan.penaltyRemaining)}
              </b>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </article>
    </section>
  )
}

function MembersView({
  activeUser,
  avatars,
  detailOpen,
  draft,
  isAdmin,
  onAvatar,
  onBack,
  onDelete,
  onDraft,
  onMakeCashier,
  onMakeChairman,
  onMakeSecretary,
  onMemberAdd,
  onSelect,
  plans,
  selectedMember,
  selectedPlan,
  transactions,
}: {
  activeUser: Member
  avatars: AvatarMap
  detailOpen: boolean
  draft: MemberDraft
  isAdmin: boolean
  onAvatar: (memberId: string, event: ChangeEvent<HTMLInputElement>) => void
  onBack: () => void
  onDelete: (memberId: string) => void
  onDraft: React.Dispatch<React.SetStateAction<MemberDraft>>
  onMakeCashier: (memberId: string) => void
  onMakeChairman: (memberId: string) => void
  onMakeSecretary: (memberId: string) => void
  onMemberAdd: (event: React.FormEvent) => void
  onSelect: (memberId: string) => void
  plans: ReturnType<typeof allJulyPlans>
  selectedMember: Member
  selectedPlan: ReturnType<typeof julyPlanForMember>
  transactions: TransactionRecord[]
}) {
  const currentDateValue = todayInputValue()
  const currentMonthLabel = monthLabelForDate(currentDateValue)
  const selectedTransactions = transactions.filter(
    (transaction) => transaction.memberId === selectedMember.id,
  )
  const [expandedTx, setExpandedTx] = useState<string | null>(null)
  const importedTotals = getMemberRecords(selectedMember.id).reduce(
    (totals, record) => ({
      utt: totals.utt + record.liquid,
      mwekeza: totals.mwekeza + record.mwekeza,
    }),
    { utt: 0, mwekeza: 0 },
  )
  const manualTotals = selectedTransactions.reduce(
    (totals, transaction) => {
      const allocation = normalizeAllocation(transaction.allocation)

      return {
        utt: totals.utt + allocation.liquid + allocation.debtUtt + allocation.overpayment,
        mwekeza: totals.mwekeza + allocation.mwekeza + allocation.debtMwekeza,
      }
    },
    { utt: 0, mwekeza: 0 },
  )
  const allTimeUttTotal = importedTotals.utt + manualTotals.utt
  const allTimeMwekezaTotal = importedTotals.mwekeza + manualTotals.mwekeza
  const allTimeContributionTotal = allTimeUttTotal + allTimeMwekezaTotal
  const memberMonthCount = contributionMonthCountForMember(selectedMember.id)
  const expectedUttTotal = memberMonthCount * settings.liquidContribution
  const expectedMwekezaTotal = memberMonthCount * settings.mwekezaContribution
  const expectedContributionTotal = expectedUttTotal + expectedMwekezaTotal
  const heroOutstandingBalance =
    selectedPlan.normalContribution + selectedPlan.installment + selectedPlan.penaltyRemaining
  const roleCount = new Set(plans.map(({ member }) => member.role)).size

  if (detailOpen) {
    return (
      <section className="member-stats-dashboard">
        <header className="stats-header">
          <button className="ghost-button back-button-light" onClick={onBack} type="button">
            <ArrowLeft size={18} />
            Back
          </button>
          
          <div className="stats-profile-actions">
            {isAdmin && selectedMember.role !== 'Chairman' ? (
                <>
                  <button className="ghost-button" onClick={() => onMakeChairman(selectedMember.id)}>Make Chair</button>
                  <button className="ghost-button" onClick={() => onMakeCashier(selectedMember.id)}>Cashier</button>
                  <button className="ghost-button" onClick={() => onMakeSecretary(selectedMember.id)}>Secretary</button>
                </>
              ) : null}
              {isAdmin && selectedMember.id !== activeUser.id ? (
                <button className="danger-button" onClick={() => onDelete(selectedMember.id)}>Delete</button>
              ) : null}
              {selectedMember.id === activeUser.id ? (
                <label className="stats-avatar-upload" title="Change photo">
                  <Avatar avatar={avatars[selectedMember.id]} memberName={selectedMember.fullName} size="small" />
                  <div className="stats-avatar-overlay">
                    <Camera size={14} />
                  </div>
                  <input style={{ display: 'none' }} accept="image/*" onChange={(event) => onAvatar(selectedMember.id, event)} type="file" />
                </label>
              ) : (
                <Avatar avatar={avatars[selectedMember.id]} memberName={selectedMember.fullName} size="small" />
              )}
          </div>
        </header>

        <div className="stats-hero">
          <div className="stats-hero-text">
            <p className="eyebrow-light">Track your balance, recent activity, and financial goals</p>
            <h1>{selectedMember.fullName}</h1>
          </div>
          
          <div className="stats-hero-card">
            <div className="stats-hero-card-header">
               <span><CircleDollarSign size={14} style={{ marginRight: 6 }}/> OUTSTANDING BALANCE</span>
               <small>{currentMonthLabel}</small>
            </div>
            <strong>{formatTzs(heroOutstandingBalance)}</strong>
            <div className="stats-hero-card-footer">
              {selectedPlan.penaltyRemaining > 0 ? (
                <span className="penalty-badge-inline">↗ Incl. {formatTzs(selectedPlan.penaltyRemaining)} penalty</span>
              ) : (
                <span className="success-badge-inline">↗ No active penalty</span>
              )}
            </div>
          </div>
        </div>

        <div className="stats-bento-grid">
          <article className="bento-card bento-overview">
            <div className="bento-card-header">
              <h3>Overview</h3>
              <div className="chart-controls">Year <ChevronRight size={14}/></div>
            </div>
            <strong>{formatTzs(allTimeContributionTotal)}</strong>
            <small>Total Paid All-Time</small>
            <div className="overview-chart-placeholder">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="chart-bar-container">
                  <div className="chart-bar" style={{ height: `${Math.max(15, Math.random() * 85)}%` }} />
                  <span className="chart-label">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</span>
                </div>
              ))}
            </div>
          </article>
          
          <article className="bento-card bento-tile">
            <div className="bento-card-header">
              <h3>Contributions Base</h3>
              <PieChart size={18} />
            </div>
            <strong>{formatTzs(expectedContributionTotal)}</strong>
            <small>Expected Target Up to Now</small>
            <div className="bento-mini-metric">
               <span className={allTimeContributionTotal >= expectedContributionTotal ? 'trend-up' : 'trend-down'}>
                 {allTimeContributionTotal >= expectedContributionTotal ? '↗' : '↘'} {formatTzs(Math.abs(allTimeContributionTotal - expectedContributionTotal))} {allTimeContributionTotal >= expectedContributionTotal ? 'surplus' : 'deficit'}
               </span>
            </div>
          </article>

          <article className="bento-card bento-tile">
            <div className="bento-card-header">
              <h3>Monthly Installment</h3>
              <CalendarDays size={18} />
            </div>
            <strong>{formatTzs(settings.liquidContribution + settings.mwekezaContribution)}</strong>
            <small>Due Every Cycle</small>
            <div className="bento-mini-metric">
              <span>UTT {formatTzs(settings.liquidContribution)} / MW {formatTzs(settings.mwekezaContribution)}</span>
            </div>
          </article>

          <article className="bento-card bento-tile dark-tile">
            <div className="bento-card-header">
              <h3>Debt Initial Breakdown</h3>
              <CircleDollarSign size={18} />
            </div>
            <strong>{formatTzs(selectedPlan.remainingStartingDebt)}</strong>
            <small>Total Principal Unpaid</small>
            <div className="bento-mini-metric split">
              <span>UTT: {formatTzs(selectedPlan.remainingStartingDebtUtt)}</span>
              <span>MW: {formatTzs(selectedPlan.remainingStartingDebtMwekeza)}</span>
            </div>
          </article>

          <article className="bento-card bento-tile">
            <div className="bento-card-header">
              <h3>Current Unpaid Total</h3>
              <CircleDollarSign size={18} />
            </div>
            <strong>{formatTzs(selectedPlan.due)}</strong>
            <small>Due {currentMonthLabel}</small>
            <div className="bento-mini-metric split">
              <span>Debt UTT: {formatTzs(selectedPlan.debtUttRemaining)}</span>
              <span>Debt MW: {formatTzs(selectedPlan.debtMwekezaRemaining)}</span>
            </div>
          </article>

          <article className={`bento-card bento-tile ${selectedPlan.penaltyRemaining > 0 ? 'dark-tile' : ''}`}>
            <div className="bento-card-header">
              <h3>Penalty</h3>
              <ShieldCheck size={18} />
            </div>
            <strong>{formatTzs(selectedPlan.penaltyRemaining)}</strong>
            <small>{selectedPlan.penaltyRemaining > 0 ? 'At risk this cycle' : 'No penalty'}</small>
            {selectedPlan.penaltyRemaining > 0 ? (
              <div className="bento-mini-metric danger">
                <span>10% of {formatTzs(selectedPlan.debtPenaltyBase)} overdue</span>
              </div>
            ) : null}
          </article>
        </div>

        <article className="panel stats-transactions-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>Recent Transactions</h2>
            </div>
            <ReceiptText size={20} />
          </div>
          <div className="stats-tx-list">
            {selectedTransactions.slice(0, 3).map((transaction) => {
              const isOpen = expandedTx === transaction.id
              const alloc = normalizeAllocation(transaction.allocation)

              return (
                <div className={`stats-tx-row ${isOpen ? 'tx-expanded' : ''}`} key={transaction.id}>
                  <button
                    className="stats-tx-row-header"
                    onClick={() => setExpandedTx(isOpen ? null : transaction.id)}
                    type="button"
                  >
                    <div className="tx-icon">
                      <ReceiptText size={18} />
                    </div>
                    <div className="tx-details">
                      <span>{transaction.method} Payment</span>
                      <small>{transaction.date}</small>
                    </div>
                    <strong className="tx-amount plus">+{formatTzs(transaction.amount)}</strong>
                    <ChevronDown size={16} className={`tx-chevron ${isOpen ? 'open' : ''}`} />
                  </button>
                  {isOpen ? (
                    <div className="tx-expand-body">
                      {transaction.note ? (
                        <div className="tx-expand-row">
                          <span className="tx-expand-label">Note</span>
                          <span className="tx-expand-value">{transaction.note}</span>
                        </div>
                      ) : null}
                      <div className="tx-expand-row">
                        <span className="tx-expand-label">Recorded by</span>
                        <span className="tx-expand-value">{transaction.recordedBy}</span>
                      </div>
                      <div className="tx-expand-divider" />
                      <span className="tx-expand-section-title">Allocation Breakdown</span>
                      <div className="tx-expand-grid">
                        {alloc.liquid > 0 ? (
                          <div className="tx-expand-pill">
                            <span>UTT</span> <b>{formatTzs(alloc.liquid)}</b>
                          </div>
                        ) : null}
                        {alloc.mwekeza > 0 ? (
                          <div className="tx-expand-pill">
                            <span>MW</span> <b>{formatTzs(alloc.mwekeza)}</b>
                          </div>
                        ) : null}
                        {alloc.debtUtt > 0 ? (
                          <div className="tx-expand-pill">
                            <span>Debt UTT</span> <b>{formatTzs(alloc.debtUtt)}</b>
                          </div>
                        ) : null}
                        {alloc.debtMwekeza > 0 ? (
                          <div className="tx-expand-pill">
                            <span>Debt MW</span> <b>{formatTzs(alloc.debtMwekeza)}</b>
                          </div>
                        ) : null}
                        {alloc.penalty > 0 ? (
                          <div className="tx-expand-pill">
                            <span>Penalty</span> <b>{formatTzs(alloc.penalty)}</b>
                          </div>
                        ) : null}
                        {alloc.overpayment > 0 ? (
                          <div className="tx-expand-pill">
                            <span>Overpay</span> <b>{formatTzs(alloc.overpayment)}</b>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {selectedTransactions.length === 0 ? <p className="empty">No recent transactions</p> : null}
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="members-directory">
      <article className="panel member-list-panel directory-panel">
        <div className="members-roster-summary">
          <div className="members-network-card">
            <div>
              <span>Auralis Network</span>
              <strong>Total Members: {plans.length}</strong>
            </div>
            <div className="roster-avatar-stack">
              {plans.slice(0, 3).map(({ member }) => (
                <Avatar
                  avatar={avatars[member.id]}
                  key={member.id}
                  memberName={member.fullName}
                  size="small"
                />
              ))}
              {plans.length > 3 ? <b>+{plans.length - 3}</b> : null}
            </div>
            <UsersRound size={62} />
          </div>
          <div className="members-roles-card">
            <span>Roles</span>
            <strong>{roleCount}</strong>
          </div>
        </div>

        <div className="roster-list">
          {(() => {
            const allTimePaidByMember = plans.map(({ member }) => {
              const imported = getMemberRecords(member.id).reduce(
                (sum, r) => sum + r.liquid + r.mwekeza,
                0,
              )
              const manual = transactions
                .filter((t) => t.memberId === member.id)
                .reduce((sum, t) => {
                  const a = normalizeAllocation(t.allocation)

                  return sum + a.liquid + a.mwekeza + a.debtUtt + a.debtMwekeza + a.overpayment
                }, 0)

              return { memberId: member.id, total: imported + manual }
            })
            const grandTotal = allTimePaidByMember.reduce((sum, m) => sum + m.total, 0)
            const percentMap = new Map(
              allTimePaidByMember.map((m) => [
                m.memberId,
                grandTotal > 0 ? Math.round((m.total / grandTotal) * 100) : 0,
              ]),
            )

            return [...plans].sort((a, b) => {
              const aPct = percentMap.get(a.member.id) ?? 0
              const bPct = percentMap.get(b.member.id) ?? 0

              return bPct - aPct || a.member.fullName.localeCompare(b.member.fullName)
            }).map(({ member, plan }) => {
              const paidPercent = plan.due > 0 ? Math.min((plan.paid / plan.due) * 100, 100) : 0
              const isSelf = member.id === activeUser.id
              const clear = plan.remaining === 0
              const contributionPercent = percentMap.get(member.id) ?? 0
              const highPenalty = plan.penaltyRemaining >= 50000
              const hasPenalty = plan.penaltyRemaining > 0

            return (
            <button
              className={[
                'roster-member-card',
                isSelf ? 'featured' : '',
                highPenalty ? 'high-penalty' : '',
              ].filter(Boolean).join(' ')}
              key={member.id}
              onClick={() => onSelect(member.id)}
              type="button"
            >
              <div className="roster-member-main">
                <div className="roster-avatar-wrap">
                  <Avatar avatar={avatars[member.id]} memberName={member.fullName} />
                  {isSelf ? <b>YOU</b> : null}
                </div>
                <div className="roster-member-copy">
                  <div>
                    <strong>{member.fullName}</strong>
                    <span className="roster-contribution-badge">{contributionPercent}%</span>
                    <span className={`roster-role ${member.role.toLowerCase()}`}>
                      {member.role}
                    </span>
                  </div>
                  <small>@{member.username}</small>
                </div>
              </div>
              <div className="roster-balance">
                {clear ? (
                  <span className="clear-status">Clear</span>
                ) : (
                  <>
                    <span className="balance-label">Outstanding</span>
                    <strong>{formatTzs(plan.remaining)}</strong>
                    {hasPenalty ? (
                      <span className={highPenalty ? 'penalty-chip hot' : 'penalty-chip'}>
                        {highPenalty ? <ShieldAlert size={12} /> : null}
                        {highPenalty ? 'High penalty' : 'Penalty'} {formatTzs(plan.penaltyRemaining)}
                      </span>
                    ) : (
                      <small>No penalty</small>
                    )}
                  </>
                )}
              </div>
              <div className="roster-progress">
                <i style={{ width: `${paidPercent}%` }} />
              </div>
            </button>
          )
          })
          })()}
        </div>

        {isAdmin ? (
          <form className="add-member-form top-add-member-form add-member-bottom" onSubmit={onMemberAdd}>
            <div className="panel-title">
              <div>
                <p className="eyebrow">Admin tools</p>
                <h2>Add member</h2>
              </div>
              <Plus size={20} />
            </div>
            <label>
              Full name
              <input
                value={draft.fullName}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder="Member full name"
              />
            </label>
            <label>
              Username
              <input
                value={draft.username}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="username"
              />
            </label>
            <label>
              Password
              <input
                value={draft.password}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={18} />
              Add member
            </button>
          </form>
        ) : null}
      </article>
    </section>
  )
}

function PaymentsView({
  canRecord,
  draft,
  members,
  onDraft,
  onDeleteTransaction,
  onRecord,
  plans,
  transactions,
}: {
  canRecord: boolean
  draft: PaymentDraft
  members: Member[]
  onDraft: React.Dispatch<React.SetStateAction<PaymentDraft>>
  onDeleteTransaction: (transactionId: string) => void
  onRecord: (event: React.FormEvent) => void
  plans: ReturnType<typeof allJulyPlans>
  transactions: TransactionRecord[]
}) {
  const active = plans.find((item) => item.member.id === draft.memberId) ?? plans[0]
  const selectedMonthLabel = monthLabelForDate(draft.date)
  const draftAmount = parseMoney(draft.amount)
  // Live preview: exactly how this single amount would be split if recorded
  // right now, in the fixed order penalty -> debt UTT -> debt Mwekeza ->
  // Mwekeza -> UTT.
  const allocationPreview = allocatePaymentAmount(active.member.id, draftAmount, transactions)
  const memberTransactions = transactions.filter(
    (transaction) => transaction.memberId === active.member.id,
  )
  const principalCovered =
    allocationPreview.debtUtt +
    allocationPreview.debtMwekeza +
    allocationPreview.mwekeza +
    allocationPreview.liquid
  const remainingAfterDraft = Math.max(active.plan.remaining - principalCovered, 0)
  const penaltyAfterDraft = Math.max(active.plan.penaltyRemaining - allocationPreview.penalty, 0)
  const paymentDateIsLate = isPastDeadline(draft.date)
  const setFullDue = () => {
    onDraft((current) => ({
      ...current,
      amount: Math.round(active.plan.carryover).toString(),
    }))
  }

  return (
    <section className="payment-command-layout">
      <form
        className={canRecord ? 'payment-command-form' : 'payment-command-form read-only'}
        onSubmit={canRecord ? onRecord : (event) => event.preventDefault()}
      >
        <label className="payment-member-card">
          <div>
            <Avatar memberName={active.member.fullName} size="small" />
            <div>
              <strong>{active.member.fullName}</strong>
              <span>Outstanding: {formatTzs(active.plan.remaining)}</span>
            </div>
          </div>
          <select
            aria-label="Member"
            value={draft.memberId}
            onChange={(event) =>
              onDraft((current) => ({ ...current, memberId: event.target.value }))
            }
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
        </label>

        <article className="payment-breakdown-card">
          {active.plan.penaltyRemaining > 0 ? (
            <div className="payment-breakdown-row penalty-row">
              <span>Penalty owed</span>
              <strong>{formatTzs(active.plan.penaltyRemaining)}</strong>
            </div>
          ) : null}
          <div className="payment-breakdown-row">
            <span>UTT debt remaining</span>
            <strong>{formatTzs(active.plan.debtUttRemaining)}</strong>
          </div>
          <div className="payment-breakdown-row">
            <span>Mwekeza debt remaining</span>
            <strong>{formatTzs(active.plan.debtMwekezaRemaining)}</strong>
          </div>
          <div className="payment-breakdown-row">
            <span>Mwekeza due {selectedMonthLabel}</span>
            <strong>{formatTzs(settings.mwekezaContribution)}</strong>
          </div>
          <div className="payment-breakdown-row">
            <span>UTT due {selectedMonthLabel}</span>
            <strong>{formatTzs(settings.liquidContribution)}</strong>
          </div>
          <div className="payment-breakdown-total">
            <span>Total to fully clear</span>
            <strong>{formatTzs(active.plan.carryover)}</strong>
          </div>
        </article>

        <div className="amount-chip-row">
          <button disabled={!canRecord} onClick={setFullDue} type="button">
            Pay in full
          </button>
        </div>

        <label className="amount-entry-card">
          <span>Amount received</span>
          <div>
            <small>TZS</small>
            <input
              inputMode="numeric"
              readOnly={!canRecord}
              value={draft.amount}
              onChange={(event) =>
                onDraft((current) => ({ ...current, amount: event.target.value }))
              }
            />
          </div>
        </label>

        <label className="payment-date-card">
          <div>
            <CalendarDays size={18} />
            <span>{formatDateLabel(draft.date)}</span>
            <small className={paymentDateIsLate ? 'date-late' : ''}>
              {paymentDateIsLate
                ? `Penalty active after ${deadlineLabelForDate(draft.date)}`
                : `Deadline ${deadlineLabelForDate(draft.date)}`}
            </small>
          </div>
          <input
            type="date"
            disabled={!canRecord}
            value={draft.date}
            onChange={(event) =>
              onDraft((current) => ({ ...current, date: event.target.value }))
            }
          />
        </label>

        <div className="payment-method-tabs">
          {(['Cash', 'Bank Transfer', 'Mobile Money'] as PaymentMethod[]).map((method) => (
            <button
              className={draft.method === method ? 'active' : ''}
              disabled={!canRecord}
              key={method}
              onClick={() => onDraft((current) => ({ ...current, method }))}
              type="button"
            >
              {method === 'Bank Transfer' ? 'Bank' : method}
            </button>
          ))}
        </div>

        <label className="payment-note-card">
          <span>Note</span>
          <input
            readOnly={!canRecord}
            value={draft.note}
            onChange={(event) =>
              onDraft((current) => ({ ...current, note: event.target.value }))
            }
          />
        </label>

        <div className={remainingAfterDraft === 0 ? 'payment-live-preview clear' : 'payment-live-preview'}>
          <ShieldCheck size={18} />
          <span>
            Remaining after this payment: {formatTzs(remainingAfterDraft)}
            {penaltyAfterDraft > 0 ? ` / penalty still owed ${formatTzs(penaltyAfterDraft)}` : ''}
          </span>
        </div>

        <div className="payment-allocation-strip">
          <Metric label="Penalty" value={formatTzs(allocationPreview.penalty)} />
          <Metric label="Debt UTT" value={formatTzs(allocationPreview.debtUtt)} />
          <Metric label="Debt Mwekeza" value={formatTzs(allocationPreview.debtMwekeza)} />
          <Metric label="Mwekeza" value={formatTzs(allocationPreview.mwekeza)} />
          <Metric label="UTT" value={formatTzs(allocationPreview.liquid)} />
          {allocationPreview.overpayment > 0 ? (
            <Metric label="Overpayment" value={formatTzs(allocationPreview.overpayment)} />
          ) : null}
        </div>

        {canRecord ? (
          <button className="payment-submit-button" type="submit">
            Record payment
          </button>
        ) : (
          <div className="read-only-payment-note">
            <ShieldCheck size={18} />
            <span>Payment recording is chairman and cashier only.</span>
          </div>
        )}
      </form>

      <article className="panel ledger-panel payment-ledger-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Saved locally</p>
            <h2>{selectedMonthLabel} payment ledger</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        {transactions.length === 0 ? (
          <p>No {selectedMonthLabel} payments recorded yet.</p>
        ) : (
          <div className="transaction-list">
            {transactions.map((transaction) => {
              const member = members.find((item) => item.id === transaction.memberId)

              return (
                <div className="transaction-row" key={transaction.id}>
                  <div>
                    <strong>{member?.fullName ?? 'Unknown member'}</strong>
                    <span>
                      {transaction.date} / {transaction.method}
                    </span>
                  </div>
                  <div>
                    <b>{formatTzs(transaction.amount)}</b>
                    <small>
                      {normalizeAllocation(transaction.allocation).penalty > 0
                        ? `Penalty ${formatTzs(normalizeAllocation(transaction.allocation).penalty)} / `
                        : ''}
                      Debt UTT {formatTzs(normalizeAllocation(transaction.allocation).debtUtt)} / Debt MW{' '}
                      {formatTzs(normalizeAllocation(transaction.allocation).debtMwekeza)} / MW{' '}
                      {formatTzs(transaction.allocation.mwekeza)} / UTT{' '}
                      {formatTzs(transaction.allocation.liquid)}
                    </small>
                  </div>
                  {canRecord ? (
                    <button
                      className="ghost-button delete-transaction-btn"
                      onClick={() => onDeleteTransaction(transaction.id)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
        {memberTransactions.length > 0 ? (
          <div className="mini-report">
            <span>{active.member.fullName} local entries</span>
            <strong>
              {formatTzs(
                memberTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
              )}
            </strong>
          </div>
        ) : null}
      </article>
    </section>
  )
}

function FundsView({
  activeUser,
  adjustments,
  canAdjustBalance,
  draft,
  fundTotals,
  members,
  onAdjust,
  onDraft,
  transactions,
}: {
  activeUser: Member
  adjustments: BalanceAdjustment[]
  canAdjustBalance: boolean
  draft: BalanceAdjustmentDraft
  fundTotals: ReturnType<typeof applyBalanceAdjustments>
  members: Member[]
  onAdjust: (event: React.FormEvent) => void
  onDraft: React.Dispatch<React.SetStateAction<BalanceAdjustmentDraft>>
  transactions: TransactionRecord[]
}) {
  const currentMonthLabel = monthLabelForDate(todayInputValue())
  const added = transactionTotals(transactions)
  const recentAdjustments = adjustments.slice(0, 6)

  return (
    <section className="funds-layout">
      <article className="hero-balance secondary">
        <div className="hero-topline">
          <span>Adjusted cash position</span>
          <Landmark size={22} />
        </div>
        <strong>{formatTzs(fundTotals.combined)}</strong>
        <div className="fund-split">
          <span>Calculated {formatTzs(fundTotals.calculated.combined)}</span>
          <span>Adjustments {formatTzs(fundTotals.adjustmentTotal)}</span>
        </div>
      </article>
      <div className="metric-row two">
        <Metric label="UTT Liquid Fund" value={formatTzs(fundTotals.liquid)} />
        <Metric label="Mwekeza Fund" value={formatTzs(fundTotals.mwekeza)} />
      </div>
      <div className="metric-row">
        <Metric label={`${currentMonthLabel} cash added`} value={formatTzs(fundTotals.julyCashAdded)} />
        <Metric label="Debt recovered" value={formatTzs(fundTotals.debtRecovered)} />
        <Metric label="Manual UTT" value={formatTzs(added.liquid)} />
        <Metric label="Manual Mwekeza" value={formatTzs(added.mwekeza)} />
      </div>
      {canAdjustBalance ? (
        <article className="panel balance-adjustment-card">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Cashier only</p>
              <h2>Balance adjustment</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p>
            This creates a separate reconciliation entry. It does not edit member
            payments, debts, penalties, or imported records.
          </p>
          <form className="balance-adjustment-form" onSubmit={onAdjust}>
            <label>
              Fund
              <select
                value={draft.fund}
                onChange={(event) =>
                  onDraft((current) => ({
                    ...current,
                    fund: event.target.value as FundKey,
                  }))
                }
              >
                <option value="liquid">UTT Liquid</option>
                <option value="mwekeza">Mwekeza</option>
              </select>
            </label>
            <label>
              Direction
              <select
                value={draft.direction}
                onChange={(event) =>
                  onDraft((current) => ({
                    ...current,
                    direction: event.target.value as BalanceAdjustmentDraft['direction'],
                  }))
                }
              >
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
              </select>
            </label>
            <label>
              Amount
              <input
                inputMode="numeric"
                placeholder="Amount"
                value={draft.amount}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, amount: event.target.value }))
                }
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={draft.date}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, date: event.target.value }))
                }
              />
            </label>
            <label className="balance-reason-field">
              Reason
              <input
                placeholder="Bank reconciliation, cash correction..."
                value={draft.reason}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, reason: event.target.value }))
                }
              />
            </label>
            <button className="primary-button" type="submit">
              <ReceiptText size={18} />
              Save adjustment
            </button>
          </form>
        </article>
      ) : null}
      <article className="panel balance-adjustment-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h2>Balance adjustments</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        {recentAdjustments.length === 0 ? (
          <p>No balance adjustments recorded yet.</p>
        ) : (
          <div className="balance-adjustment-list">
            {recentAdjustments.map((adjustment) => {
              const cashier = members.find((member) => member.id === adjustment.adjustedBy)

              return (
                <div className="balance-adjustment-row" key={adjustment.id}>
                  <div>
                    <strong>
                      {adjustment.fund === 'liquid' ? 'UTT Liquid' : 'Mwekeza'}
                    </strong>
                    <span>
                      {adjustment.date} / {cashier?.fullName ?? activeUser.fullName}
                    </span>
                    <small>{adjustment.reason}</small>
                  </div>
                  <b className={adjustment.amount >= 0 ? 'positive' : 'negative'}>
                    {adjustment.amount >= 0 ? '+' : ''}
                    {formatTzs(adjustment.amount)}
                  </b>
                </div>
              )
            })}
          </div>
        )}
      </article>
      <article className="panel ledger-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Ledger foundation</p>
            <h2>Cash and debt are separate</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>
          Fund balance is collected cash. Member outstanding balance is what
          each member owes. Project funding should only come from collected
          cash, never from unpaid balances.
        </p>
        <button
          className="ghost-button report-button"
          onClick={() => exportJulyCsv(transactions, members)}
          type="button"
        >
          <ReceiptText size={18} />
          Export {currentMonthLabel} CSV
        </button>
      </article>
    </section>
  )
}

function ProjectsView({
  activeUser,
  canManage,
  draft,
  entryDrafts,
  fundTotals,
  members,
  onCreate,
  onDraft,
  onEntryDraft,
  onEntrySave,
  onMemberRole,
  onStatus,
  projects,
}: {
  activeUser: Member
  canManage: boolean
  draft: ProjectDraft
  entryDrafts: Record<string, ProjectEntryDraft>
  fundTotals: ReturnType<typeof liveFundTotals>
  members: Member[]
  onCreate: (event: React.FormEvent) => void
  onDraft: React.Dispatch<React.SetStateAction<ProjectDraft>>
  onEntryDraft: (projectId: string, patch: Partial<ProjectEntryDraft>) => void
  onEntrySave: (projectId: string, event: React.FormEvent) => void
  onMemberRole: (memberId: string, role: ProjectRole | '') => void
  onStatus: (projectId: string, status: ProjectStatus) => void
  projects: ProjectRecord[]
}) {
  const totalInvestment = projects.reduce(
    (sum, project) => sum + project.investmentAmount,
    0,
  )
  const totalIncome = projects.reduce(
    (sum, project) =>
      sum +
      project.entries
        .filter((entry) => entry.type === 'Income')
        .reduce((entrySum, entry) => entrySum + entry.amount, 0),
    0,
  )
  const totalExpenses = projects.reduce(
    (sum, project) =>
      sum +
      project.entries
        .filter((entry) => entry.type === 'Expense')
        .reduce((entrySum, entry) => entrySum + entry.amount, 0),
    0,
  )
  const activeCount = projects.filter((project) => project.status === 'Active').length
  const completedCount = projects.filter(
    (project) => project.status === 'Completed',
  ).length
  const draftInvestment = Number(draft.investmentAmount) || 0
  const canCreateProject =
    canManage &&
    draft.name.trim().length > 0 &&
    draftInvestment > 0 &&
    draftInvestment <= fundTotals.combined
  const projectWallet = totalInvestment + totalIncome - totalExpenses
  const projectProfit = totalIncome - totalExpenses
  const assignedCount = projects.reduce(
    (sum, project) => sum + project.members.length,
    0,
  )
  const activePercent =
    projects.length > 0 ? Math.round((activeCount / projects.length) * 100) : 0

  return (
    <section className="projects-layout">
      <div className="project-command-board">
        <article className="bento-card bento-balance project-command-balance">
          <div>
            <span>Project Wallet</span>
            <strong>{formatTzs(projectWallet)}</strong>
          </div>
          <small>Investment {formatTzs(totalInvestment)}</small>
          <div className="balance-spark">
            <i />
            <i />
            <i />
            <i />
          </div>
        </article>

        <article className="bento-card bento-mini bento-mini-blue">
          <CircleDollarSign size={18} />
          <div>
            <span>Profit</span>
            <strong>{formatTzs(projectProfit)}</strong>
          </div>
        </article>

        <article className="bento-card bento-mini">
          <WalletCards size={18} />
          <div>
            <span>Available Cash</span>
            <strong>{formatTzs(fundTotals.combined)}</strong>
          </div>
        </article>

      <article className="bento-card bento-trend">
          <div>
            <span>Project Activity</span>
            <div className="trend-bars">
              <i style={{ height: `${Math.max(activePercent, 16)}%` }} />
              <i style={{ height: '42%' }} />
              <i style={{ height: `${Math.max(completedCount * 18, 22)}%` }} />
              <i style={{ height: `${Math.max(projects.length * 14, 28)}%` }} />
              <i style={{ height: `${Math.max(assignedCount * 7, 34)}%` }} />
              <i style={{ height: '56%' }} />
              <i style={{ height: '30%' }} />
            </div>
          </div>
          <div>
            <small>{activeCount} active</small>
            <strong>{activePercent}%</strong>
          </div>
        </article>

        <article className="bento-card bento-center">
          <ReportRing percent={activePercent} label={`${activeCount}/${projects.length}`} />
          <span>Active Status</span>
        </article>

        <article className="bento-card bento-center">
          <div className="project-orb">
            <UsersRound size={22} />
          </div>
          <strong>{assignedCount}</strong>
          <span>Assigned Roles</span>
        </article>

        <article className="bento-card bento-distribution">
          <div>
            <span>Project Distribution</span>
            <div className="distribution-list">
              <b><i /> Active ({activeCount})</b>
              <b><i /> Completed ({completedCount})</b>
              <b><i /> Planning ({Math.max(projects.length - activeCount - completedCount, 0)})</b>
            </div>
          </div>
          <div
            className="distribution-ring"
            style={
              {
                '--liquid': `${activePercent}%`,
                '--mwekeza': `${Math.min(activePercent + 25, 100)}%`,
              } as CSSProperties
            }
          >
            <PieChart size={18} />
          </div>
        </article>
      </div>

      {canManage ? (
        <form className="panel project-form" onSubmit={onCreate}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Admin tools</p>
              <h2>Create project</h2>
            </div>
            <Plus size={20} />
          </div>
          <label>
            Project name
            <input
              value={draft.name}
              onChange={(event) =>
                onDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Project name"
            />
          </label>
          <label>
            Description
            <textarea
              value={draft.description}
              onChange={(event) =>
                onDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="What this project is for"
            />
          </label>
          <div className="form-grid-two">
            <label>
              Start date
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label>
              Status
              <select
                value={draft.status}
                onChange={(event) =>
                  onDraft((current) => ({
                    ...current,
                    status: event.target.value as ProjectStatus,
                  }))
                }
              >
                <option>Planning</option>
                <option>Active</option>
                <option>Completed</option>
                <option>Paused</option>
              </select>
            </label>
          </div>
          <label>
            Investment from collected group cash
            <input
              inputMode="numeric"
              value={draft.investmentAmount}
              onChange={(event) =>
                onDraft((current) => ({
                  ...current,
                  investmentAmount: event.target.value,
                }))
              }
              placeholder="0"
            />
          </label>
          <div className="project-role-grid">
            {members.map((member) => (
              <label key={member.id}>
                {member.fullName}
                <select
                  value={draft.memberRoles[member.id] ?? ''}
                  onChange={(event) =>
                    onMemberRole(member.id, event.target.value as ProjectRole | '')
                  }
                >
                  <option value="">Not assigned</option>
                  <option>Project Chairman</option>
                  <option>Project Cashier</option>
                  <option>Project Member</option>
                </select>
              </label>
            ))}
          </div>
          <div className="mini-report">
            <span>Cash after investment</span>
            <strong>{formatTzs(fundTotals.combined - draftInvestment)}</strong>
          </div>
          <button className="primary-button" disabled={!canCreateProject} type="submit">
            <Plus size={18} />
            Create project
          </button>
        </form>
      ) : null}

      <article className="panel project-list-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">
              {canManage ? 'Project operations' : activeUser.fullName}
            </p>
            <h2>{canManage ? 'All projects' : 'Assigned projects'}</h2>
          </div>
          <PieChart size={20} />
        </div>
        {projects.length === 0 ? (
          <p>No projects available yet.</p>
        ) : (
          <div className="project-list">
            {projects.map((project) => {
              const income = project.entries
                .filter((entry) => entry.type === 'Income')
                .reduce((sum, entry) => sum + entry.amount, 0)
              const expenses = project.entries
                .filter((entry) => entry.type === 'Expense')
                .reduce((sum, entry) => sum + entry.amount, 0)
              const profit = income - expenses
              const wallet = project.investmentAmount + profit
              const entryDraft = entryDrafts[project.id] ?? {
                type: 'Income',
                amount: '',
                date: new Date().toISOString().slice(0, 10),
                note: '',
              }

              return (
                <div className="project-card" key={project.id}>
                  <div className="project-card-head">
                    <div>
                      <span className={`project-status ${project.status.toLowerCase()}`}>
                        {project.status}
                      </span>
                      <strong>{project.name}</strong>
                      <small>{project.startDate}</small>
                    </div>
                    {canManage ? (
                      <select
                        value={project.status}
                        onChange={(event) =>
                          onStatus(project.id, event.target.value as ProjectStatus)
                        }
                      >
                        <option>Planning</option>
                        <option>Active</option>
                        <option>Completed</option>
                        <option>Paused</option>
                      </select>
                    ) : null}
                  </div>
                  <p>{project.description || 'No description recorded.'}</p>
                  <div className="project-money-grid">
                    <Metric label="Investment" value={formatTzs(project.investmentAmount)} />
                    <Metric label="Income" value={formatTzs(income)} />
                    <Metric label="Expenses" value={formatTzs(expenses)} />
                    <Metric label="Wallet" value={formatTzs(wallet)} />
                  </div>
                  <div className="project-people">
                    {project.members.length === 0 ? (
                      <span>No assigned members yet</span>
                    ) : (
                      project.members.map((assignment) => {
                        const member = members.find((item) => item.id === assignment.memberId)

                        return (
                          <span key={`${project.id}-${assignment.memberId}`}>
                            {member?.fullName ?? 'Unknown'} / {assignment.role}
                          </span>
                        )
                      })
                    )}
                  </div>
                  {canManage ? (
                    <form
                      className="project-entry-form"
                      onSubmit={(event) => onEntrySave(project.id, event)}
                    >
                      <select
                        value={entryDraft.type}
                        onChange={(event) =>
                          onEntryDraft(project.id, {
                            type: event.target.value as ProjectEntryType,
                          })
                        }
                      >
                        <option>Income</option>
                        <option>Expense</option>
                      </select>
                      <input
                        inputMode="numeric"
                        placeholder="Amount"
                        value={entryDraft.amount}
                        onChange={(event) =>
                          onEntryDraft(project.id, { amount: event.target.value })
                        }
                      />
                      <input
                        type="date"
                        value={entryDraft.date}
                        onChange={(event) =>
                          onEntryDraft(project.id, { date: event.target.value })
                        }
                      />
                      <input
                        placeholder="Note"
                        value={entryDraft.note}
                        onChange={(event) =>
                          onEntryDraft(project.id, { note: event.target.value })
                        }
                      />
                      <button className="ghost-button" type="submit">
                        <ReceiptText size={18} />
                        Add entry
                      </button>
                    </form>
                  ) : null}
                  {project.entries.length > 0 ? (
                    <div className="project-entry-list">
                      {project.entries.slice(0, 4).map((entry) => (
                        <div className="transaction-row project-entry-row" key={entry.id}>
                          <div>
                            <strong>{entry.type}</strong>
                            <span>{entry.date}</span>
                          </div>
                          <div>
                            <b>{formatTzs(entry.amount)}</b>
                            <small>{entry.note || 'No note'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </article>
    </section>
  )
}

function ReportsView({
  activeUser,
  canManageReports,
  copied,
  fundTotals,
  isAdmin,
  members,
  onCopy,
  onSnapshot,
  plans,
  projects,
  summary,
  transactions,
}: {
  activeUser: Member
  canManageReports: boolean
  copied: boolean
  fundTotals: ReturnType<typeof liveFundTotals>
  isAdmin: boolean
  members: Member[]
  onCopy: (title: string, text: string) => Promise<void>
  onSnapshot: (
    action: ReportSnapshot['action'],
    title: string,
    body: string,
  ) => void
  plans: ReturnType<typeof allJulyPlans>
  projects: ProjectRecord[]
  summary: ReturnType<typeof julySummary>
  transactions: TransactionRecord[]
}) {
  const [reportScope, setReportScope] = useState<ReportScope>('mine')
  const [reportRange, setReportRange] = useState<ReportRange>('month')
  const currentMonthLabel = monthLabelForDate(todayInputValue())
  const currentMonthSlug = currentMonthLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const activePlan =
    plans.find((item) => item.member.id === activeUser.id) ?? plans[0]
  const effectiveScope = canManageReports ? reportScope : 'mine'
  const reportPlans = effectiveScope === 'group'
    ? plans
    : plans.filter((item) => item.member.id === activeUser.id)
  const scopedTransactions = transactions.filter(
    (transaction) =>
      transactionInReportRange(transaction, reportRange) &&
      (effectiveScope === 'group' || transaction.memberId === activeUser.id),
  )
  const projectTotals = projects.reduce(
    (totals, project) => {
      const income = project.entries
        .filter((entry) => entry.type === 'Income')
        .reduce((sum, entry) => sum + entry.amount, 0)
      const expenses = project.entries
        .filter((entry) => entry.type === 'Expense')
        .reduce((sum, entry) => sum + entry.amount, 0)

      return {
        investment: totals.investment + project.investmentAmount,
        income: totals.income + income,
        expenses: totals.expenses + expenses,
      }
    },
    { investment: 0, income: 0, expenses: 0 },
  )
  const reportText = buildReportText({
    activeUser,
    fundTotals,
    reportRange,
    reportScope: effectiveScope,
    plans: reportPlans,
    projects,
    summary,
    transactions: scopedTransactions,
  })
  const reportTitle =
    effectiveScope === 'group'
      ? `Auralis Holdings Group Report - ${reportRangeLabel(reportRange)}`
      : `Auralis Holdings Member Report - ${activeUser.fullName} - ${reportRangeLabel(reportRange)}`
  const memberTransactions = transactions.filter(
    (transaction) =>
      transaction.memberId === activeUser.id &&
      transactionInReportRange(transaction, reportRange),
  )
  const paidValue =
    effectiveScope === 'group'
      ? reportPlans.reduce((sum, item) => sum + item.plan.paid, 0)
      : activePlan.plan.paid
  const remainingValue =
    effectiveScope === 'group'
      ? reportPlans.reduce((sum, item) => sum + item.plan.remaining, 0)
      : activePlan.plan.remaining
  const dueValue =
    effectiveScope === 'group'
      ? reportPlans.reduce((sum, item) => sum + item.plan.due, 0)
      : activePlan.plan.due
  const collectionPercent = dueValue > 0 ? Math.round((paidValue / dueValue) * 100) : 0
  const rangeContributionValue = reportPlans.reduce(
    (sum, { member }) =>
      sum + contributionTotalsForRange(member.id, transactions, reportRange).total,
    0,
  )
  const projectWallet =
    projectTotals.investment + projectTotals.income - projectTotals.expenses
  const projectProfit = projectTotals.income - projectTotals.expenses

  return (
    <section className="reports-layout">
      <article className="report-hero-card">
        <div>
          <p className="eyebrow">
            {effectiveScope === 'group' ? 'Group report' : 'My report'} /{' '}
            {reportRangeLabel(reportRange)}
          </p>
          <h2>
            {effectiveScope === 'group'
              ? `${currentMonthLabel} position`
              : activeUser.fullName}
          </h2>
          <strong>{formatTzs(paidValue)}</strong>
          <span>
            {formatTzs(remainingValue)} remaining / {collectionPercent}% collected
          </span>
        </div>
        <ReportRing percent={collectionPercent} label="Collection" />
      </article>

      <article className="report-actions-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Output</p>
            <h2>{canManageReports ? (copied ? 'Copied' : 'Cashier report') : 'View only'}</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        <div className="report-filter-grid">
          <div className="report-filter-group">
            <span>Scope</span>
            <div className="report-segmented">
              <button
                className={effectiveScope === 'mine' ? 'active' : ''}
                onClick={() => setReportScope('mine')}
                type="button"
              >
                My report
              </button>
              <button
                className={effectiveScope === 'group' ? 'active' : ''}
                disabled={!canManageReports}
                onClick={() => setReportScope('group')}
                type="button"
              >
                Group
              </button>
            </div>
          </div>
          <label className="report-filter-group">
            <span>Time</span>
            <select
              onChange={(event) => setReportRange(event.target.value as ReportRange)}
              value={reportRange}
            >
              <option value="month">This month</option>
              <option value="last3">Last 3 months</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>
        {canManageReports ? (
          <div className="report-action-row">
            <button className="primary-button" onClick={() => void onCopy(reportTitle, reportText)} type="button">
              <ReceiptText size={18} />
              Copy
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                const csv = buildReportCsv(
                  reportPlans,
                  members,
                  scopedTransactions,
                  projects,
                  reportRange,
                )
                onSnapshot('csv', `${reportTitle} CSV`, csv)
                downloadTextFile(
                  csv,
                  `auralis-${currentMonthSlug}-${effectiveScope}-${reportRange}-report-${new Date().toISOString().slice(0, 10)}.csv`,
                  'text/csv;charset=utf-8',
                )
              }}
              type="button"
            >
              <ReceiptText size={18} />
              CSV
            </button>
          </div>
        ) : (
          <div className="read-only-payment-note">
            <ShieldCheck size={18} />
            Only the Cashier can copy or download reports.
          </div>
        )}
      </article>

      <article className="report-chart-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Cash view</p>
            <h2>Money split</h2>
          </div>
          <WalletCards size={20} />
        </div>
        <div className="report-bars">
          <ReportBar label="Paid" value={paidValue} max={Math.max(dueValue, 1)} />
          <ReportBar label="Remaining" value={remainingValue} max={Math.max(dueValue, 1)} />
          <ReportBar
            label={reportRangeLabel(reportRange)}
            value={rangeContributionValue}
            max={Math.max(rangeContributionValue, dueValue, 1)}
          />
          <ReportBar label="Main cash" value={fundTotals.combined} max={Math.max(fundTotals.combined + projectWallet, 1)} />
          <ReportBar label="Project wallet" value={projectWallet} max={Math.max(fundTotals.combined + projectWallet, 1)} />
        </div>
      </article>

      <div className="report-card-grid">
        <Metric label="Due" value={formatTzs(dueValue)} />
        <Metric label="Paid" value={formatTzs(paidValue)} />
        <Metric label={reportRangeLabel(reportRange)} value={formatTzs(rangeContributionValue)} />
        <Metric label="Main cash" value={formatTzs(fundTotals.combined)} />
        <Metric label="Project profit" value={formatTzs(projectProfit)} />
      </div>

      <article className="panel report-table-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">{effectiveScope === 'group' ? 'Members' : 'My account'}</p>
            <h2>{reportRangeLabel(reportRange)} contributions</h2>
          </div>
          <UsersRound size={20} />
        </div>
        <div className="report-table">
          {reportPlans.map(({ member, plan }, index) => {
            const rangeContribution = contributionTotalsForRange(
              member.id,
              transactions,
              reportRange,
            )

            return (
              <div className="report-row" key={member.id}>
                <div>
                  <strong>
                    {index + 1}. {member.fullName}
                  </strong>
                  <span>
                    {member.role} / {plan.status}
                  </span>
                </div>
                <div>
                  <small>{reportRangeLabel(reportRange)}</small>
                  <b>{formatTzs(rangeContribution.total)}</b>
                </div>
                <div>
                  <small>Due</small>
                  <b>{formatTzs(plan.due)}</b>
                </div>
                <div>
                  <small>Paid</small>
                  <b>{formatTzs(plan.paid)}</b>
                </div>
                <div>
                  <small>Remaining</small>
                  <b>{formatTzs(plan.remaining)}</b>
                </div>
                <StatusPill status={plan.status} />
              </div>
            )
          })}
        </div>
        {effectiveScope === 'mine' && memberTransactions.length > 0 ? (
          <div className="mini-report">
            <span>Manual entries recorded</span>
            <strong>
              {formatTzs(
                memberTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
              )}
            </strong>
          </div>
        ) : null}
      </article>

      <article className="panel report-project-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Projects</p>
            <h2>{isAdmin ? 'Project report' : 'My assigned projects'}</h2>
          </div>
          <PieChart size={20} />
        </div>
        <div className="project-report-grid">
          <Metric label="Investment" value={formatTzs(projectTotals.investment)} />
          <Metric label="Profit" value={formatTzs(projectProfit)} />
          <Metric label="Wallet" value={formatTzs(projectWallet)} />
        </div>
        <div className="content-list">
          {projects.length === 0 ? (
            <p>No project data available yet.</p>
          ) : (
            projects.map((project) => {
              const income = project.entries
                .filter((entry) => entry.type === 'Income')
                .reduce((sum, entry) => sum + entry.amount, 0)
              const expenses = project.entries
                .filter((entry) => entry.type === 'Expense')
                .reduce((sum, entry) => sum + entry.amount, 0)

              return (
                <div className="compact-update" key={project.id}>
                  <strong>{project.name}</strong>
                  <span>
                    {project.status} / Investment {formatTzs(project.investmentAmount)} /
                    Profit {formatTzs(income - expenses)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </article>
    </section>
  )
}

function SettingsView({
  backupMessage,
  chatCount,
  memberCount,
  meetingCount,
  noticeCount,
  onBackup,
  onImport,
  projectCount,
  transactionCount,
}: {
  backupMessage: string
  chatCount: number
  memberCount: number
  meetingCount: number
  noticeCount: number
  onBackup: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  projectCount: number
  transactionCount: number
}) {
  return (
    <section className="settings-layout">
      <article className="hero-balance settings-hero">
        <div className="hero-topline">
          <span>System safety</span>
          <Settings size={22} />
        </div>
        <strong>{memberCount} members</strong>
        <div className="fund-split">
          <span>{transactionCount} payments</span>
          <span>{projectCount} projects</span>
        </div>
      </article>

      <article className="panel backup-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Local data</p>
            <h2>Backup and restore</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>
          Export everything saved on this browser into one JSON backup file.
          Restore only from a trusted Auralis Holdings backup.
        </p>
        <div className="backup-actions">
          <button className="primary-button" onClick={onBackup} type="button">
            <ReceiptText size={18} />
            Export backup
          </button>
          <label className="upload-button import-button">
            <ReceiptText size={18} />
            Import backup
            <input accept="application/json" onChange={onImport} type="file" />
          </label>
        </div>
        {backupMessage ? <p className="backup-message">{backupMessage}</p> : null}
      </article>

      <div className="metric-row">
        <Metric label="Members" value={`${memberCount}`} />
        <Metric label="Payments" value={`${transactionCount}`} />
        <Metric label="Projects" value={`${projectCount}`} />
        <Metric label="Chat messages" value={`${chatCount}`} />
      </div>

      <article className="panel settings-audit-card">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Included records</p>
            <h2>Backup coverage</h2>
          </div>
          <ReceiptText size={20} />
        </div>
        <div className="settings-checklist">
          <span>Members and roles</span>
          <span>Payments and fund movements</span>
          <span>Projects, project members, income, expenses</span>
          <span>Notices and meetings</span>
          <span>Chat messages and profile pictures</span>
          <span>
            Notices {noticeCount} / Meetings {meetingCount}
          </span>
        </div>
      </article>
    </section>
  )
}

function UpdatesView({
  announcements,
  canManage,
  meetingDraft,
  meetings,
  members,
  noticeDraft,
  onCreateMeeting,
  onCreateNotice,
  onMeetingDraft,
  onMeetingField,
  onNoticeDraft,
  onToggleAttendance,
}: {
  announcements: Announcement[]
  canManage: boolean
  meetingDraft: MeetingDraft
  meetings: Meeting[]
  members: Member[]
  noticeDraft: AnnouncementDraft
  onCreateMeeting: (event: React.FormEvent) => void
  onCreateNotice: (event: React.FormEvent) => void
  onMeetingDraft: React.Dispatch<React.SetStateAction<MeetingDraft>>
  onMeetingField: (
    meetingId: string,
    field: 'minutes' | 'actionItems',
    value: string,
  ) => void
  onNoticeDraft: React.Dispatch<React.SetStateAction<AnnouncementDraft>>
  onToggleAttendance: (meetingId: string, memberId: string) => void
}) {
  return (
    <section className="updates-layout">
      <NoticesView
        announcements={announcements}
        canManage={canManage}
        draft={noticeDraft}
        members={members}
        onCreate={onCreateNotice}
        onDraft={onNoticeDraft}
      />
      <MeetingsView
        canManage={canManage}
        draft={meetingDraft}
        meetings={meetings}
        members={members}
        onCreate={onCreateMeeting}
        onDraft={onMeetingDraft}
        onMeetingField={onMeetingField}
        onToggleAttendance={onToggleAttendance}
      />
    </section>
  )
}

function NoticesView({
  announcements,
  canManage,
  draft,
  members,
  onCreate,
  onDraft,
}: {
  announcements: Announcement[]
  canManage: boolean
  draft: AnnouncementDraft
  members: Member[]
  onCreate: (event: React.FormEvent) => void
  onDraft: React.Dispatch<React.SetStateAction<AnnouncementDraft>>
}) {
  return (
    <section className="content-layout">
      {canManage ? (
        <form className="panel content-form" onSubmit={onCreate}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Communication</p>
              <h2>Publish notice</h2>
            </div>
            <Megaphone size={20} />
          </div>
          <label>
            Type
            <select
              value={draft.type}
              onChange={(event) =>
                onDraft((current) => ({
                  ...current,
                  type: event.target.value as NoticeType,
                }))
              }
            >
              <option>Reminder</option>
              <option>Meeting</option>
              <option>Project Update</option>
              <option>Emergency</option>
            </select>
          </label>
          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) =>
                onDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Notice title"
            />
          </label>
          <label>
            Message
            <textarea
              value={draft.body}
              onChange={(event) =>
                onDraft((current) => ({ ...current, body: event.target.value }))
              }
              placeholder="Write the announcement"
            />
          </label>
          <button className="primary-button" type="submit">
            <Megaphone size={18} />
            Publish notice
          </button>
        </form>
      ) : null}

      <article className="panel content-list-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Group notices</p>
            <h2>Announcements</h2>
          </div>
          <Bell size={20} />
        </div>
        <div className="content-list">
          {announcements.map((notice) => {
            const creator = members.find((member) => member.id === notice.createdBy)

            return (
              <div className="notice-card" key={notice.id}>
                <span className={`notice-type ${notice.type.toLowerCase().replace(' ', '-')}`}>
                  {notice.type}
                </span>
                <strong>{notice.title}</strong>
                <p>{notice.body}</p>
                <small>
                  {notice.date} / {creator?.fullName ?? 'Auralis'}
                </small>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}

function MeetingsView({
  canManage,
  draft,
  meetings,
  members,
  onCreate,
  onDraft,
  onMeetingField,
  onToggleAttendance,
}: {
  canManage: boolean
  draft: MeetingDraft
  meetings: Meeting[]
  members: Member[]
  onCreate: (event: React.FormEvent) => void
  onDraft: React.Dispatch<React.SetStateAction<MeetingDraft>>
  onMeetingField: (
    meetingId: string,
    field: 'minutes' | 'actionItems',
    value: string,
  ) => void
  onToggleAttendance: (meetingId: string, memberId: string) => void
}) {
  return (
    <section className="content-layout">
      {canManage ? (
        <form className="panel content-form" onSubmit={onCreate}>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Secretary tools</p>
              <h2>Create meeting</h2>
            </div>
            <CalendarDays size={20} />
          </div>
          <label>
            Title
            <input
              value={draft.title}
              onChange={(event) =>
                onDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Meeting title"
            />
          </label>
          <div className="form-grid-two">
            <label>
              Date
              <input
                type="date"
                value={draft.date}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, date: event.target.value }))
                }
              />
            </label>
            <label>
              Time
              <input
                type="time"
                value={draft.time}
                onChange={(event) =>
                  onDraft((current) => ({ ...current, time: event.target.value }))
                }
              />
            </label>
          </div>
          <label>
            Location
            <input
              value={draft.location}
              onChange={(event) =>
                onDraft((current) => ({ ...current, location: event.target.value }))
              }
              placeholder="Online or physical location"
            />
          </label>
          <label>
            Agenda
            <textarea
              value={draft.agenda}
              onChange={(event) =>
                onDraft((current) => ({ ...current, agenda: event.target.value }))
              }
              placeholder="Meeting agenda"
            />
          </label>
          <button className="primary-button" type="submit">
            <CalendarDays size={18} />
            Save meeting
          </button>
        </form>
      ) : null}

      <article className="panel content-list-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Group calendar</p>
            <h2>Meetings</h2>
          </div>
          <CalendarDays size={20} />
        </div>
        <div className="content-list">
          {meetings.map((meeting) => (
            <div className="meeting-card" key={meeting.id}>
              <div className="meeting-head">
                <div>
                  <strong>{meeting.title}</strong>
                  <span>
                    {meeting.date} at {meeting.time} / {meeting.location}
                  </span>
                </div>
                <b>
                  {Object.values(meeting.attendance).filter(Boolean).length}/
                  {members.length}
                </b>
              </div>
              <p>{meeting.agenda || 'Agenda pending.'}</p>
              <div className="attendance-grid">
                {members.map((member) => (
                  <button
                    className={
                      meeting.attendance[member.id]
                        ? 'attendance-pill active'
                        : 'attendance-pill'
                    }
                    disabled={!canManage}
                    key={member.id}
                    onClick={() => onToggleAttendance(meeting.id, member.id)}
                    type="button"
                  >
                    {member.fullName.split(' ')[0]}
                  </button>
                ))}
              </div>
              {canManage ? (
                <div className="meeting-notes">
                  <label>
                    Minutes
                    <textarea
                      value={meeting.minutes}
                      onChange={(event) =>
                        onMeetingField(meeting.id, 'minutes', event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Action items
                    <textarea
                      value={meeting.actionItems}
                      onChange={(event) =>
                        onMeetingField(meeting.id, 'actionItems', event.target.value)
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="meeting-readonly-notes">
                  {meeting.minutes ? <p>{meeting.minutes}</p> : null}
                  {meeting.actionItems ? <p>{meeting.actionItems}</p> : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function ChatView({
  activeUser,
  avatars,
  draft,
  isAdmin,
  members,
  messages,
  onDelete,
  onDraft,
  onSend,
}: {
  activeUser: Member
  avatars: AvatarMap
  draft: string
  isAdmin: boolean
  members: Member[]
  messages: ChatMessage[]
  onDelete: (messageId: string) => void
  onDraft: React.Dispatch<React.SetStateAction<string>>
  onSend: (event: React.FormEvent) => void
}) {
  return (
    <section className="chat-layout">
      <article className="panel chat-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">One shared room</p>
            <h2>Group chat</h2>
          </div>
          <MessageCircle size={20} />
        </div>
        <div className="chat-thread">
          {messages.map((message) => {
            const sender = members.find((member) => member.id === message.memberId)
            const mine = message.memberId === activeUser.id
            const canDelete = isAdmin || mine

            return (
              <div
                className={mine ? 'chat-message mine' : 'chat-message'}
                key={message.id}
              >
                <Avatar
                  avatar={avatars[message.memberId]}
                  memberName={sender?.fullName ?? 'Member'}
                  size="small"
                />
                <div className="chat-bubble">
                  <div className="chat-meta">
                    <strong>{sender?.fullName ?? 'Unknown member'}</strong>
                    <span>
                      {new Date(message.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p>{message.body}</p>
                  {canDelete ? (
                    <button
                      className="chat-delete"
                      onClick={() => onDelete(message.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        <form className="chat-composer" onSubmit={onSend}>
          <input
            aria-label="Message"
            placeholder="Write a message"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
          />
          <button className="primary-button" type="submit">
            Send
          </button>
        </form>
      </article>
    </section>
  )
}

function FloatingAssistant({
  draft,
  error,
  loading,
  messages,
  onDraft,
  onSend,
  user,
}: {
  draft: string
  error: string
  loading: boolean
  messages: AssistantMessage[]
  onDraft: React.Dispatch<React.SetStateAction<string>>
  onSend: (event: React.FormEvent) => void
  user: Member
}) {
  const [open, setOpen] = useState(false)
  const [showGreeting, setShowGreeting] = useState(true)
  const prompts = [
    'How am I doing with my payments?',
    'Who still owes the most money?',
    'What is the total in the funds right now?',
    'Break down the penalty math for me.',
  ]

  useEffect(() => {
    const timer = setTimeout(() => setShowGreeting(false), 8000)
    return () => clearTimeout(timer)
  }, [])

  const openPanel = () => {
    setOpen(true)
    setShowGreeting(false)
  }

  return (
    <div className="floating-assistant">
      {open ? (
        <div className="floating-assistant-panel">
          <div className="floating-assistant-header">
            <div className="assistant-orb">
              <Bot size={18} />
            </div>
            <strong>Auralis</strong>
            <button
              aria-label="Close Auralis"
              className="icon-button"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="assistant-prompt-row">
              {prompts.map((prompt) => (
                <button
                  disabled={loading}
                  key={prompt}
                  onClick={() => onDraft(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          <div className="assistant-thread">
            {messages.length === 0 ? (
              <div className="assistant-message auralis">
                <strong>Auralis</strong>
                <p>Hello, I'm Auralis. Ask me anything about the group's members, payments, debt, or penalties.</p>
              </div>
            ) : null}
            {messages.map((message) => (
              <div
                className={
                  message.role === 'user'
                    ? 'assistant-message user'
                    : 'assistant-message auralis'
                }
                key={message.id}
              >
                <strong>{message.role === 'user' ? user.fullName : 'Auralis'}</strong>
                <p>{message.body}</p>
              </div>
            ))}
            {loading ? (
              <div className="assistant-message auralis thinking">
                <strong>Auralis</strong>
                <p>Let me check the records real quick...</p>
              </div>
            ) : null}
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <form className="assistant-composer" onSubmit={onSend}>
            <input
              aria-label="Ask Auralis"
              placeholder="Ask me anything about the group finances..."
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
            />
            <button className="primary-button" disabled={loading} type="submit">
              Send
            </button>
          </form>
        </div>
      ) : null}

      {!open && showGreeting ? (
        <button className="floating-assistant-greeting" onClick={openPanel} type="button">
          Hello, I'm Auralis — ask me anything!
        </button>
      ) : null}

      <button
        aria-label={open ? 'Close Auralis assistant' : 'Open Auralis assistant'}
        className="floating-assistant-toggle"
        onClick={() => (open ? setOpen(false) : openPanel())}
        type="button"
      >
        {open ? <X size={24} /> : <Bot size={24} />}
      </button>
    </div>
  )
}

function ProfileView({
  announcements,
  avatar,
  meetings,
  user,
  plan,
  projects,
  transactions,
  onAvatar,
  onLogout,
  onOpenReport,
}: {
  announcements: Announcement[]
  avatar?: string
  meetings: Meeting[]
  user: Member
  plan: ReturnType<typeof julyPlanForMember>
  projects: ProjectRecord[]
  transactions: TransactionRecord[]
  onAvatar: (memberId: string, event: ChangeEvent<HTMLInputElement>) => void
  onLogout: () => void
  onOpenReport: () => void
}) {
  const currentMonthLabel = monthLabelForDate(todayInputValue())
  const shortCurrentMonthLabel = shortMonthLabelForDate(todayInputValue())
  const paid = plan.paid
  const progress =
    plan.due > 0 ? Math.min(Math.round((plan.paid / plan.due) * 100), 100) : 0
  const history = [
    ...transactions.map((transaction) => ({
      id: transaction.id,
      label: transaction.note || `${monthLabelForDate(transaction.date)} payment`,
      date: transaction.date,
      amount: transaction.amount,
      status: 'Cleared',
    })),
    ...getMemberRecords(user.id)
      .slice(-2)
      .reverse()
      .map((record) => ({
        id: `${user.id}-${record.month}`,
        label: record.label,
        date: record.month,
        amount: record.liquid + record.mwekeza,
        status: 'Imported',
      })),
  ].slice(0, 3)

  return (
    <section className="profile-page">
      <article className="profile-stitch-shell">
        <section className="profile-identity">
          <div className="profile-photo-wrap">
            <Avatar avatar={avatar} memberName={user.fullName} size="large" />
            <label className="profile-dp-action">
              <Camera size={13} />
              <input
                accept="image/*"
                onChange={(event) => onAvatar(user.id, event)}
                type="file"
              />
            </label>
          </div>
          <h2>{user.fullName}</h2>
          <span>@{user.username}</span>
          <b>{user.role}</b>
        </section>

        <section className="profile-stat-grid">
          <div>
            <span>Joined</span>
            <strong>{shortCurrentMonthLabel}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{user.role}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>Active</strong>
          </div>
        </section>

        <section className="profile-finance-card">
          <div className="panel-title">
            <h3>
              <WalletCards size={18} />
              Financial Summary
            </h3>
            <span>{currentMonthLabel}</span>
          </div>
          <div className="profile-finance-grid">
            <div>
              <span>Total paid</span>
              <strong>{formatTzs(paid)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{formatTzs(plan.remaining)}</strong>
            </div>
          </div>
          <div className="profile-progress-line">
            <div>
              <span>Progress to target</span>
              <b>{progress}%</b>
            </div>
            <i>
              <b style={{ width: `${progress}%` }} />
            </i>
          </div>
        </section>

        <section className="profile-project-strip">
          <div className="panel-title">
            <h3>Projects involved</h3>
            <PieChart size={16} />
          </div>
          <div>
            {projects.length === 0 ? (
              <span>No assigned projects</span>
            ) : (
              projects.map((project) => <span key={project.id}>{project.name}</span>)
            )}
          </div>
        </section>

        <section className="profile-history-card">
          <h3>Payment History</h3>
          {history.length === 0 ? (
            <p>No payment history available yet.</p>
          ) : (
            history.map((entry) => (
              <div className="profile-history-row" key={entry.id}>
                <div>
                  <CalendarDays size={18} />
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.date}</small>
                  </span>
                </div>
                <div>
                  <strong>{formatTzs(entry.amount)}</strong>
                  <small>{entry.status}</small>
                </div>
              </div>
            ))
          )}
          <button onClick={onOpenReport} type="button">
            View full report
          </button>
        </section>

        <section className="profile-update-card">
          <div className="panel-title">
            <h3>Latest activity</h3>
            <Bell size={16} />
          </div>
          <div className="compact-updates">
            {announcements.slice(0, 1).map((notice) => (
              <div className="compact-update" key={notice.id}>
                <strong>{notice.title}</strong>
                <span>{notice.type}</span>
              </div>
            ))}
            {meetings.slice(0, 1).map((meeting) => (
              <div className="compact-update" key={meeting.id}>
                <strong>{meeting.title}</strong>
                <span>{meeting.date} at {meeting.time}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-action-grid">
          <button onClick={onOpenReport} type="button">
            <ReceiptText size={16} />
            My Report
          </button>
          <button onClick={onLogout} type="button">
            <LogOut size={16} />
            Sign out
          </button>
        </section>
      </article>
    </section>
  )
}

function Avatar({
  avatar,
  memberName,
  size = 'medium',
}: {
  avatar?: string
  memberName: string
  size?: 'small' | 'medium' | 'large'
}) {
  return (
    <span className={`avatar ${size}`}>
      {avatar ? <img alt={`${memberName} profile`} src={avatar} /> : initials(memberName)}
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ReportRing({ percent, label }: { percent: number; label: string }) {
  const safePercent = Math.max(0, Math.min(percent, 100))

  return (
    <div
      className="report-ring"
      style={{ '--percent': `${safePercent}%` } as CSSProperties}
    >
      <strong>{safePercent}%</strong>
      <span>{label}</span>
    </div>
  )
}

function ReportBar({
  label,
  max,
  value,
}: {
  label: string
  max: number
  value: number
}) {
  const width = Math.max(3, Math.min((value / max) * 100, 100))

  return (
    <div className="report-bar">
      <div>
        <span>{label}</span>
        <strong>{formatTzs(value)}</strong>
      </div>
      <i>
        <b style={{ width: `${width}%` }} />
      </i>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const className = status === 'Paid On Time' ? 'good' : status === 'Partially Paid' ? 'warn' : 'bad'

  return <span className={`status-pill ${className}`}>{status}</span>
}

function buildReportText({
  activeUser,
  fundTotals,
  reportRange,
  reportScope,
  plans,
  projects,
  summary,
  transactions,
}: {
  activeUser: Member
  fundTotals: ReturnType<typeof liveFundTotals>
  reportRange: ReportRange
  reportScope: ReportScope
  plans: ReturnType<typeof allJulyPlans>
  projects: ProjectRecord[]
  summary: ReturnType<typeof julySummary>
  transactions: TransactionRecord[]
}) {
  const currentMonthLabel = monthLabelForDate(todayInputValue())
  const reportLabel = reportRangeLabel(reportRange)
  const reportTotalDue = plans.reduce((sum, { plan }) => sum + plan.due, 0)
  const reportTotalPaid = plans.reduce((sum, { plan }) => sum + plan.paid, 0)
  const reportRemaining = plans.reduce((sum, { plan }) => sum + plan.remaining, 0)
  const reportPenaltyAtRisk = plans.reduce((sum, { plan }) => sum + plan.penalty, 0)
  const projectTotals = projects.reduce(
    (totals, project) => {
      const income = project.entries
        .filter((entry) => entry.type === 'Income')
        .reduce((sum, entry) => sum + entry.amount, 0)
      const expenses = project.entries
        .filter((entry) => entry.type === 'Expense')
        .reduce((sum, entry) => sum + entry.amount, 0)

      return {
        investment: totals.investment + project.investmentAmount,
        income: totals.income + income,
        expenses: totals.expenses + expenses,
      }
    },
    { investment: 0, income: 0, expenses: 0 },
  )
  const title =
    reportScope === 'group'
      ? `Auralis Holdings Group Report - ${reportLabel}`
      : `Auralis Holdings Member Report - ${activeUser.fullName} - ${reportLabel}`
  const memberLines = plans.map(({ member, plan }, index) => {
    const rangeTotals = contributionTotalsForRange(member.id, transactions, reportRange)

    return `${index + 1}. ${member.fullName} (${member.role}): ${reportLabel.toLowerCase()} contribution ${formatTzs(
      rangeTotals.total,
    )}, due ${formatTzs(plan.due)}, paid ${formatTzs(
        plan.paid,
      )}, remaining ${formatTzs(plan.remaining)}, status ${plan.status}`
  })
  const projectLines =
    projects.length === 0
      ? ['No project data recorded.']
      : projects.map((project) => {
          const income = project.entries
            .filter((entry) => entry.type === 'Income')
            .reduce((sum, entry) => sum + entry.amount, 0)
          const expenses = project.entries
            .filter((entry) => entry.type === 'Expense')
            .reduce((sum, entry) => sum + entry.amount, 0)

          return `${project.name}: ${project.status}, investment ${formatTzs(
            project.investmentAmount,
          )}, profit ${formatTzs(income - expenses)}`
        })

  return [
    title,
    `Generated: ${new Date().toLocaleString('en-GB')}`,
    `Prepared by: ${activeUser.fullName} (${activeUser.role})`,
    `Scope: ${reportScope === 'group' ? 'All group members' : 'Own report'}`,
    `Time range: ${reportLabel}`,
    '',
    `${currentMonthLabel} contributions`,
    `Total due: ${formatTzs(reportTotalDue)}`,
    `Total paid: ${formatTzs(reportTotalPaid)}`,
    `Remaining: ${formatTzs(reportRemaining)}`,
    `Penalty at risk: ${formatTzs(reportPenaltyAtRisk || summary.penaltyAtRisk)}`,
    '',
    'Fund position',
    `Main cash balance: ${formatTzs(fundTotals.combined)}`,
    `UTT liquid: ${formatTzs(fundTotals.liquid)}`,
    `Mwekeza: ${formatTzs(fundTotals.mwekeza)}`,
    `Project investment moved out: ${formatTzs(fundTotals.projectInvestmentTotal)}`,
    '',
    'Members',
    ...memberLines,
    '',
    'Projects',
    `Investment: ${formatTzs(projectTotals.investment)}`,
    `Income: ${formatTzs(projectTotals.income)}`,
    `Expenses: ${formatTzs(projectTotals.expenses)}`,
    `Profit: ${formatTzs(projectTotals.income - projectTotals.expenses)}`,
    ...projectLines,
    '',
    `Manual payment entries: ${transactions.length}`,
  ].join('\n')
}

function exportJulyCsv(transactions: TransactionRecord[], members: Member[]) {
  const currentMonthLabel = monthLabelForDate(todayInputValue())
  const currentMonthSlug = currentMonthLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const header = [
    'Date',
    'Member',
    'Method',
    'Amount',
    'UTT',
    'Mwekeza',
    'Debt UTT',
    'Debt Mwekeza',
    'Debt Total',
    'Overpayment',
    'Note',
  ]
  const rows = transactions.map((transaction) => {
    const member = members.find((item) => item.id === transaction.memberId)
    const allocation = normalizeAllocation(transaction.allocation)

    return [
      transaction.date,
      member?.fullName ?? '',
      transaction.method,
      transaction.amount.toString(),
      allocation.liquid.toString(),
      allocation.mwekeza.toString(),
      allocation.debtUtt.toString(),
      allocation.debtMwekeza.toString(),
      allocation.debt.toString(),
      allocation.overpayment.toString(),
      transaction.note,
    ]
  })
  const csv = [header, ...rows]
    .map((row) =>
      row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','),
    )
    .join('\n')
  downloadTextFile(csv, `auralis-${currentMonthSlug}-payments.csv`, 'text/csv;charset=utf-8')
}

function buildReportCsv(
  plans: ReturnType<typeof allJulyPlans>,
  members: Member[],
  transactions: TransactionRecord[],
  projects: ProjectRecord[],
  reportRange: ReportRange,
) {
  const currentMonthLabel = monthLabelForDate(todayInputValue())
  const rangeLabel = reportRangeLabel(reportRange)
  const header = [
    'Member No',
    'Member',
    'Role',
    `${rangeLabel} Contribution`,
    `${rangeLabel} Manual Entries`,
    `${rangeLabel} Manual Total`,
    `${currentMonthLabel} Due`,
    `${currentMonthLabel} Paid`,
    'Remaining',
    'Penalty',
    'Status',
    'Manual Entries',
    'Assigned Projects',
  ]
  const rows = plans.map(({ member, plan }, index) => {
    const manualEntries = transactions.filter(
      (transaction) => transaction.memberId === member.id,
    )
    const rangeTotals = contributionTotalsForRange(member.id, transactions, reportRange)
    const assignedProjects = projects
      .filter((project) =>
        project.members.some((assignment) => assignment.memberId === member.id),
      )
      .map((project) => project.name)
      .join('; ')

    return [
      index + 1,
      member.fullName,
      members.find((item) => item.id === member.id)?.role ?? member.role,
      rangeTotals.total,
      manualEntries.length,
      manualEntries.reduce((sum, transaction) => sum + transaction.amount, 0),
      plan.due,
      plan.paid,
      plan.remaining,
      plan.penalty,
      plan.status,
      manualEntries.length,
      assignedProjects,
    ]
  })
  const csv = [header, ...rows]
    .map((row) =>
      row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','),
    )
    .join('\n')

  return csv
}

function downloadTextFile(body: string, filename: string, type: string) {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default App
