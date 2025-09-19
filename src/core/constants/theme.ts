export const theme = {
  colors: {
    // Primary
    primary: '#00C853',
    primaryLight: '#5EFC82',
    primaryDark: '#00962D',

    // Storage locations
    fridge: '#3B82F6',
    fridgeLight: '#60A5FA',
    fridgeDark: '#2563EB',

    freezer: '#06B6D4',
    freezerLight: '#22D3EE',
    freezerDark: '#0891B2',

    pantry: '#F59E0B',
    pantryLight: '#FCD34D',
    pantryDark: '#D97706',

    // Status colors
    expiringSoon: '#EF4444',
    expired: '#991B1B',
    fresh: '#10B981',
    warning: '#F59E0B',

    // UI colors
    background: '#FFFFFF',
    surface: '#F9FAFB',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',

    // Text colors
    text: '#111827',
    textSecondary: '#6B7280',
    textLight: '#9CA3AF',
    textInverse: '#FFFFFF',

    // Semantic colors
    success: '#10B981',
    error: '#EF4444',
    info: '#3B82F6',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  typography: {
    h1: {
      fontSize: 28,
      fontWeight: '700' as '700',
      lineHeight: 36,
    },
    h2: {
      fontSize: 24,
      fontWeight: '600' as '600',
      lineHeight: 32,
    },
    h3: {
      fontSize: 20,
      fontWeight: '600' as '600',
      lineHeight: 28,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as '400',
      lineHeight: 24,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: '400' as '400',
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as '400',
      lineHeight: 16,
    },
    button: {
      fontSize: 16,
      fontWeight: '600' as '600',
      lineHeight: 24,
    },
  },

  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
    },
  },
} as const;

export type Theme = typeof theme;