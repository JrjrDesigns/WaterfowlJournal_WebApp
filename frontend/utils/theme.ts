// Waterfowl Hunting Journal Theme
// Rustic parchment paper aesthetic with dark text

export const colors = {
  // Backgrounds - Parchment paper
  background: '#F4EFE0',
  cardBackground: '#FAF6ED',
  white: '#FFFEF9',
  
  // Text - Dark brown/olive
  textPrimary: '#3E3021',
  textSecondary: '#5C5142',
  textTertiary: '#7A6F5D',
  
  // Accent colors - Hunter green for actions
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  primaryLight: '#4CAF50',
  
  // Status colors
  success: '#388E3C',
  warning: '#A67C52',
  error: '#8B4513',
  
  // Borders and dividers - Tan/brown
  border: '#D4C9B3',
  divider: '#E5DCCC',
  
  // Special
  shadow: '#3E3021',
  overlay: 'rgba(62, 48, 33, 0.1)',
};

export const typography = {
  // Font families - Will update once user provides Mike Mike font
  fontFamilyRegular: Platform.OS === 'ios' ? 'American Typewriter' : 'serif',
  fontFamilyMedium: Platform.OS === 'ios' ? 'AmericanTypewriter-Semibold' : 'serif',
  fontFamilyBold: Platform.OS === 'ios' ? 'AmericanTypewriter-Bold' : 'serif',
  fontFamilyMono: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  
  // Font sizes
  h1: 32,
  h2: 28,
  h3: 24,
  h4: 20,
  body: 16,
  bodySmall: 14,
  caption: 12,
  button: 18,
};

import { Platform } from 'react-native';
