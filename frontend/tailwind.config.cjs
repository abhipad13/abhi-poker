/**
 * Tailwind CSS v4 config with an explicit safelist for arbitrary/dynamic utilities
 * and explicit content globs to ensure all files are scanned.
 */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx,html}',
  ],
  safelist: [
    // Common arbitrary utilities used in the app
    'rounded-[18px]',
    'px-[14px]',
    'py-[10px]',
    'gap-[18px]',
    'my-[18px]',
    'text-[28px]',
    'max-w-[1000px]',
    'min-h-[200px]',
    'backdrop-blur-sm',
    'bg-black/45',
    'bg-white/6',
    'border-white/12',
    'text-white/75',
    'bg-gradient-to-r',
    'from-transparent',
    'via-white/25',
    'to-transparent',
    'hover:scale-105',
    'active:scale-95',
    'disabled:opacity-50',
    // Pattern to keep any arbitrary value utilities we might add
    { pattern: /(px|py|text|rounded|max-w|min-w|min-h|max-h|gap|my|mx|tracking|left|right|top|bottom)-\[.*\]/ },
    { pattern: /(bg|border|from|via|to)-.*\/(?:\d{1,3})$/ },
    { pattern: /(backdrop|blur)-.*/ },
  ],
  theme: {
    extend: {},
  },
};


