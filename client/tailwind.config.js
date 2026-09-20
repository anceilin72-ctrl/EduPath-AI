/**
 * Design tokens for the Career Roadmap Generator.
 *
 * The app is dark by default. Surfaces are a deep indigo-slate rather than black,
 * which keeps them related to the navy used in the printed diagrams and stops the
 * accents from vibrating the way they do on pure #000.
 *
 * Two of the colours are load-bearing and must never be reused for decoration:
 *
 *   effort  (amber) — time you control. Study hours. Work harder, finish sooner.
 *   fixed   (blue)  — time you cannot compress. A three-year degree is three years
 *                     however hard you work.
 *
 * Because those two carry meaning, buttons deliberately do **not** use them. The
 * main action is a light chip on dark (`ink` on `paper`); amber is spent on exactly
 * one button in the whole app, the one that starts the plan.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* text, darkest to faintest */
        ink: {
          DEFAULT: '#0F172A',
          soft: '#475569',
          faint: '#94A3B8',
        },

        /* light main surfaces */
        paper: '#F8FAFC',
        card: '#FFFFFF',
        panel: '#F1F5F9',
        rule: '#E2E8F0',

        /* dark sidebar navy palette */
        navy: {
          DEFAULT: '#0B132B',
          soft: '#1C2541',
          card: '#1E293B',
          rule: '#334155',
        },

        /* meaning accents */
        effort: { DEFAULT: '#2563EB', soft: '#EFF6FF', lift: '#1D4ED8' },
        fixed: { DEFAULT: '#4F46E5', soft: '#EEF2FF' },
        done: { DEFAULT: '#10B981', soft: '#ECFDF5' },
        warn: { DEFAULT: '#F59E0B', soft: '#FFFBEB' },
        danger: { DEFAULT: '#EF4444', soft: '#FEF2F2' },
      },
      fontFamily: {
        /** Grotesque for headings and buttons — reads like a notice board. */
        display: ['Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        /** Sans for everything else. Plain, dense, and quick to skim. */
        body: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        /** Mono for every measured figure, so a number always looks like a number. */
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: {
        /** Reading measure. Short on purpose — long paragraphs get skipped. */
        prose: '58ch',
        /** The app's outer frame. */
        page: '76rem',
      },
      keyframes: {
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
