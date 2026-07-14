// Shared mock data for the prototype patient portal (NON-PRODUCTION, static).
// One patient "Sarah", mid-journey (step 2), so every screen tells a consistent story.

export const MOCK = {
  user: {
    firstName: 'Sarah',
    lastName: 'Mitchell',
    email: 'sarah.mitchell@example.com',
    initials: 'SM',
  },
  journey: {
    currentStep: 2,
    steps: [
      { n: 1, key: 'book', label: 'Book your consult', done: true },
      { n: 2, key: 'profile', label: 'Health profile', done: false, current: true },
      { n: 3, key: 'ready', label: 'Get ready', done: false },
    ],
  },
  session: {
    title: 'Diabetes Reversal Strategy Session',
    startIso: '2026-07-02T17:00:00Z',
    durationMin: 30,
    director: 'Dr. Jane Doe',
    tz: 'America/Los_Angeles',
    meetLink: 'https://meet.google.com/csi-zgyq-bgf',
  },
};

// Bottom-nav + desktop-nav items.
export const NAV = [
  { to: '/prototype', key: 'home', label: 'Home', icon: 'home' },
  { to: '/prototype/booking', key: 'book', label: 'Book', icon: 'calendar' },
  { to: '/prototype/forms', key: 'profile', label: 'Profile', icon: 'clipboard' },
  { to: '/prototype/ready', key: 'ready', label: 'Ready', icon: 'sparkles' },
];

export const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';
