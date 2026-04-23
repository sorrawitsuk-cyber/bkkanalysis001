import fetch from 'node-fetch';

const urls = [
  "https://publicapi.traffy.in.th/share/team/statistics/district?team=กรุงเทพมหานคร",
  "https://publicapi.traffy.in.th/team-report-stats-all?team=กรุงเทพมหานคร",
  "https://publicapi.traffy.in.th/share/team/statistics/district?team=Bangkok",
  "https://publicapi.traffy.in.th/team-report-stats-all?team=Bangkok",
  "https://publicapi.traffy.in.th/share/team/statistics/district?team_name=กรุงเทพมหานคร"
];

async function discoverTraffyAPI() {
  for (const url of urls) {
    console.log(`Testing: ${url}`);
    try {
      const response = await fetch(url);
      console.log(`Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Success! Data keys: ${Object.keys(data)}`);
        if (data.results) {
           console.log(`Results length: ${data.results.length}`);
           return url;
        }
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

discoverTraffyAPI();
