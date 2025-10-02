import type { Config } from 'tailwindcss';
import { themes } from './src/styles/themes';
import daisyui from 'daisyui';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // IMPORTANT: Reduced safelist - only include classes that are truly dynamic
  // The old wildcard patterns (e.g., /bg-./) generated 1000s of unused classes
  safelist: [
    // Only safelist specific dynamic classes that are generated at runtime
    // For theme colors, tooltip variants, etc. - add specific patterns as needed
    // Example: { pattern: /^bg-(primary|secondary|accent)$/ }
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
    },
  },
  plugins: [daisyui, typography],
  daisyui: {
    themes: themes.reduce(
      (acc, { name, colors }) => {
        acc.push({
          [`${name}-light`]: colors.light,
        });
        acc.push({
          [`${name}-dark`]: colors.dark,
        });
        return acc;
      },
      ['light', 'dark'] as (Record<string, unknown> | string)[],
    ),
  },
};
export default config;
