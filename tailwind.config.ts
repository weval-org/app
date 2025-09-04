import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			header: 'hsl(var(--header))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			'card-foreground': 'hsl(var(--card-foreground))',
  			border: 'hsl(var(--border))',
  			'border-contrast': 'var(--border-contrast)',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			'primary-foreground': 'hsl(var(--primary-foreground))',
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			'muted-foreground': 'hsl(var(--muted-foreground))',
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			exciting: {
  				DEFAULT: 'hsl(var(--exciting))',
  				foreground: 'hsl(var(--exciting-foreground))'
  			},
        slate: {
          50: 'hsl(var(--slate-50))',
          100: 'hsl(var(--slate-100))',
          200: 'hsl(var(--slate-200))',
          300: 'hsl(var(--slate-300))',
          400: 'hsl(var(--slate-400))',
          500: 'hsl(var(--slate-500))',
          600: 'hsl(var(--slate-600))',
          700: 'hsl(var(--slate-700))',
          800: 'hsl(var(--slate-800))',
          900: 'hsl(var(--slate-900))',
          950: 'hsl(var(--slate-950))',
        },
        surface: 'hsl(var(--surface))',
        'accent-cta': {
          DEFAULT: 'hsl(var(--accent-cta))',
          foreground: 'hsl(var(--accent-cta-foreground))'
        },
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
        'highlight-info': 'hsl(var(--highlight-info))',
        'highlight-success': {
          DEFAULT: 'hsl(var(--highlight-success))',
          foreground: 'hsl(var(--highlight-success-foreground))'
        },
        'highlight-warning': {
          DEFAULT: 'hsl(var(--highlight-warning))',
          foreground: 'hsl(var(--highlight-warning-foreground))'
        },
        'highlight-error': {
          DEFAULT: 'hsl(var(--highlight-error))',
          foreground: 'hsl(var(--highlight-error-foreground))'
        },
        'coverage-unmet': 'hsl(var(--coverage-unmet))',
        'coverage-fully-met': 'hsl(var(--coverage-fully-met))',
        'coverage-no-extent': 'hsl(var(--coverage-no-extent))',
        'coverage-grade-0': 'hsl(var(--coverage-grade-0))',
        'coverage-grade-1': 'hsl(var(--coverage-grade-1))',
        'coverage-grade-2': 'hsl(var(--coverage-grade-2))',
        'coverage-grade-3': 'hsl(var(--coverage-grade-3))',
        'coverage-grade-4': 'hsl(var(--coverage-grade-4))',
        'coverage-grade-5': 'hsl(var(--coverage-grade-5))',
        'coverage-grade-6': 'hsl(var(--coverage-grade-6))',
        'coverage-grade-7': 'hsl(var(--coverage-grade-7))',
        'coverage-grade-8': 'hsl(var(--coverage-grade-8))',
        'coverage-grade-9': 'hsl(var(--coverage-grade-9))',
  		},
  		container: {
        center: true,
        padding: "2rem",
  			screens: {
          'sm': '640px',
          'md': '768px',
          'lg': '1024px',
          'xl': '1280px',
  				'2xl': '1400px'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		typography: (theme: any) => ({
  			DEFAULT: {
  				css: {
  					'--tw-prose-body': theme('colors.foreground'),
  					'--tw-prose-headings': theme('colors.foreground'),
  					'--tw-prose-lead': theme('colors.muted.foreground'),
  					'--tw-prose-links': theme('colors.primary.DEFAULT'),
  					'--tw-prose-bold': theme('colors.foreground'),
  					'--tw-prose-counters': theme('colors.muted.foreground'),
  					'--tw-prose-bullets': theme('colors.muted.foreground'),
  					'--tw-prose-hr': theme('colors.border'),
  					'--tw-prose-quotes': theme('colors.foreground'),
  					'--tw-prose-quote-borders': theme('colors.border'),
  					'--tw-prose-captions': theme('colors.muted.foreground'),
            '--tw-prose-code': theme('colors.primary.DEFAULT'),
            '--tw-prose-pre-code': theme('colors.card.foreground'),
            '--tw-prose-pre-bg': theme('colors.card.DEFAULT'),
  					'--tw-prose-th-borders': theme('colors.border'),
  					'--tw-prose-td-borders': theme('colors.border'),
  				},
  			},
  			invert: {
  				css: {
            '--tw-prose-body': theme('colors.foreground'),
            '--tw-prose-headings': theme('colors.foreground'),
            '--tw-prose-lead': theme('colors.muted.foreground'),
            '--tw-prose-links': theme('colors.primary.DEFAULT'),
            '--tw-prose-bold': theme('colors.foreground'),
            '--tw-prose-counters': theme('colors.muted.foreground'),
            '--tw-prose-bullets': theme('colors.muted.foreground'),
            '--tw-prose-hr': theme('colors.border'),
            '--tw-prose-quotes': theme('colors.foreground'),
            '--tw-prose-quote-borders': theme('colors.border'),
            '--tw-prose-captions': theme('colors.muted.foreground'),
            '--tw-prose-code': theme('colors.primary.DEFAULT'),
            '--tw-prose-pre-code': theme('colors.card.foreground'),
            '--tw-prose-pre-bg': theme('colors.card.DEFAULT'),
            '--tw-prose-th-borders': theme('colors.border'),
            '--tw-prose-td-borders': theme('colors.border'),
  				},
  			},
  		}),
        keyframes: {
            'accordion-down': {
                from: {
                    height: '0'
                },
                to: {
                    height: 'var(--radix-accordion-content-height)'
                }
            },
            'accordion-up': {
                from: {
                    height: 'var(--radix-accordion-content-height)'
                },
                to: {
                    height: '0'
                }
            }
        },
        animation: {
            'accordion-down': 'accordion-down 0.2s ease-out',
            'accordion-up': 'accordion-up 0.2s ease-out'
        }
  	}
  },
  plugins: [
    require('@tailwindcss/typography'),
      require("tailwindcss-animate")
],
} satisfies Config;
