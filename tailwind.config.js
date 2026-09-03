// boxShadow/keyframes/animation below are additive-only, for app/voiie's
// scoped dark/fuchsia dashboard (see app/voiie/voiie.css) -- they don't
// touch the color tokens above, which the rest of the app already uses.
module.exports = { content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'], theme: { extend: {
  colors: { bg:'#070F10', surface:'#101F21', border:'#1E3D40', accent:'#FF1733', text:'#E6F2F3', muted:'#7A9A9D' },
  boxShadow: {
    'glow-fuchsia': '0 0 20px rgba(255,0,128,0.25)',
    'glow-fuchsia-lg': '0 0 34px rgba(255,0,128,0.35), 0 20px 60px rgba(0,0,0,0.4)',
  },
  keyframes: {
    'pulse-dot': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
    'pulse-glow': { '0%, 100%': { boxShadow: '0 0 20px rgba(255,0,128,0.25)' }, '50%': { boxShadow: '0 0 34px rgba(255,0,128,0.45)' } },
  },
  animation: {
    'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
    'pulse-glow': 'pulse-glow 2.1s ease-in-out infinite',
  },
} }, plugins: [] }