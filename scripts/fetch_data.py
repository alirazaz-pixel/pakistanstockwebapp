#!/usr/bin/env python3
"""
Pakistan Market Dashboard - Data Fetcher
Runs on a schedule via GitHub Actions. Pulls:
  - KSE-100 index level (Yahoo Finance public chart endpoint, ticker ^KSE)
  - Gold price in PKR (goldapi-free mirror / metals.live style public endpoint)
  - USD/PKR exchange rate (exchangerate.host, free, no key)
  - Brent crude oil price (Yahoo Finance ticker BZ=F)
Writes everything into data/latest.json, plus appends a row to data/history.json
so the dashboard can draw "past performance" charts over time.

NOTE: We deliberately do NOT scrape dps.psx.com.pk directly. PSX's own published
terms prohibit redistribution of their market data feed (including index levels)
through any website without a license. Yahoo Finance's ^KSE ticker is used instead,
which is freely and publicly redistributable.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
LATEST_PATH = os.path.join(DATA_DIR, "latest.json")
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")
MAX_HISTORY_POINTS = 2000  # ~ enough for many days of 5-min samples


def fetch_json(url, timeout=12):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def safe_fetch_json(url, label, retries=3, backoff_seconds=2):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            return fetch_json(url)
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(backoff_seconds * attempt)
    print(f"[warn] failed to fetch {label} after {retries} attempts: {last_err}", file=sys.stderr)
    return None


def get_yahoo_quote(ticker):
    """Returns (price, change, change_pct, prev_close) for a Yahoo ticker, or None on failure."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=5d&interval=1d"
    data = safe_fetch_json(url, f"yahoo:{ticker}")
    if not data:
        return None
    try:
        result = data["chart"]["result"][0]
        meta = result["meta"]
        price = meta.get("regularMarketPrice")
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price is None or prev_close is None:
            return None
        change = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        return {
            "price": round(float(price), 2),
            "change": round(float(change), 2),
            "change_pct": round(float(change_pct), 2),
            "prev_close": round(float(prev_close), 2),
        }
    except (KeyError, IndexError, TypeError) as e:
        print(f"[warn] could not parse yahoo response for {ticker}: {e}", file=sys.stderr)
        return None


def get_usd_pkr():
    """Free, no-key exchange rate endpoint."""
    data = safe_fetch_json("https://open.er-api.com/v6/latest/USD", "usd_pkr")
    if not data or data.get("result") != "success":
        return None
    rate = data.get("rates", {}).get("PKR")
    return round(float(rate), 2) if rate else None


def get_gold_pkr(usd_pkr_rate):
    """
    Gold spot price in USD/oz via Yahoo ticker GC=F (COMEX Gold Futures, used as spot proxy),
    converted to PKR per tola (1 tola = 11.6638 grams, 1 oz = 31.1035 grams).
    """
    gold_usd = get_yahoo_quote("GC=F")
    if not gold_usd or not usd_pkr_rate:
        return None
    usd_per_oz = gold_usd["price"]
    pkr_per_oz = usd_per_oz * usd_pkr_rate
    pkr_per_gram = pkr_per_oz / 31.1035
    pkr_per_tola = pkr_per_gram * 11.6638
    return {
        "pkr_per_tola_24k": round(pkr_per_tola, 0),
        "pkr_per_gram_24k": round(pkr_per_gram, 0),
        "usd_per_oz": usd_per_oz,
        "change_pct": gold_usd["change_pct"],
    }


def get_oil():
    """Brent crude futures, ticker BZ=F."""
    return get_yahoo_quote("BZ=F")


def build_snapshot():
    now = datetime.now(timezone.utc)

    kse = get_yahoo_quote("^KSE")
    usd_pkr = get_usd_pkr()
    gold = get_gold_pkr(usd_pkr)
    oil = get_oil()

    snapshot = {
        "fetched_at_utc": now.isoformat(timespec="seconds"),
        "fetched_at_pkt": now.astimezone(timezone(timedelta(hours=5))).isoformat(timespec="seconds"),
        "kse100": kse,           # {price, change, change_pct, prev_close} or null
        "usd_pkr": usd_pkr,      # float or null
        "gold": gold,            # {pkr_per_tola_24k, pkr_per_gram_24k, usd_per_oz, change_pct} or null
        "oil_brent": oil,        # {price (USD/bbl), change, change_pct, prev_close} or null
        # CPI / inflation is published monthly by PBS, not worth fetching every run.
        # Kept here as a manually-updated field — see data/manual.json.
    }
    return snapshot


def load_json(path, fallback):
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            return fallback
    return fallback


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    snapshot = build_snapshot()

    # Merge in manually-curated fields (CPI, petrol price, policy rate) if present
    manual_path = os.path.join(DATA_DIR, "manual.json")
    manual = load_json(manual_path, {})
    snapshot["manual"] = manual

    # Write latest snapshot
    with open(LATEST_PATH, "w") as f:
        json.dump(snapshot, f, indent=2)
    print(f"[ok] wrote {LATEST_PATH}")

    # Append to rolling history (used for "past performance" charts)
    history = load_json(HISTORY_PATH, [])
    history.append({
        "t": snapshot["fetched_at_utc"],
        "kse100": snapshot["kse100"]["price"] if snapshot["kse100"] else None,
        "usd_pkr": snapshot["usd_pkr"],
        "gold_tola": snapshot["gold"]["pkr_per_tola_24k"] if snapshot["gold"] else None,
        "oil_brent": snapshot["oil_brent"]["price"] if snapshot["oil_brent"] else None,
    })
    history = history[-MAX_HISTORY_POINTS:]
    with open(HISTORY_PATH, "w") as f:
        json.dump(history, f, indent=2)
    print(f"[ok] wrote {HISTORY_PATH} ({len(history)} points)")


if __name__ == "__main__":
    main()
