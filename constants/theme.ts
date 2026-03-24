/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 */

import { Platform } from 'react-native';

const tintColorLight = '#7A55B0';
const tintColorDark = '#7A55B0';

export const Colors = {
  light: {
    text: '#2D2250',
    background: '#F0ECFF',
    tint: tintColorLight,
    icon: '#6B5B8A',
    tabIconDefault: '#A899C8',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    clayPurple: '#C9B8FF',
    clayPink: '#FFB8D9',
    clayOrange: '#FFCF86',
    clayGreen: '#B8F0D0',
    clayBlue: '#B8E0FF',
    clayRed: '#FFB8B8',
    clayYellow: '#FFF3B8',
    textLight: '#A899C8',
  },
  dark: {
    text: '#2D2250',
    background: '#F0ECFF',
    tint: tintColorDark,
    icon: '#6B5B8A',
    tabIconDefault: '#A899C8',
    tabIconSelected: tintColorDark,
    card: '#FFFFFF',
    clayPurple: '#C9B8FF',
    clayPink: '#FFB8D9',
    clayOrange: '#FFCF86',
    clayGreen: '#B8F0D0',
    clayBlue: '#B8E0FF',
    clayRed: '#FFB8B8',
    clayYellow: '#FFF3B8',
    textLight: '#A899C8',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'Nunito',
    serif: 'Georgia',
    rounded: 'Nunito',
    mono: 'Nunito Sans',
  },
  android: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif-medium',
    mono: 'sans-serif',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'normal',
  },
  web: {
    sans: "'Nunito', system-ui, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'Nunito', system-ui, sans-serif",
    mono: "'Nunito Sans', system-ui, sans-serif",
  },
});

export const Clay = {
  radius: 24,
  shadow: {
    shadowColor: 'rgba(120,90,200,0.22)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  deepShadow: {
    shadowColor: 'rgba(120,90,200,0.26)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
};
