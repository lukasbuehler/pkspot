const photo = 'src/assets/events/swissjam/swissjam1.jpg';
const second = 'src/assets/events/swissjam/swissjam2.jpg';
const third = 'src/assets/events/swissjam/swissjam0.jpg';
export const fixtures = [
  { id: 'spot-photo', kind: 'spot', label: 'Spot', title: 'Grandstand Parkour Park', subtitle: 'Luzern, Switzerland', detail: 'Find your next training spot', photos: [photo] },
  { id: 'spot-collage', kind: 'spot', label: 'Spot', title: 'Sihlcity Parkour Park', subtitle: 'Example training spot · Zürich', detail: 'Explore on PK Spot', photos: [photo, second, third] },
  { id: 'spot-empty', kind: 'spot', label: 'Spot', title: 'Güterbahnhof Nord', subtitle: 'Example Spot · Bern, Switzerland', detail: 'Explore on PK Spot', photos: [] },
  { id: 'event-photo', kind: 'event', label: 'Event', title: 'Swiss Jam 2026', subtitle: '26–28 June 2026 · Switzerland', detail: 'Three days. One community.', photos: ['src/assets/events/swissjam/swissjam26_banner.jpg'] },
  { id: 'event-empty', kind: 'event', label: 'Event', title: 'Farang × TRAZER\nParkour 360 Jam', subtitle: '22 September 2026 · TRAZER Parkour 360', detail: 'Discover the event on PK Spot', photos: [] },
  { id: 'community', kind: 'community', label: 'Community', title: 'Parkour in Prague', subtitle: 'Find Spots. Meet your community.', detail: 'Explore Prague on PK Spot', photos: [photo, second, third] },
  { id: 'profile', kind: 'profile', label: 'Public profile', title: 'Alex Example', subtitle: 'Part of the parkour community', detail: 'Connect on PK Spot', photos: [] },
  { id: 'landing', kind: 'page', label: 'PK Spot', title: 'Find your place.\nMake your move.', subtitle: 'Spots, events and your next session.', detail: 'Built for the parkour community', photos: [photo] },
  { id: 'map', kind: 'page', label: 'Explore', title: 'The world is\nyour playground.', subtitle: 'Find parkour Spots around you.', detail: 'The PK Spot map', photos: [] },
  { id: 'events', kind: 'page', label: 'Events', title: 'Something to\nlook forward to.', subtitle: 'Jams, competitions, camps and workshops.', detail: 'Discover parkour events', photos: [second] },
  { id: 'training', kind: 'page', label: 'Training', title: 'Show up.\nKeep moving.', subtitle: 'Plan sessions and log your progress.', detail: 'Your training on PK Spot', photos: [] },
  { id: 'long-de', kind: 'spot', label: 'Spot', title: 'Ein besonders langer Name für einen Parkour-Spot am alten Güterbahnhof', subtitle: 'München, Deutschland', detail: 'Entdecke deinen nächsten Trainingsort', photos: [photo] },
];
