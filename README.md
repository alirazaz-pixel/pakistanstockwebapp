# Pakistan Market Hub

A simple, no-build, no-Node-required dashboard for tracking Pakistan's
KSE-100 index, inflation (CPI), petrol/diesel prices, gold, oil, and the
USD/PKR rate — auto-refreshing in your browser every 10 seconds, with the
underlying numbers updated automatically every ~5 minutes.

**See `DEPLOY_GUIDE.md` for full step-by-step setup instructions.**

## How it works

```
┌─────────────────────┐       every 5 min        ┌──────────────────┐
│ GitHub Actions       │ ───────────────────────► │ data/latest.json │
│ (scripts/fetch_data) │   fetches & commits       │ data/history.json│
└─────────────────────┘                            └──────────────────┘
                                                            │
                                                            │ polled every 10s
                                                            ▼
                                                  ┌────────────────────┐
                                                  │ index.html + app.js │
                                                  │ (GitHub Pages)      │
                                                  │ — what you open on  │
                                                  │   phone / PC        │
                                                  └────────────────────┘
```

No Node.js anywhere — the bot is plain Python (already on every GitHub
Actions runner), and the website is plain HTML/CSS/JS with zero build step.

## Files

- `index.html`, `style.css`, `app.js` — the website itself
- `scripts/fetch_data.py` — the bot that fetches live data
- `data/manual.json` — numbers you update by hand occasionally (CPI, petrol price, policy rate — these don't change minute-to-minute)
- `data/latest.json` / `data/history.json` — auto-generated, don't edit directly
- `.github/workflows/update-data.yml` — tells GitHub when to run the bot

## A note on data sources

KSE-100 level comes from Yahoo Finance's public `^KSE` ticker rather than
scraping PSX's own site directly — PSX's published terms restrict
redistribution of their live market data feed through third-party websites
without a license. Gold and Brent oil come from public market data too.
CPI, petrol/diesel, and the policy rate are official government figures
(PBS, OGRA, SBP) which you update by hand in `data/manual.json` whenever a
new monthly/fortnightly figure is released — instructions are in that file.

This is a personal tracking tool, not a licensed financial data product.
