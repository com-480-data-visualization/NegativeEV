"""
Fetch BTC 5-minute prediction markets from Polymarket.
Strategy: generate slugs from timestamps (btc-updown-5m-{ts}) and batch-fetch.
Each market starts every 5 minutes (300s intervals).
"""
import requests
import json
import os
import sys
import time
import csv
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding="utf-8")

GAMMA = "https://gamma-api.polymarket.com"
RAW_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw")
PROCESSED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "processed")

INTERVAL = 300  # 5 minutes in seconds
DAYS_BACK = 7  # how many days of data to fetch


def fetch_event_by_slug(slug):
    """Fetch a single event by slug. Returns event dict or None."""
    try:
        resp = requests.get(f"{GAMMA}/events", params={"slug": slug}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and data:
            return data[0]
    except requests.exceptions.RequestException:
        pass
    return None


def extract_market_data(event, slug):
    """Extract relevant fields from a BTC 5-min event."""
    markets = event.get("markets", [])
    if not markets:
        return None
    m = markets[0]

    outcomes_raw = m.get("outcomes", "[]")
    prices_raw = m.get("outcomePrices", "[]")
    try:
        outcomes = json.loads(outcomes_raw) if isinstance(outcomes_raw, str) else (outcomes_raw or [])
    except json.JSONDecodeError:
        outcomes = []
    try:
        prices = json.loads(prices_raw) if isinstance(prices_raw, str) else (prices_raw or [])
    except json.JSONDecodeError:
        prices = []

    winner = ""
    up_price = None
    down_price = None
    if prices:
        try:
            float_prices = [float(p) for p in prices]
            up_price = float_prices[0] if len(float_prices) > 0 else None
            down_price = float_prices[1] if len(float_prices) > 1 else None
            max_idx = float_prices.index(max(float_prices))
            winner = outcomes[max_idx] if max_idx < len(outcomes) else ""
        except (ValueError, IndexError):
            pass

    parts = slug.split("-")
    event_ts = int(parts[-1]) if parts else 0

    vol = 0
    try:
        vol = float(m.get("volumeNum", 0) or m.get("volume", 0) or 0)
    except (ValueError, TypeError):
        pass

    return {
        "slug": slug,
        "event_timestamp": event_ts,
        "event_datetime": datetime.fromtimestamp(event_ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "date": datetime.fromtimestamp(event_ts, tz=timezone.utc).strftime("%Y-%m-%d"),
        "hour": datetime.fromtimestamp(event_ts, tz=timezone.utc).hour,
        "minute": datetime.fromtimestamp(event_ts, tz=timezone.utc).minute,
        "day_of_week": datetime.fromtimestamp(event_ts, tz=timezone.utc).strftime("%A"),
        "winner": winner,
        "winner_binary": 1 if winner == "Up" else (0 if winner == "Down" else ""),
        "up_final_price": up_price,
        "down_final_price": down_price,
        "volume": vol,
        "closed": m.get("closed", ""),
        "last_trade_price": m.get("lastTradePrice", ""),
    }


def generate_timestamps(days_back=DAYS_BACK):
    """Generate 5-minute aligned timestamps going back N days from now."""
    now = int(time.time())
    current = (now // INTERVAL) * INTERVAL - INTERVAL  # last completed 5-min block
    start = current - (days_back * 86400)

    timestamps = []
    ts = start
    while ts <= current:
        timestamps.append(ts)
        ts += INTERVAL
    return timestamps


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(PROCESSED_DIR, exist_ok=True)

    timestamps = generate_timestamps(DAYS_BACK)
    print(f"Generated {len(timestamps)} timestamps ({DAYS_BACK} days, every 5 min)", flush=True)
    print(f"Range: {datetime.fromtimestamp(timestamps[0], tz=timezone.utc)} to "
          f"{datetime.fromtimestamp(timestamps[-1], tz=timezone.utc)}", flush=True)

    all_markets = []
    not_found = 0
    errors = 0
    batch_size = 50

    for i in range(0, len(timestamps), batch_size):
        batch = timestamps[i:i + batch_size]
        batch_found = 0

        for ts in batch:
            slug = f"btc-updown-5m-{ts}"
            event = fetch_event_by_slug(slug)
            if event:
                data = extract_market_data(event, slug)
                if data:
                    all_markets.append(data)
                    batch_found += 1
                else:
                    errors += 1
            else:
                not_found += 1
            time.sleep(0.05)

        pct = (i + len(batch)) / len(timestamps) * 100
        print(
            f"  [{pct:5.1f}%] Batch {i//batch_size + 1}: {batch_found}/{len(batch)} found "
            f"(total: {len(all_markets)} markets, {not_found} not found)",
            flush=True,
        )

    print(f"\nFetch complete!", flush=True)
    print(f"  Found: {len(all_markets)}", flush=True)
    print(f"  Not found: {not_found}", flush=True)
    print(f"  Errors: {errors}", flush=True)

    # Save JSON
    json_path = os.path.join(RAW_DIR, "btc_5m_markets.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_markets, f, indent=2, ensure_ascii=False)
    print(f"\nSaved JSON: {json_path}", flush=True)

    # Save CSV
    if all_markets:
        csv_path = os.path.join(PROCESSED_DIR, "btc_5m_markets.csv")
        fieldnames = list(all_markets[0].keys())
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_markets)
        print(f"Saved CSV: {csv_path}", flush=True)

    # Summary
    if all_markets:
        ups = sum(1 for m in all_markets if m["winner"] == "Up")
        downs = sum(1 for m in all_markets if m["winner"] == "Down")
        unknowns = len(all_markets) - ups - downs
        volumes = [m["volume"] for m in all_markets if m["volume"] > 0]
        avg_vol = sum(volumes) / len(volumes) if volumes else 0

        print(f"\n{'='*50}", flush=True)
        print("BTC 5-MIN MARKET SUMMARY", flush=True)
        print(f"{'='*50}", flush=True)
        print(f"  Total resolved markets: {len(all_markets)}", flush=True)
        print(f"  Up wins:   {ups:>5} ({ups/len(all_markets)*100:.1f}%)", flush=True)
        print(f"  Down wins: {downs:>5} ({downs/len(all_markets)*100:.1f}%)", flush=True)
        print(f"  Unknown:   {unknowns:>5}", flush=True)
        print(f"  Avg volume: ${avg_vol:,.0f}", flush=True)
        print(f"  Total volume: ${sum(volumes):,.0f}", flush=True)

        # Streaks analysis (Markov)
        results = [m["winner"] for m in sorted(all_markets, key=lambda x: x["event_timestamp"]) if m["winner"] in ("Up", "Down")]
        if len(results) > 2:
            after_up_up = sum(1 for i in range(len(results)-1) if results[i] == "Up" and results[i+1] == "Up")
            after_up = sum(1 for i in range(len(results)-1) if results[i] == "Up")
            after_down_down = sum(1 for i in range(len(results)-1) if results[i] == "Down" and results[i+1] == "Down")
            after_down = sum(1 for i in range(len(results)-1) if results[i] == "Down")

            print(f"\n  Markov (first order):", flush=True)
            if after_up > 0:
                print(f"    P(Up | prev=Up)   = {after_up_up/after_up:.3f} ({after_up_up}/{after_up})", flush=True)
                print(f"    P(Down | prev=Up) = {(after_up-after_up_up)/after_up:.3f}", flush=True)
            if after_down > 0:
                print(f"    P(Up | prev=Down)   = {(after_down-after_down_down)/after_down:.3f}", flush=True)
                print(f"    P(Down | prev=Down) = {after_down_down/after_down:.3f} ({after_down_down}/{after_down})", flush=True)

        # Hourly distribution
        hour_counts = {}
        for m in all_markets:
            h = m.get("hour", -1)
            w = m.get("winner", "")
            if h >= 0 and w in ("Up", "Down"):
                if h not in hour_counts:
                    hour_counts[h] = {"Up": 0, "Down": 0}
                hour_counts[h][w] += 1

        if hour_counts:
            print(f"\n  Hourly Up rate (UTC):", flush=True)
            for h in sorted(hour_counts.keys()):
                total = hour_counts[h]["Up"] + hour_counts[h]["Down"]
                up_rate = hour_counts[h]["Up"] / total if total > 0 else 0
                print(f"    {h:02d}:00 -> Up {up_rate:.1%} ({total} markets)", flush=True)


if __name__ == "__main__":
    main()
