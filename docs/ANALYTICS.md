# Analytics (Plausible)

Weval uses [Plausible Analytics](https://plausible.io) for lightweight, privacy-first website analytics.

## Why Plausible?

- **Privacy-first**: No cookies, no personal data collection, no fingerprinting
- **GDPR/CCPA compliant by default**: No cookie consent banner needed
- **Lightweight**: ~1 KB script, no impact on page load performance
- **Open-source**: The analytics engine itself is open-source

## Dashboard

View analytics at: **https://plausible.io/weval.org**

Anyone on the team with access can see real-time and historical data.

## What is tracked

Out of the box, Plausible collects:

- **Pageviews**: Which pages are visited and how often
- **Referrers**: Where visitors come from (search engines, social media, direct links)
- **Countries/regions**: Geographic distribution of visitors
- **Devices & browsers**: Desktop vs. mobile, browser types, OS
- **Outbound link clicks**: Which external links visitors click
- **File downloads**: Tracked automatically
- **Form submissions**: Tracked automatically

## What is NOT tracked

- No individual user identification or profiles
- No session recordings or heatmaps
- No cross-site tracking
- No cookies of any kind
- No IP address storage

## Environment behavior

The Plausible script **only loads in production** (`NODE_ENV=production`). It is excluded from:

- `localhost` / local development
- Any non-production environment

This is controlled by checking `process.env.NODE_ENV === 'production'` in `src/app/layout.tsx`.

## Adding custom event tracking (future)

To track custom events (e.g., button clicks, form submissions), use the Plausible JavaScript API:

```tsx
// Example: track a button click
<button onClick={() => window.plausible('Signup Click')}>
  Sign Up
</button>
```

You'll also need to define the goal in your Plausible dashboard under **Settings > Goals**.

For full details, see the [Plausible custom events documentation](https://plausible.io/docs/custom-event-goals).

## Verifying it works

1. Visit [weval.org](https://weval.org) in your browser
2. Open https://plausible.io/weval.org
3. Your visit should appear within ~60 seconds in the "Current visitors" counter

If you don't see data, check:
- You're visiting the production site (not a preview deploy)
- An ad blocker isn't blocking `plausible.io` requests
