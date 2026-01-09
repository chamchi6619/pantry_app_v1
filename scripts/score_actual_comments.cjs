const https = require('https');

const videoId = 'eekXLQTqd10';
const apiKey = 'AIzaSyC3l8nZK2OXONHU1P2aEsEdpu-Jr_vdHsE';
const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=5&order=relevance&textFormat=plainText&key=${apiKey}`;

// Scoring function (from commentScoring.ts lines 39-98)
function scoreCommentForIngredients(comment) {
  const text = comment.text;
  let score = 0;

  // Signal 1: Keywords (10 pts each)
  if (/ingredient/i.test(text)) score += 10;
  if (/recipe/i.test(text)) score += 10;

  // Signal 2: Bullets (5 pts each, max 25)
  const bulletMatches = text.match(/[▢▣□☐•●○◦⦿⦾\-\*]/g) || [];
  score += Math.min(bulletMatches.length, 5) * 5;

  // Signal 3: Quantities (3 pts each, max 30)
  const quantityMatches = text.match(/\d+\s*(cup|cups|tbsp|tbs|tsp|lb|lbs|oz|g|kg|ml|l|clove|cloves)/gi) || [];
  score += Math.min(quantityMatches.length, 10) * 3;

  // Signal 4: Fractions (3 pts each, max 15)
  const fractionMatches = text.match(/[½¼¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g) || [];
  score += Math.min(fractionMatches.length, 5) * 3;

  // Signal 5: Lines with numbers (15 pts bonus if >= 5 lines)
  const linesWithNumbers = text.split('\n').filter(line => /\d/.test(line)).length;
  if (linesWithNumbers >= 5) score += 15;

  // Signal 6: Length bonus (max 10 pts for 500+ chars)
  if (text.length >= 500) score += 10;
  else if (text.length >= 300) score += 5;

  return { totalScore: score };
}

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);

    console.log('\n=== SCORING ALL COMMENTS ===\n');

    json.items.forEach((item, i) => {
      const commentText = item.snippet.topLevelComment.snippet.textDisplay;
      const likeCount = item.snippet.topLevelComment.snippet.likeCount;

      const score = scoreCommentForIngredients({ text: commentText });

      console.log(`Comment ${i}:`);
      console.log(`  Score: ${score.totalScore} points`);
      console.log(`  Likes: ${likeCount}`);
      console.log(`  Length: ${commentText.length} chars`);
      console.log(`  Preview: "${commentText.substring(0, 80)}..."`);
      console.log('');
    });
  });
});
