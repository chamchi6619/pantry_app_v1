// Unicode food emojis - free for commercial use
export const foodEmojis = {
  fruits: [
    '🍎', '🍏', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓',
    '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
    '🍅', '🍆', '🥑', '🫒', '🍐', '🫘'
  ],
  vegetables: [
    '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒',
    '🧄', '🧅', '🫚', '🥔', '🍠', '🫛', '🥜', '🌰',
    '🍄', '🥗', '🫙'
  ],
  proteins: [
    '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪',
    '🥙', '🧆', '🌮', '🌯', '🫔', '🥚', '🍳', '🥓',
    '🍤', '🦪', '🦞', '🦀', '🦐', '🦑', '🐙', '🐟',
    '🐠', '🐡', '🍱', '🍣', '🍜'
  ],
  dairy: [
    '🥛', '🧈', '🧀', '🍦', '🍨', '🍧', '🥧', '🍰',
    '🎂', '🍮', '🍭', '🍬', '🍫', '🍩', '🍪', '🧁',
    '🥤', '🧃', '🧋'
  ],
  grains: [
    '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇',
    '🍠', '🍝', '🍜', '🍲', '🍛', '🍚', '🍙', '🍘',
    '🍥', '🥮', '🍢', '🍡', '🍧', '🍨'
  ],
  beverages: [
    '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍾', '🍷',
    '🍸', '🍹', '🧉', '🍺', '🍻', '🥂', '🥃', '🫗',
    '🧊', '🥛', '🫖', '🍼'
  ],
  snacks: [
    '🍿', '🧂', '🥫', '🍯', '🍪', '🧁', '🥧', '🍰',
    '🎂', '🍮', '🍭', '🍬', '🍫', '🍩', '🍨', '🍦',
    '🧊', '🥜', '🌰', '🫘', '🍘', '🍙', '🍚', '🍱'
  ],
  condiments: [
    '🧈', '🍯', '🧂', '🫙', '🥫', '🍶', '🫗', '🌶️',
    '🧄', '🧅', '🫚', '🍋', '🫒'
  ],
  prepared: [
    '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔',
    '🥙', '🧆', '🍝', '🍜', '🍲', '🍛', '🍱', '🍣',
    '🍤', '🍙', '🍚', '🍘', '🍥', '🥮', '🍢', '🍡',
    '🥟', '🥠', '🥡', '🦪', '🍽️', '🍴'
  ],
  other: [
    '🍽️', '🍴', '🥄', '🔪', '🫕', '🍳', '🥘', '🍿',
    '🧊', '🥢', '🍾', '🏺', '🫙', '🥫', '📦', '🛒'
  ]
};

export const getAllFoodEmojis = (): string[] => {
  return Object.values(foodEmojis).flat();
};

export const getFoodEmojisByCategory = (category: string): string[] => {
  const categoryMap: Record<string, string[]> = {
    'Fruits': foodEmojis.fruits,
    'Vegetables': foodEmojis.vegetables,
    'Proteins': foodEmojis.proteins,
    'Dairy': foodEmojis.dairy,
    'Grains': foodEmojis.grains,
    'Beverages': foodEmojis.beverages,
    'Snacks': foodEmojis.snacks,
    'Frozen': [...foodEmojis.snacks, '🧊', '🍦', '🍨'],
    'Pantry': [...foodEmojis.grains, ...foodEmojis.condiments],
    'Bakery': foodEmojis.grains.slice(0, 8),
    'Meat': foodEmojis.proteins.slice(0, 8),
    'Other': foodEmojis.other,
  };

  return categoryMap[category] || foodEmojis.other;
};

export const defaultFoodEmoji = '🍽️';