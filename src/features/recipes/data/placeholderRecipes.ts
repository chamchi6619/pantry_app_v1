export interface PlaceholderRecipe {
  id: string;
  name: string;
  imageUrl: string;
  creator: string;
  cookTime: string;
  difficulty: string;
  category: string;
  matchPercentage?: number;
}

const recipeImages = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=500',
  'https://images.unsplash.com/photo-1607532941433-304659e8198a?w=500',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
  'https://images.unsplash.com/photo-1547592034-2b47298a6b90?w=500',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',
  'https://images.unsplash.com/photo-1546039907-7fa05f864c02?w=500',
  'https://images.unsplash.com/photo-1609501676725-7186f017a4b7?w=500',
];

export const placeholderRecipes: { [key: string]: PlaceholderRecipe[] } = {
  'Popular': [
    { id: 'pop-1', name: 'Creamy Tuscan Chicken', imageUrl: recipeImages[0], creator: 'Chef Maria', cookTime: '30 min', difficulty: 'Easy', category: 'Popular' },
    { id: 'pop-2', name: 'Korean BBQ Bowl', imageUrl: recipeImages[1], creator: 'Chef Jin', cookTime: '25 min', difficulty: 'Medium', category: 'Popular' },
    { id: 'pop-3', name: 'Mediterranean Pasta', imageUrl: recipeImages[2], creator: 'Chef Antonio', cookTime: '20 min', difficulty: 'Easy', category: 'Popular' },
    { id: 'pop-4', name: 'Thai Green Curry', imageUrl: recipeImages[3], creator: 'Chef Malee', cookTime: '35 min', difficulty: 'Medium', category: 'Popular' },
    { id: 'pop-5', name: 'Classic Beef Tacos', imageUrl: recipeImages[4], creator: 'Chef Carlos', cookTime: '25 min', difficulty: 'Easy', category: 'Popular' },
    { id: 'pop-6', name: 'Salmon Teriyaki', imageUrl: recipeImages[5], creator: 'Chef Yuki', cookTime: '20 min', difficulty: 'Easy', category: 'Popular' },
  ],

  'Quick & Easy': [
    { id: 'qe-1', name: '15-Minute Stir Fry', imageUrl: recipeImages[6], creator: 'Chef Lin', cookTime: '15 min', difficulty: 'Easy', category: 'Quick & Easy' },
    { id: 'qe-2', name: 'Avocado Toast Deluxe', imageUrl: recipeImages[7], creator: 'Chef Emma', cookTime: '10 min', difficulty: 'Easy', category: 'Quick & Easy' },
    { id: 'qe-3', name: 'Quick Chicken Wrap', imageUrl: recipeImages[8], creator: 'Chef Mike', cookTime: '12 min', difficulty: 'Easy', category: 'Quick & Easy' },
    { id: 'qe-4', name: 'Simple Omelette', imageUrl: recipeImages[9], creator: 'Chef Pierre', cookTime: '8 min', difficulty: 'Easy', category: 'Quick & Easy' },
    { id: 'qe-5', name: 'Greek Salad Bowl', imageUrl: recipeImages[0], creator: 'Chef Sophia', cookTime: '10 min', difficulty: 'Easy', category: 'Quick & Easy' },
    { id: 'qe-6', name: 'Instant Ramen Upgrade', imageUrl: recipeImages[1], creator: 'Chef Kenji', cookTime: '10 min', difficulty: 'Easy', category: 'Quick & Easy' },
  ],

  'Healthy': [
    { id: 'h-1', name: 'Quinoa Buddha Bowl', imageUrl: recipeImages[2], creator: 'Chef Luna', cookTime: '25 min', difficulty: 'Easy', category: 'Healthy' },
    { id: 'h-2', name: 'Grilled Veggie Stack', imageUrl: recipeImages[3], creator: 'Chef Oliver', cookTime: '20 min', difficulty: 'Medium', category: 'Healthy' },
    { id: 'h-3', name: 'Kale Caesar Salad', imageUrl: recipeImages[4], creator: 'Chef Rachel', cookTime: '15 min', difficulty: 'Easy', category: 'Healthy' },
    { id: 'h-4', name: 'Acai Smoothie Bowl', imageUrl: recipeImages[5], creator: 'Chef Maya', cookTime: '10 min', difficulty: 'Easy', category: 'Healthy' },
    { id: 'h-5', name: 'Zucchini Noodles', imageUrl: recipeImages[6], creator: 'Chef Tom', cookTime: '15 min', difficulty: 'Easy', category: 'Healthy' },
    { id: 'h-6', name: 'Protein Power Bowl', imageUrl: recipeImages[7], creator: 'Chef Alex', cookTime: '20 min', difficulty: 'Medium', category: 'Healthy' },
  ],

  'Vegetarian': [
    { id: 'v-1', name: 'Mushroom Risotto', imageUrl: recipeImages[8], creator: 'Chef Giovanni', cookTime: '40 min', difficulty: 'Medium', category: 'Vegetarian' },
    { id: 'v-2', name: 'Veggie Burger', imageUrl: recipeImages[9], creator: 'Chef Sam', cookTime: '25 min', difficulty: 'Medium', category: 'Vegetarian' },
    { id: 'v-3', name: 'Caprese Sandwich', imageUrl: recipeImages[0], creator: 'Chef Isabella', cookTime: '10 min', difficulty: 'Easy', category: 'Vegetarian' },
    { id: 'v-4', name: 'Spinach Lasagna', imageUrl: recipeImages[1], creator: 'Chef Marco', cookTime: '45 min', difficulty: 'Medium', category: 'Vegetarian' },
    { id: 'v-5', name: 'Falafel Wrap', imageUrl: recipeImages[2], creator: 'Chef Amir', cookTime: '30 min', difficulty: 'Medium', category: 'Vegetarian' },
    { id: 'v-6', name: 'Vegetable Curry', imageUrl: recipeImages[3], creator: 'Chef Priya', cookTime: '35 min', difficulty: 'Easy', category: 'Vegetarian' },
  ],

  'Comfort Food': [
    { id: 'cf-1', name: 'Mac and Cheese', imageUrl: recipeImages[4], creator: 'Chef Betty', cookTime: '30 min', difficulty: 'Easy', category: 'Comfort Food' },
    { id: 'cf-2', name: 'Chicken Pot Pie', imageUrl: recipeImages[5], creator: 'Chef Martha', cookTime: '45 min', difficulty: 'Medium', category: 'Comfort Food' },
    { id: 'cf-3', name: 'Loaded Potato Soup', imageUrl: recipeImages[6], creator: 'Chef Bob', cookTime: '40 min', difficulty: 'Easy', category: 'Comfort Food' },
    { id: 'cf-4', name: 'Meatball Sub', imageUrl: recipeImages[7], creator: 'Chef Tony', cookTime: '35 min', difficulty: 'Medium', category: 'Comfort Food' },
    { id: 'cf-5', name: 'Shepherd\'s Pie', imageUrl: recipeImages[8], creator: 'Chef James', cookTime: '50 min', difficulty: 'Medium', category: 'Comfort Food' },
    { id: 'cf-6', name: 'Grilled Cheese Supreme', imageUrl: recipeImages[9], creator: 'Chef Lisa', cookTime: '15 min', difficulty: 'Easy', category: 'Comfort Food' },
  ],

  'Desserts': [
    { id: 'd-1', name: 'Chocolate Lava Cake', imageUrl: recipeImages[0], creator: 'Chef Sophie', cookTime: '20 min', difficulty: 'Medium', category: 'Desserts' },
    { id: 'd-2', name: 'Tiramisu', imageUrl: recipeImages[1], creator: 'Chef Luigi', cookTime: '30 min', difficulty: 'Medium', category: 'Desserts' },
    { id: 'd-3', name: 'Berry Cheesecake', imageUrl: recipeImages[2], creator: 'Chef Anna', cookTime: '45 min', difficulty: 'Hard', category: 'Desserts' },
    { id: 'd-4', name: 'Apple Crumble', imageUrl: recipeImages[3], creator: 'Chef Sarah', cookTime: '35 min', difficulty: 'Easy', category: 'Desserts' },
    { id: 'd-5', name: 'Crème Brûlée', imageUrl: recipeImages[4], creator: 'Chef François', cookTime: '40 min', difficulty: 'Hard', category: 'Desserts' },
    { id: 'd-6', name: 'Chocolate Brownies', imageUrl: recipeImages[5], creator: 'Chef Michelle', cookTime: '25 min', difficulty: 'Easy', category: 'Desserts' },
  ],

  'Breakfast': [
    { id: 'b-1', name: 'Fluffy Pancakes', imageUrl: recipeImages[6], creator: 'Chef Amy', cookTime: '20 min', difficulty: 'Easy', category: 'Breakfast' },
    { id: 'b-2', name: 'Eggs Benedict', imageUrl: recipeImages[7], creator: 'Chef David', cookTime: '25 min', difficulty: 'Medium', category: 'Breakfast' },
    { id: 'b-3', name: 'French Toast', imageUrl: recipeImages[8], creator: 'Chef Marie', cookTime: '15 min', difficulty: 'Easy', category: 'Breakfast' },
    { id: 'b-4', name: 'Breakfast Burrito', imageUrl: recipeImages[9], creator: 'Chef Miguel', cookTime: '20 min', difficulty: 'Easy', category: 'Breakfast' },
    { id: 'b-5', name: 'Açai Bowl', imageUrl: recipeImages[0], creator: 'Chef Nina', cookTime: '10 min', difficulty: 'Easy', category: 'Breakfast' },
    { id: 'b-6', name: 'Belgian Waffles', imageUrl: recipeImages[1], creator: 'Chef Philippe', cookTime: '25 min', difficulty: 'Medium', category: 'Breakfast' },
  ],

  // Pantry Mode Categories
  'Use Soon': [
    { id: 'us-1', name: 'Expiring Veggie Stir-fry', imageUrl: recipeImages[2], creator: 'Chef Wei', cookTime: '15 min', difficulty: 'Easy', category: 'Use Soon', matchPercentage: 85 },
    { id: 'us-2', name: 'Last-Minute Salad', imageUrl: recipeImages[3], creator: 'Chef Grace', cookTime: '10 min', difficulty: 'Easy', category: 'Use Soon', matchPercentage: 90 },
    { id: 'us-3', name: 'Quick Pickle Jar', imageUrl: recipeImages[4], creator: 'Chef Kim', cookTime: '20 min', difficulty: 'Easy', category: 'Use Soon', matchPercentage: 75 },
    { id: 'us-4', name: 'Leftover Fried Rice', imageUrl: recipeImages[5], creator: 'Chef Chen', cookTime: '15 min', difficulty: 'Easy', category: 'Use Soon', matchPercentage: 80 },
  ],

  'High Match': [
    { id: 'hm-1', name: 'Perfect Pantry Pasta', imageUrl: recipeImages[6], creator: 'Chef Roberto', cookTime: '20 min', difficulty: 'Easy', category: 'High Match', matchPercentage: 95 },
    { id: 'hm-2', name: 'Everything Soup', imageUrl: recipeImages[7], creator: 'Chef Linda', cookTime: '30 min', difficulty: 'Easy', category: 'High Match', matchPercentage: 92 },
    { id: 'hm-3', name: 'Mix & Match Sandwich', imageUrl: recipeImages[8], creator: 'Chef Joe', cookTime: '10 min', difficulty: 'Easy', category: 'High Match', matchPercentage: 88 },
    { id: 'hm-4', name: 'Pantry Pizza', imageUrl: recipeImages[9], creator: 'Chef Gino', cookTime: '25 min', difficulty: 'Medium', category: 'High Match', matchPercentage: 85 },
  ],
};