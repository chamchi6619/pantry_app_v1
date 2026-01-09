#!/usr/bin/env node

const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Ultra-specific prompt for egg drop soup - POSITIVE DESCRIPTION APPROACH (attempt 3)
const EGG_DROP_SOUP_PROMPT = `Overhead food photography of Chinese Egg Flower Soup (蛋花汤), clear translucent golden chicken broth with wispy thread-like strands of cooked beaten egg creating delicate yellow ribbons that look like flower petals floating in the liquid, the egg creates thin feathery wisps NOT thick pieces, garnished with bright green scallion slices, served in white bowl on table, this is egg drop soup which has thin egg threads in clear broth unlike noodle soups which have pasta, the texture is silky egg ribbons swirling in transparent broth, overhead 90-degree angle, bowl sitting on surface not held, no hands, no people, no utensils being held, food photography, 50mm lens, natural light, appetizing`;

const EXISTING_UUID = 'fc2690b2-8c71-489c-8ba9-b05210f991f4';

async function downloadImage(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
}

async function regenerateEggDropSoup() {
  console.log('Re-regenerating egg_drop_soup with ultra-specific prompt...\n');
  console.log('Prompt:', EGG_DROP_SOUP_PROMPT);
  console.log('\nGenerating image...');

  try {
    const output = await replicate.run(
      "black-forest-labs/flux-1.1-pro",
      {
        input: {
          prompt: EGG_DROP_SOUP_PROMPT,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: false
        }
      }
    );

    const imageUrl = output;
    const filename = `egg_drop_soup_${EXISTING_UUID}.webp`;
    const filepath = path.join(__dirname, 'recipe_images', filename);

    console.log('Downloading image...');
    await downloadImage(imageUrl, filepath);

    const stats = fs.statSync(filepath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);

    console.log(`✅ Successfully regenerated: ${filename} (${fileSizeKB} KB)`);
    console.log(`\nCost: $0.04`);

  } catch (error) {
    console.error('❌ Error regenerating egg_drop_soup:', error);
    throw error;
  }
}

regenerateEggDropSoup().catch(console.error);
