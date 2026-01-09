/**
 * Download test images before they expire (1 hour TTL)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const resultsFile = path.join(__dirname, 'flux_prompt_comparison.json');
const outputDir = path.join(__dirname, 'flux_test_images');

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

async function downloadAll() {
  console.log('📥 Downloading Flux test images...\n');

  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

  let downloaded = 0;
  let failed = 0;

  for (const result of results) {
    const recipeName = result.recipe.toLowerCase().replace(/\s+/g, '_');

    // Download simple version
    if (result.simple.success) {
      const filename = `${recipeName}_simple.webp`;
      const filepath = path.join(outputDir, filename);

      try {
        console.log(`Downloading: ${filename}`);
        await downloadImage(result.simple.url, filepath);
        console.log(`  ✅ Saved to ${filepath}`);
        downloaded++;
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        failed++;
      }
    }

    // Download detailed version
    if (result.detailed.success) {
      const filename = `${recipeName}_detailed.webp`;
      const filepath = path.join(outputDir, filename);

      try {
        console.log(`Downloading: ${filename}`);
        await downloadImage(result.detailed.url, filepath);
        console.log(`  ✅ Saved to ${filepath}`);
        downloaded++;
      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`\n✨ Download complete!`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n📁 Images saved to: ${outputDir}`);
}

downloadAll().catch(console.error);
