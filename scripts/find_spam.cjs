const https = require('https');

const videoId = 'eekXLQTqd10';
const apiKey = 'AIzaSyC3l8nZK2OXONHU1P2aEsEdpu-Jr_vdHsE';
const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=1&order=relevance&textFormat=plainText&key=${apiKey}`;

const spamPatterns = [
  /subscribe/i,
  /follow me/i,
  /link in bio/i,
  /check out/i,
  /click here/i,
  /buy now/i,
];

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const text = json.items[0].snippet.topLevelComment.snippet.textDisplay;

    console.log('Full comment text:');
    console.log(text);
    console.log('\n\n=== SPAM PATTERN MATCHES ===');

    spamPatterns.forEach((pattern, i) => {
      const matches = pattern.test(text);
      if (matches) {
        console.log(`✅ MATCH: ${pattern}`);
        const match = text.match(pattern);
        console.log(`   Found at: "${text.substring(match.index - 20, match.index + 50)}"`);
      } else {
        console.log(`   ${pattern}: no match`);
      }
    });
  });
});
