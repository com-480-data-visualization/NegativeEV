"""
Explore the Polymarket API to find BTC 5-minute markets structure.
"""
import requests
import json
import sys
sys.stdout.reconfigure(encoding="utf-8")

GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
DATA_API = "https://data-api.polymarket.com"

def search_events(params, label):
    print(f"\n{'='*50}")
    print(f"Search: {label}")
    print(f"Params: {params}")
    resp = requests.get(f"{GAMMA}/events", params=params, timeout=30)
    data = resp.json()
    if not isinstance(data, list):
        print(f"  Error/dict: {str(data)[:200]}")
        return []
    print(f"  Found {len(data)} events")
    for ev in data[:3]:
        title = ev.get("title", "?")
        slug = ev.get("slug", "?")
        vol = ev.get("volume", 0)
        closed = ev.get("closed", "?")
        n_markets = len(ev.get("markets", []))
        print(f"  [{slug}] {title}")
        print(f"    volume=${vol:,.0f} | closed={closed} | markets={n_markets}")
        if ev.get("markets"):
            m = ev["markets"][0]
            print(f"    Q: {m.get('question', '?')[:80]}")
            print(f"    outcomes: {m.get('outcomes', '?')}")
            print(f"    slug: {m.get('slug', '?')}")
            tids = m.get("clobTokenIds", "[]")
            if isinstance(tids, str):
                tids_parsed = json.loads(tids)
            else:
                tids_parsed = tids or []
            if tids_parsed:
                print(f"    token[0]: {str(tids_parsed[0])[:40]}...")
    return data


# Search 1: by slug patterns
for pattern in ["btc-updown-5m", "bitcoin-5-minutes", "btc-5min"]:
    search_events({"slug": pattern}, f"slug={pattern}")

# Search 2: recent trades had BTC 5 min markets
print(f"\n{'='*50}")
print("Checking recent trades for BTC 5-min slugs...")
resp = requests.get(f"{DATA_API}/trades", params={"limit": 100}, timeout=30)
trades = resp.json() if isinstance(resp.json(), list) else []
btc_slugs = set()
for t in trades:
    slug = t.get("slug", "")
    title = t.get("title", "")
    if "btc" in slug.lower() or "bitcoin" in title.lower():
        btc_slugs.add(slug)
        if len(btc_slugs) <= 5:
            print(f"  Trade: {title[:60]} | slug={slug} | outcome={t.get('outcome','?')}")

print(f"  Total BTC slugs in recent trades: {len(btc_slugs)}")

# Search 3: use one of those slugs to find the event
if btc_slugs:
    sample_slug = list(btc_slugs)[0]
    print(f"\n  Fetching event for slug: {sample_slug}")
    resp2 = requests.get(f"{GAMMA}/events", params={"slug": sample_slug}, timeout=30)
    data2 = resp2.json()
    if isinstance(data2, list) and data2:
        ev = data2[0]
        print(f"  Event title: {ev.get('title', '?')}")
        print(f"  Event slug: {ev.get('slug', '?')}")
        markets = ev.get("markets", [])
        print(f"  Markets in event: {len(markets)}")
        if markets:
            m = markets[0]
            print(f"  Q: {m.get('question', '?')}")
            print(f"  Outcomes: {m.get('outcomes', '?')}")
            print(f"  OutcomePrices: {m.get('outcomePrices', '?')}")
            print(f"  Closed: {m.get('closed', '?')}")
            print(f"  Volume: {m.get('volume', '?')}")
            print(f"  StartDate: {m.get('startDate', '?')}")
            print(f"  EndDate: {m.get('endDate', '?')}")
            print(f"  ClosedTime: {m.get('closedTime', '?')}")
            tids = m.get("clobTokenIds", "[]")
            if isinstance(tids, str):
                tids_parsed = json.loads(tids)
            else:
                tids_parsed = tids or []
            if tids_parsed:
                print(f"  Token[0]: {tids_parsed[0][:40]}...")

                # Try price history
                resp3 = requests.get(f"{CLOB}/prices-history",
                    params={"market": tids_parsed[0], "interval": "max"},
                    timeout=30)
                hist = resp3.json().get("history", [])
                print(f"  Price history: {len(hist)} points")
                if hist:
                    print(f"    First: {hist[0]}")
                    print(f"    Last: {hist[-1]}")

# Search 4: pagination through closed BTC 5-min markets
print(f"\n{'='*50}")
print("Fetching closed BTC 5-min events via market search...")
resp4 = requests.get(f"{GAMMA}/markets", params={
    "closed": "true",
    "limit": 20,
    "slug_contains": "btc-updown-5m",
}, timeout=30)
data4 = resp4.json()
if isinstance(data4, list):
    print(f"  Found {len(data4)} markets with slug_contains")
    for m in data4[:3]:
        print(f"    {m.get('question','?')[:60]} | slug={m.get('slug','')}")
else:
    print(f"  Response: {str(data4)[:200]}")

# Search 5: try text search
print(f"\n{'='*50}")
print("Trying public-search for 'Bitcoin 5 Minutes'...")
resp5 = requests.get(f"{GAMMA}/public-search", params={"query": "Bitcoin 5 Minutes", "limit": 5}, timeout=30)
data5 = resp5.json()
if isinstance(data5, list):
    for item in data5[:5]:
        print(f"  {item.get('title', item.get('question', '?'))[:70]} | slug={item.get('slug','?')}")
elif isinstance(data5, dict):
    for key in data5:
        items = data5[key]
        if isinstance(items, list):
            print(f"  [{key}]: {len(items)} results")
            for item in items[:3]:
                if isinstance(item, dict):
                    print(f"    {item.get('title', item.get('question', '?'))[:60]}")

print("\nDone!")
