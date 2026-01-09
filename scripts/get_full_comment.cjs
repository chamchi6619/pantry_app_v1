const https = require('https');

const videoId = 'eekXLQTqd10';
const apiKey = 'AIzaSyC3l8nZK2OXONHU1P2aEsEdpu-Jr_vdHsE';
const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=2&order=relevance&textFormat=plainText&key=${apiKey}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);

    json.items.forEach((item, i) => {
      const comment = item.snippet.topLevelComment.snippet;
      console.log(`\n=== COMMENT ${i} ===`);
      console.log(`Length: ${comment.textDisplay.length} chars`);
      console.log(`Likes: ${comment.likeCount}`);
      console.log(`First 200 chars: "${comment.textDisplay.substring(0, 200)}"`);
      console.log(`\nContains 'Ingredients:': ${comment.textDisplay.includes('Ingredients:')}`);
      console.log(`Contains 'Pancetta': ${comment.textDisplay.includes('Pancetta')}`);
      console.log(`Contains 'Ground beef': ${comment.textDisplay.includes('Ground beef')}`);
    });
  });
});
