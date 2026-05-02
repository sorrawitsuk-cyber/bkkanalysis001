// Test Traffy API pagination - are start=0 and start=500 returning different records?
const API = 'https://publicapi.traffy.in.th/share/teamchadchart/search';

const [r0, r500] = await Promise.all([
  fetch(`${API}?limit=5&start=0`).then(r => r.json()),
  fetch(`${API}?limit=5&start=500`).then(r => r.json()),
]);

console.log('Total records (API):', r0.total);
console.log('\n--- start=0, first 5 ticket_ids ---');
r0.results?.forEach((r, i) => console.log(` [${i}]`, r.ticket_id, '|', r.timestamp?.slice(0,10)));

console.log('\n--- start=500, first 5 ticket_ids ---');
r500.results?.forEach((r, i) => console.log(` [${i}]`, r.ticket_id, '|', r.timestamp?.slice(0,10)));

const ids0   = new Set(r0.results?.map(r => r.ticket_id));
const ids500 = new Set(r500.results?.map(r => r.ticket_id));
const overlap = [...ids0].filter(id => ids500.has(id));
console.log('\nOverlap ticket_ids:', overlap.length, '(0 = pagination works correctly)');
