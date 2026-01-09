const https = require('https');

const videoId = 'eekXLQTqd10';
const apiKey = 'AIzaSyC3l8nZK2OXONHU1P2aEsEdpu-Jr_vdHsE';
const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=10&order=relevance&key=${apiKey}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log(`Total comments fetched: ${json.items.length}\n`);

    json.items.slice(0, 5).forEach((item, i) => {
      const comment = item.snippet.topLevelComment.snippet;
      const text = comment.textDisplay.replace(/<[^>]*>/g, '').substring(0, 120);
      console.log(`${i}: "${text}..." (${comment.textDisplay.length} chars, ${comment.likeCount} likes)`);
      console.log('');
    });
  });
});
