const { setBackendValue, supabaseConfigured } = require('../api/backend.cjs')

const members = [
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

const cleanState = {
  'auralis-members-v1': members,
  'auralis-transactions-v1': [],
  'auralis-projects-v1': [],
  'auralis-announcements-v1': [
    {
      id: 'notice-july-contribution',
      type: 'Reminder',
      title: 'July contribution cycle is open',
      body: 'Members should complete the normal contribution plus debt installment before the day-10 guard.',
      date: '2026-07-01',
      createdBy: 'geoffrey-kapinga',
    },
  ],
  'auralis-meetings-v1': [
    {
      id: 'meeting-july-review',
      title: 'July contribution review',
      date: '2026-07-10',
      time: '19:00',
      location: 'Online',
      agenda: 'Review July payments, debt installment progress, and penalty guard status.',
      minutes: '',
      actionItems: '',
      attendance: {},
      createdBy: 'geoffrey-kapinga',
    },
  ],
  'auralis-chat-v1': [
    {
      id: 'chat-welcome',
      memberId: 'geoffrey-kapinga',
      body: 'Welcome to the Auralis Holdings group room.',
      createdAt: '2026-07-01T09:00:00.000Z',
    },
  ],
  'auralis-avatars-v1': {},
  'auralis-reports-v1': [],
}

async function main() {
  if (!supabaseConfigured) {
    throw new Error('Supabase is not configured. Check .env before seeding.')
  }

  for (const [key, value] of Object.entries(cleanState)) {
    const result = await setBackendValue(key, value)
    console.log(`${key} seeded at ${result.updatedAt}`)
  }

  console.log('Auralis clean seed complete.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
