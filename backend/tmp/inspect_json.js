
const URL = "https://monad-execution-trace-indexer-default-rtdb.firebaseio.com/private.json";

async function testFetch() {
  try {
    const response = await fetch(URL);
    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Keys available:", Object.keys(data));
    if (data.private_key) {
      console.log("Private key starts with:", data.private_key.substring(0, 30));
      console.log("Private key contains newlines:", data.private_key.includes('\n'));
      console.log("Private key contains escaped newlines (\\n):", data.private_key.includes('\\n'));
    } else {
      console.log("No private_key found in JSON");
    }
  } catch (error) {
    console.error("Error fetching:", error);
  }
}

testFetch();
