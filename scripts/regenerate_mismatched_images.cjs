#!/usr/bin/env node

const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// 51 mismatched recipes with rock-solid prompts
const RECIPES_TO_REGENERATE = [
  // CRITICAL - HANDS VISIBLE
  {
    name: 'cacio_e_pepe',
    prompt: 'Overhead food photography shot from directly above at 90-degree angle of Cacio e Pepe pasta, long strands of spaghetti evenly coated in creamy black pepper and pecorino romano cheese sauce with visible black pepper specks throughout, served in white ceramic bowl sitting on table surface, bowl is not being held, no hands visible anywhere in frame, no people, no chopsticks, no utensils being held, no body parts of any kind visible, food only, static product shot, 50mm lens, bright natural daylight, highly detailed, appetizing'
  },
  {
    name: 'minestrone_soup',
    prompt: 'Overhead food photography shot from directly above at 90-degree angle of Minestrone Soup, hearty Italian vegetable soup with visible white cannellini beans, diced tomatoes, small pasta shells, green zucchini, orange carrots, celery in rich red tomato broth, served in white ceramic bowl sitting on table surface, bowl is not being held, no hands visible anywhere in frame, no people, no body parts of any kind visible, food only, static product shot, garnished with fresh basil leaves and grated parmesan cheese on top, 50mm lens, bright natural daylight'
  },

  // CURRY DISHES
  {
    name: 'butter_chicken',
    prompt: 'Overhead food photography shot from directly above of Butter Chicken, boneless chicken pieces completely submerged in thick, rich, bright orange-red tomato-cream curry sauce, sauce should fully coat and cover the chicken with visible creamy gravy pooling around the meat, garnished with cream swirl and fresh cilantro leaves in white bowl, Indian curry dish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light, appetizing'
  },
  {
    name: 'chana_masala',
    prompt: 'Overhead food photography shot from directly above of Chana Masala, chickpeas fully submerged in thick spiced tomato-based curry sauce with visible red-orange gravy coating the chickpeas, chickpeas should be swimming in sauce not dry, garnished with diced white onions and fresh cilantro leaves in white bowl, Indian chickpea curry, no grilled meat, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'chicken_curry',
    prompt: 'Overhead food photography shot from directly above of Chicken Curry, chicken pieces completely covered in thick yellow-orange curry sauce with visible liquid gravy and spices, chicken should be submerged in curry sauce showing the rich gravy, garnished with fresh cilantro leaves in white bowl, Indian curry dish, no grilled or dry chicken, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light, appetizing curry'
  },
  {
    name: 'massaman_curry',
    prompt: 'Overhead food photography shot from directly above of Massaman Curry, tender chunks of beef or chicken completely submerged in rich, thick peanut-based curry sauce with visible chunks of potatoes, whole peanuts, and onions all swimming in brown curry gravy, Thai curry showing the liquid sauce coating all ingredients, garnished with cilantro in white bowl, no fish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'palak_paneer',
    prompt: 'Overhead food photography shot from directly above of Palak Paneer, white cubes of paneer cheese partially submerged in thick, bright vibrant green creamy spinach curry sauce, paneer should be sitting in pools of green gravy showing the spinach sauce, garnished with cream swirl on top in white bowl, Indian spinach curry dish, no fish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'rogan_josh',
    prompt: 'Overhead food photography shot from directly above of Rogan Josh, tender lamb or mutton pieces completely submerged in thick, rich deep red curry sauce with visible aromatic red-brown gravy coating the meat, Kashmiri curry showing the meat swimming in sauce, garnished with cilantro in white bowl, no fish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'vindaloo',
    prompt: 'Overhead food photography shot from directly above of Vindaloo, tender pork or lamb pieces and potato chunks completely submerged in thick, rich, deep red spicy curry sauce, meat and potatoes should be covered in dark red curry gravy showing the liquid sauce, garnished with cilantro in white bowl, spicy Goan curry, no fish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'dal_tadka',
    prompt: 'Overhead food photography shot from directly above of Dal Tadka, yellow split lentils cooked into thick creamy soup-like consistency with visible tadka tempering of ghee, cumin seeds, garlic, and curry leaves floating on top, served in white bowl, Indian lentil soup dish, no fish, no protein, only lentils, garnished with cilantro and red chili, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'vegetable_biryani',
    prompt: 'Overhead food photography shot from directly above of Vegetable Biryani, fragrant basmati rice layered and mixed throughout with colorful vegetables including orange carrots, green peas, white cauliflower florets, and green beans, vegetables should be distributed within the rice layers not just on top, saffron-colored golden rice grains visible, garnished with fried onions and cilantro in white bowl, Indian vegetable rice dish, no fish, no tofu, no meat, only rice and vegetables, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'chicken_biryani',
    prompt: 'Overhead food photography shot from directly above of Chicken Biryani, fragrant basmati rice layered and mixed with spiced chicken pieces distributed throughout the rice not just on top, saffron-colored golden rice grains with chicken pieces visible within the layers, visible spices and fried onions mixed throughout, garnished with fresh cilantro and mint leaves in white bowl, Indian chicken rice dish, chicken should be layered within the rice, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // FRIED RICE DISHES
  {
    name: 'chicken_fried_rice',
    prompt: 'Overhead food photography shot from directly above of Chicken Fried Rice, golden-brown rice grains wok-fried and thoroughly mixed with small diced chicken pieces, scrambled egg pieces, green peas, diced orange carrots all distributed evenly throughout the rice grains not placed on top, rice should have fried appearance with slightly golden color and all ingredients mixed together, garnished with sliced green onions in white bowl, Asian fried rice, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'fried_rice',
    prompt: 'Overhead food photography shot from directly above of Fried Rice, golden-brown rice grains wok-fried and thoroughly mixed with scrambled eggs, green peas, diced orange carrots, all ingredients distributed evenly throughout the rice not on top, rice should have fried appearance with slightly golden color, garnished with sliced green onions in white bowl, Asian fried rice, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'kimchi_fried_rice',
    prompt: 'Overhead food photography shot from directly above of Kimchi Fried Rice, rice grains wok-fried and thoroughly mixed with chopped kimchi throughout giving rice a slightly reddish-pink tint, with diced spam or pork and kimchi pieces all mixed evenly into the rice, topped with one fried egg sunny side up on top, garnished with sesame seeds and green onions in white bowl, Korean fried rice, kimchi should be mixed into the rice not on top except for the egg, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'thai_fried_rice',
    prompt: 'Overhead food photography shot from directly above of Thai Fried Rice, jasmine rice grains wok-fried with fish sauce giving golden color, thoroughly mixed with diced chicken or shrimp, scrambled eggs, tomato chunks, onions all distributed evenly throughout the rice, garnished with cucumber slices and lime wedge on the side, cilantro on top in white bowl, Thai fried rice, ingredients should be mixed into rice, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'vegetable_fried_rice',
    prompt: 'Overhead food photography shot from directly above of Vegetable Fried Rice, golden-brown rice grains wok-fried and thoroughly mixed with diced orange carrots, green peas, yellow corn, diced bell peppers, onions, all vegetables distributed evenly throughout the rice grains not on top, rice should have fried appearance with slightly golden color, garnished with sliced green onions in white bowl, vegetable fried rice with no meat or seafood, no scallops, no fish, only rice and vegetables, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // SALAD DISHES
  {
    name: 'caesar_salad',
    prompt: 'Overhead food photography shot from directly above of Caesar Salad, crisp romaine lettuce leaves tossed in creamy white Caesar dressing, topped with shaved parmesan cheese and golden brown crunchy croutons, no berries, no fruits of any kind, only lettuce, dressing, cheese and croutons, served in white bowl, classic Caesar salad, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'chicken_caesar_salad',
    prompt: 'Overhead food photography shot from directly above of Chicken Caesar Salad, crisp romaine lettuce leaves tossed in creamy white Caesar dressing with grilled sliced chicken breast pieces on top, shaved parmesan cheese, and golden brown crunchy croutons, no berries, no fruits of any kind, only lettuce, chicken, dressing, cheese and croutons, served in white bowl, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'caprese_salad',
    prompt: 'Overhead food photography shot from directly above of Caprese Salad, alternating slices of fresh white mozzarella cheese and ripe red tomatoes arranged in overlapping circular pattern or line, topped with fresh green basil leaves between slices, drizzled with olive oil and dark balsamic glaze, served on white plate, classic Italian salad presentation showing the alternating pattern, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'greek_salad',
    prompt: 'Overhead food photography shot from directly above of Greek Salad, chopped cucumbers, red tomatoes, purple red onions, black Kalamata olives, and white cubed feta cheese (not orange cheddar, must be white feta), dressed with olive oil and oregano, served in white bowl, Mediterranean salad, feta cheese should be white cubes, no cheddar cheese, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // PASTA & NOODLE DISHES
  {
    name: 'lasagna_bolognese',
    prompt: 'Overhead food photography shot from directly above of Lasagna Bolognese slice, layered baked pasta dish showing distinct visible horizontal layers of wide flat pasta sheets, meat bolognese sauce, white bechamel sauce, and melted golden cheese, served as a rectangular or square slice on white plate showing the cross-section layers clearly, Italian baked pasta, not spaghetti, should show layers, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'spaghetti_carbonara',
    prompt: 'Overhead food photography shot from directly above of Spaghetti Carbonara, long spaghetti strands fully coated in creamy egg and cheese sauce showing glossy creamy texture, with visible pancetta or bacon pieces, black pepper specks, and grated parmesan cheese, sauce should be creamy and coat the pasta completely, served in white bowl, Roman pasta dish, pasta should look creamy not dry, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'gnocchi_with_tomato_sauce',
    prompt: 'Overhead food photography shot from directly above of Gnocchi with Tomato Sauce, soft potato gnocchi dumplings completely covered in rich red marinara tomato sauce, gnocchi should be swimming in sauce not dry, topped with fresh green basil leaves and grated parmesan cheese, served in white bowl, Italian potato dumplings in tomato sauce showing the red sauce coating the gnocchi, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'risotto_alla_milanese',
    prompt: 'Overhead food photography shot from directly above of Risotto alla Milanese, creamy short-grain arborio rice cooked to risotto consistency with bright yellow-golden color from saffron threads, rice should be creamy and flowing with visible liquid not separated dry grains, topped with butter pat and grated parmesan cheese, served in white bowl, Italian saffron risotto, not noodles, must be rice with creamy texture, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'pad_thai',
    prompt: 'Overhead food photography shot from directly above of Pad Thai, flat rice noodles stir-fried with shrimp or chicken, bean sprouts, scrambled egg pieces, crushed peanuts all mixed together, noodles should have slightly orange-red color from tamarind sauce coating them, served in white bowl, garnished with lime wedge on side and cilantro on top, Thai stir-fried noodles showing the orange-red color, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'gimbap',
    prompt: 'Overhead food photography shot from directly above of Gimbap Korean seaweed rice rolls, rice and fillings rolled in dark seaweed and sliced into rounds showing cross-section circles, filled with bright yellow pickled radish, orange carrots, green spinach, white and yellow egg, and protein, rice should be seasoned with sesame oil not vinegar, looks denser and more colorful than Japanese sushi, served on white plate, Korean dish not Japanese sushi, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // SOUP & STEW
  {
    name: 'egg_drop_soup',
    prompt: 'Overhead food photography shot from directly above of Egg Drop Soup, clear golden chicken broth with wispy ribbons and strands of cooked egg floating throughout the soup, garnished with sliced green onions, no noodles, no pasta, soup should be mostly clear golden broth with delicate egg ribbons visible, served in white bowl, Chinese egg drop soup, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'ossobuco',
    prompt: 'Overhead food photography shot from directly above of Ossobuco, braised veal shank cross-cut showing the round bone with visible bone marrow hole in center, meat surrounding the bone, served in rich red tomato-based sauce with vegetables, garnished with gremolata herb mixture on top, served on white plate, Italian braised veal dish showing the cross-cut shank bone, no fish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // ASIAN RICE & NOODLE BOWLS
  {
    name: 'bibimbap',
    prompt: 'Overhead food photography shot from directly above of Bibimbap, Korean rice bowl with white rice at bottom visible in center, topped with colorful sections of sautéed vegetables arranged in wedges around the bowl including green spinach, yellow bean sprouts, orange carrots, brown mushrooms, sliced beef, and fried egg in center, red gochujang pepper paste dollop, ingredients arranged in organized sections in a circular pattern, served in white bowl, Korean rice dish not noodles, must show rice as base, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'poke_bowl',
    prompt: 'Overhead food photography shot from directly above of Poke Bowl, base of white or brown rice visible, topped with cubed raw salmon or tuna sashimi chunks showing bright orange or red color, green edamame beans, avocado slices, cucumber slices, seaweed salad, sesame seeds, all arranged in organized sections in the bowl, drizzled with soy sauce or poke sauce, Hawaiian raw fish rice bowl, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'onigiri_rice_balls',
    prompt: 'Overhead food photography shot from directly above of Onigiri Rice Balls, 2-3 triangle shaped Japanese rice balls with white rice visible on top and dark nori seaweed wrapped around the bottom portion, each rice ball should be triangular in shape, filled with salmon, tuna, or pickled plum, arranged on white plate, Japanese rice balls must be triangle shaped not round, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'tteokbokki_spicy_rice_cakes',
    prompt: 'Overhead food photography shot from directly above of Tteokbokki, Korean spicy rice cakes showing cylindrical white rice cake tubes in thick red-orange spicy gochujang sauce, rice cakes should be tube or cylinder shaped like small logs not round, with flat fish cakes and halved hard-boiled eggs, served in white bowl, Korean street food, rice cakes must be cylindrical tubes, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'mango_sticky_rice',
    prompt: 'Overhead food photography shot from directly above of Mango Sticky Rice, sweet coconut sticky rice (white or translucent sticky rice) served with sliced ripe yellow mango pieces arranged on the side, drizzled with white coconut cream sauce and sprinkled with sesame seeds, Thai dessert, rice should be white sticky rice not fried rice, no fish, no protein, this is a dessert dish, served on white plate, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // BREAD & APPETIZERS
  {
    name: 'bruschetta',
    prompt: 'Overhead food photography shot from directly above of Bruschetta, toasted golden-brown Italian bread slices topped with diced red tomatoes, fresh green basil leaves, minced garlic, and olive oil, tomato mixture should be clearly visible piled on top of bread, 3-4 pieces arranged on white plate, Italian appetizer showing the red tomato topping on toasted bread, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'focaccia',
    prompt: 'Overhead food photography shot from directly above of Focaccia bread, thick fluffy Italian flatbread with dimpled surface showing finger indentations, topped with olive oil pooling in the dimples, fresh rosemary sprigs, and sea salt crystals, bread should be thick and pillowy with visible dimples across the surface, golden brown color, served as square or rectangular pieces on white plate or wooden cutting board, Italian bread showing the characteristic dimpled texture, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'chips_and_salsa',
    prompt: 'Overhead food photography shot from directly above of Chips and Salsa, pile of crispy triangular tortilla chips arranged next to a small white bowl filled with red chunky salsa (tomato-based sauce with visible tomato chunks), both served together on white plate or wooden board, Mexican appetizer, tortilla chips should be triangular golden chips, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'guacamole',
    prompt: 'Overhead food photography shot from directly above of Guacamole, chunky bright green avocado dip showing texture with visible pieces of avocado, diced red tomatoes, white onions, and fresh cilantro mixed throughout, served in white bowl, garnished with cilantro leaves and lime wedge on the side, Mexican avocado dip showing green color and chunky texture, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // DESSERTS
  {
    name: 'tiramisu',
    prompt: 'Overhead food photography shot from directly above of Tiramisu slice, Italian layered dessert showing distinct horizontal layers of coffee-soaked ladyfinger biscuits and white mascarpone cream, topped with dusted dark brown cocoa powder on top layer, served as rectangular slice on white plate showing the cream and biscuit layers in cross-section, no strawberries, no nuts, no berries, only coffee, cream, biscuits and cocoa powder, Italian coffee dessert, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'panna_cotta',
    prompt: 'Overhead food photography shot from directly above of Panna Cotta, smooth white Italian cream dessert molded in dome or cup shape showing creamy smooth surface, topped with red berry coulis or caramel sauce drizzled on top and pooling around base, served on white plate, Italian cream dessert should be smooth and jiggly with glossy surface, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'bingsu_shaved_ice',
    prompt: 'Overhead food photography shot from directly above of Bingsu Korean Shaved Ice, mountain pile of very fine fluffy shaved ice that looks like snow powder, topped with sweet red beans, drizzled condensed milk, fresh fruit pieces, and small rice cake pieces, ice should be very finely shaved with fluffy snow-like texture piled high, served in large white bowl, Korean dessert, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'chia_pudding',
    prompt: 'Overhead food photography shot from directly above of Chia Pudding, creamy pudding showing smooth texture with thousands of tiny black chia seeds clearly visible throughout the pudding, topped with fresh berries, sliced nuts, and coconut flakes, served in white bowl or glass, healthy breakfast pudding, chia seeds should be clearly visible as small black specks distributed throughout, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'overnight_oats',
    prompt: 'Overhead food photography shot from directly above of Overnight Oats, creamy oatmeal mixture with visible oat grains soaked and softened, topped with fresh berries, sliced banana, nuts, and honey drizzle, served in glass jar or white bowl, healthy breakfast, oats should be soaked and creamy not dry, showing the texture of soaked oats with toppings arranged on top, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'greek_yogurt_parfait',
    prompt: 'Overhead food photography shot from directly above of Greek Yogurt Parfait, served in clear glass showing visible alternating horizontal layers of white Greek yogurt, brown granola, and colorful fresh berries, layers should be clearly visible through the glass, topped with honey drizzle and mint leaf, healthy breakfast parfait, must show the distinct layers, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },

  // SPECIALTY DISHES
  {
    name: 'chilaquiles_rojos',
    prompt: 'Overhead food photography shot from directly above of Chilaquiles Rojos, fried tortilla chips simmered in red salsa sauce until slightly softened and coated in sauce, topped with fried eggs, Mexican crema drizzle, crumbled queso fresco cheese, and cilantro, chips should be coated in red sauce not dry, served on white plate, Mexican breakfast dish showing chips in red sauce, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'chicken_parmigiana',
    prompt: 'Overhead food photography shot from directly above of Chicken Parmigiana, breaded chicken cutlet completely topped with melted white mozzarella cheese and red marinara tomato sauce covering the top, served with spaghetti noodles on the side, chicken should be covered in sauce and melted cheese not dry, Italian-American dish, served on white plate, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'stir_fry_vegetables',
    prompt: 'Overhead food photography shot from directly above of Vegetable Stir Fry, colorful mixed vegetables including green broccoli florets, red and yellow bell pepper strips, orange carrot slices, green snap peas, yellow baby corn all stir-fried in glossy sauce, no fish, no tofu, no meat, only vegetables, served in white bowl, garnished with sesame seeds on top, Asian vegetable stir fry, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'sweet_and_sour_pork',
    prompt: 'Overhead food photography shot from directly above of Sweet and Sour Pork, battered and deep-fried pork pieces showing crispy coating, completely covered in thick bright orange-red glossy sweet and sour sauce with chunks of yellow pineapple, red and green bell peppers, and white onions, pork should be in crispy golden batter coated in glossy thick sauce, served in white bowl over white rice, Chinese takeout style dish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'thai_basil_chicken',
    prompt: 'Overhead food photography shot from directly above of Thai Basil Chicken Pad Krapow Gai, stir-fried ground minced chicken with fresh Thai holy basil leaves, red chilies, garlic, and green beans in savory brown sauce, served over white rice with crispy fried egg sunny side up on top, Thai stir fry dish, no fish, no fish cakes, chicken should be ground or minced texture, garnished with basil leaves in white bowl, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'smoothie_bowl',
    prompt: 'Overhead food photography shot from directly above of Smoothie Bowl, thick purple or pink smoothie base made from blended berries and banana filling the bowl, topped in organized sections with fresh fruit slices including banana rounds, strawberries, blueberries, kiwi slices, granola, coconut flakes, chia seeds, and honey drizzle, no eggs of any kind, no hard-boiled eggs, breakfast bowl with colorful fruit toppings arranged artistically, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  },
  {
    name: 'vegetable_stir_fry',
    prompt: 'Overhead food photography shot from directly above of Vegetable Stir Fry, mixed colorful vegetables including green broccoli, orange carrots, red bell peppers, white mushrooms, green snap peas all stir-fried in savory sauce and glistening with oil, no tofu, no tofu sticks, no protein, only vegetables as the main and only ingredient, served in white bowl, garnished with sesame seeds and sliced green onions on top, Asian vegetable dish, no hands anywhere in frame, no people, no body parts visible, food only, 50mm lens, bright natural light'
  }
];

const OUTPUT_DIR = path.join(__dirname, 'recipe_images');

async function generateImage(recipeName, prompt) {
  try {
    console.log(`\n🎨 Generating: ${recipeName}`);
    console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);

    const output = await replicate.run(
      "black-forest-labs/flux-1.1-pro",
      {
        input: {
          prompt: prompt,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: false
        }
      }
    );

    // Download the image
    const imageUrl = output;
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();

    // Find existing file to get UUID
    const existingFiles = fs.readdirSync(OUTPUT_DIR);
    const existingFile = existingFiles.find(f => f.startsWith(recipeName + '_'));

    let filename;
    if (existingFile) {
      // Reuse existing filename (overwrites old image)
      filename = existingFile;
      console.log(`♻️  Overwriting existing: ${filename}`);
    } else {
      // Generate new UUID
      const { v4: uuidv4 } = require('uuid');
      const uuid = uuidv4();
      filename = `${recipeName}_${uuid}.webp`;
      console.log(`✨ Creating new: ${filename}`);
    }

    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));

    const stats = fs.statSync(filepath);
    console.log(`✅ Saved: ${filename} (${(stats.size / 1024).toFixed(1)}KB)`);

    return { success: true, filename };
  } catch (error) {
    console.error(`❌ Error generating ${recipeName}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 REGENERATING 51 MISMATCHED RECIPE IMAGES');
  console.log('==========================================\n');
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`📊 Total to regenerate: ${RECIPES_TO_REGENERATE.length}`);
  console.log(`💰 Estimated cost: $${(RECIPES_TO_REGENERATE.length * 0.04).toFixed(2)}\n`);

  const results = {
    successful: [],
    failed: []
  };

  for (let i = 0; i < RECIPES_TO_REGENERATE.length; i++) {
    const recipe = RECIPES_TO_REGENERATE[i];
    console.log(`\n[${i + 1}/${RECIPES_TO_REGENERATE.length}]`);

    const result = await generateImage(recipe.name, recipe.prompt);

    if (result.success) {
      results.successful.push(recipe.name);
    } else {
      results.failed.push({ name: recipe.name, error: result.error });
    }

    // Small delay to avoid rate limits
    if (i < RECIPES_TO_REGENERATE.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n\n📊 REGENERATION COMPLETE');
  console.log('=======================');
  console.log(`✅ Successful: ${results.successful.length}/${RECIPES_TO_REGENERATE.length}`);
  console.log(`❌ Failed: ${results.failed.length}/${RECIPES_TO_REGENERATE.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed images:');
    results.failed.forEach(f => {
      console.log(`   - ${f.name}: ${f.error}`);
    });
  }

  console.log(`\n💰 Actual cost: $${(results.successful.length * 0.04).toFixed(2)}`);
}

main().catch(console.error);
