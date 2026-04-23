import fetch from 'node-fetch';

async function testTraffyAPI() {
  console.log("Fetching real Traffy Fondue stats for Bangkok districts...");
  
  // Official public statistics endpoint (common for Traffy Fondue)
  const url = "https://publicapi.traffy.in.th/share/team/statistics/district?team=กรุงเทพมหานคร";
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (data && data.results) {
        console.log("✅ Successfully fetched real Traffy data!");
        console.log("Sample result (first 2 districts):");
        console.log(JSON.stringify(data.results.slice(0, 2), null, 2));
        return data.results;
    } else {
        console.warn("⚠️ API returned no results or unexpected format.");
        console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Failed to fetch Traffy API:", error.message);
  }
}

testTraffyAPI();
