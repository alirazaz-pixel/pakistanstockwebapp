# Deployment Guide — Step by Step

You don't need Firebase for this version — GitHub alone hosts the site
*and* runs the bot that fetches data, both for free. (If you'd still like
Firebase added later for something like saving your own notes/watchlist,
that's a separate, optional add-on — not needed for the dashboard itself.)

Total time: about 10–15 minutes, one-time setup.

---

## Step 1 — Create a GitHub account (skip if you have one)

Go to https://github.com/signup and create a free account.

---

## Step 2 — Create a new repository

1. Go to https://github.com/new
2. Repository name: `pk-market-hub` (or anything you like)
3. Set it to **Public** (GitHub Pages' free tier requires public repos)
4. Do **not** check "Add a README" — leave it empty
5. Click **Create repository**

You'll land on a page with setup instructions — ignore those, we'll upload files directly.

---

## Step 3 — Upload the project files

On the empty repository page:

1. Click **"uploading an existing file"** (a link in the middle of the page)
2. Drag in **all** the files and folders I've given you, keeping the folder structure:
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `README.md`
   - the whole `data/` folder (with `latest.json`, `history.json`, `manual.json` inside)
   - the whole `scripts/` folder (with `fetch_data.py` inside)
   - the whole `.github/` folder (with `workflows/update-data.yml` inside)

   **Important:** GitHub's drag-and-drop upload sometimes doesn't preserve empty-looking
   nested folders well from a zip. The easiest reliable method is:
   - On your computer, locate the `pk-dashboard` folder you downloaded
   - Drag the entire folder (not its zipped version) into the GitHub upload box
   - GitHub will recreate the folder structure automatically

3. Scroll down, write a commit message like "Initial upload"
4. Click **Commit changes**

---

## Step 4 — Turn on GitHub Pages

1. In your repository, click **Settings** (top menu bar of the repo)
2. In the left sidebar, click **Pages**
3. Under "Build and deployment" → Source, choose **Deploy from a branch**
4. Branch: select **main**, folder: **/ (root)**
5. Click **Save**
6. Wait about 1 minute, then refresh the page — you'll see a green box with your live URL, something like:
   `https://yourusername.github.io/pk-market-hub/`

That URL is your dashboard. Open it on your phone or PC — bookmark it, or
on mobile tap your browser's "Add to Home Screen" option so it behaves like an app icon.

---

## Step 5 — Let the bot run for the first time

The data-fetching bot runs automatically every 5 minutes once enabled, but
GitHub requires one manual first run (a safety measure for all scheduled workflows):

1. In your repository, click the **Actions** tab
2. You may see a banner asking to confirm workflows are enabled — click **"I understand my workflows, go ahead and enable them"**
3. Click **"Update Market Data"** in the left sidebar
4. Click **Run workflow** (a button on the right) → **Run workflow** again to confirm
5. Wait ~30–60 seconds, refresh — you should see a green checkmark

From this point on, it runs automatically every 5 minutes, forever, for free —
no action needed from you.

---

## Step 6 — Verify it's actually updating

1. Open your dashboard URL
2. Check the small clock text near the top right ("Updated Xs ago") — it should
   update every 10 seconds as the page polls
3. Go back to the **Actions** tab on GitHub after ~5–10 minutes — you should see
   new automatic runs appearing, each one committing fresh numbers to `data/latest.json`

If a run shows a red ✕ instead of a green check, click into it to see the
log — the most common cause is a temporary network hiccup, which the script
already retries automatically (3 attempts with backoff).

---

## Updating CPI, petrol price, or policy rate by hand

These don't change every few minutes in real life, so they're not part of
the automatic fetch. When PBS/OGRA/SBP release new numbers:

1. In your repo, open `data/manual.json`
2. Click the pencil (✎) icon to edit
3. Update the relevant numbers
4. Commit directly to `main`

The website picks up the change within 10 seconds of you saving it (next
time the bot runs, or instantly if you also manually re-run the Action).

---

## Optional: custom domain

If you own a domain, GitHub Pages → Settings lets you point a custom domain
(like `markets.yourname.com`) at this site for free, with free HTTPS
included automatically.

---

## Troubleshooting

**"404 Page Not Found" on the GitHub Pages URL**
Wait another minute — Pages takes a short while to build after first
enabling. Make sure `index.html` is at the repository root, not nested
inside an extra folder.

**Numbers show "—" everywhere**
This means `data/latest.json` hasn't been generated yet, or the Action
hasn't run. Go to Step 5 and trigger it manually once.

**Action keeps failing**
Click into the failed run's log. If it's a 403/timeout from Yahoo Finance,
this can happen occasionally (rate limiting) — it'll usually succeed on
the next 5-minute run automatically; no action needed.

**I want to change the refresh feel from 10s to something else**
Open `app.js`, find the line `const POLL_INTERVAL_MS = 10_000;` near the
top, and change `10_000` to however many milliseconds you want (e.g.
`15_000` for 15 seconds). Save, commit — done.
