from flask import Flask, jsonify, render_template, request
import feedparser
import time
import re

app = Flask(__name__)

# Simple in-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 600  # 10 minutes cache duration in seconds

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html(raw_html):
    """Clean HTML to plain text for tweet summaries."""
    if not raw_html:
        return ""
    # Remove HTML tags
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    # Replace multiple spaces/newlines
    cleantext = re.sub(r'\s+', ' ', cleantext).strip()
    return cleantext

def parse_feed_entries(entries):
    """
    Parse feed entries and extract individual updates.
    The feed entries group updates by date. Each entry.summary has multiple updates
    separated by <h3> tags indicating the type (Feature, Issue, Deprecated, etc.).
    """
    parsed_updates = []
    
    for entry in entries:
        date_str = entry.get('title', 'Unknown Date')
        link = entry.get('link', '')
        summary_html = entry.get('summary', '') or entry.get('content', [{}])[0].get('value', '')
        entry_id = entry.get('id', '')

        # We can parse the individual updates by looking for <h3> tags
        # Format: <h3>Type</h3> <p>Content</p>
        # Let's split using regex to find all <h3>...</h3> blocks
        # We will split the HTML text based on <h3> tag boundaries
        parts = re.split(r'(<h3>.*?</h3>)', summary_html)
        
        # If no <h3> tags found, treat the whole content as a single update
        if len(parts) <= 1:
            clean_text = clean_html(summary_html)
            parsed_updates.append({
                "id": entry_id,
                "date": date_str,
                "link": link,
                "type": "Update",
                "html_content": summary_html,
                "text_content": clean_text
            })
            continue
            
        current_type = "Update"
        sub_id_counter = 0
        for part in parts:
            if not part.strip():
                continue
            
            # Check if this part is an <h3> tag
            h3_match = re.match(r'<h3>(.*?)</h3>', part)
            if h3_match:
                current_type = h3_match.group(1).strip()
            else:
                # This is the content corresponding to the previous <h3> tag
                clean_text = clean_html(part)
                parsed_updates.append({
                    "id": f"{entry_id}#update-{sub_id_counter}",
                    "date": date_str,
                    "link": link,
                    "type": current_type,
                    "html_content": part,
                    "text_content": clean_text
                })
                sub_id_counter += 1

    return parsed_updates

def fetch_feed(bypass_cache=False):
    now = time.time()
    if not bypass_cache and cache["data"] and (now - cache["last_fetched"] < CACHE_DURATION):
        return cache["data"], "cache"
    
    try:
        # Fetch and parse using feedparser
        # We can set custom User-Agent to avoid potential blocking
        feedparser.USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        feed = feedparser.parse(FEED_URL)
        
        if feed.get('bozo_exception'):
            # In some cases a minor XML parse warning occurs but it is still parsed.
            # If entries exist, we can ignore the exception.
            if not feed.entries:
                raise Exception(f"Bozo exception during parse: {feed.bozo_exception}")

        raw_entries = feed.entries
        updates = parse_feed_entries(raw_entries)
        
        # Sort updates (they should already be in chronological order, but let's keep them ordered)
        # BigQuery feed has newest first, which is what we want.
        
        result = {
            "title": feed.feed.get('title', 'BigQuery - Release notes'),
            "link": feed.feed.get('link', 'https://cloud.google.com/bigquery/docs/release-notes'),
            "updated": feed.feed.get('updated', ''),
            "updates": updates,
            "total_count": len(updates),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now))
        }
        
        cache["data"] = result
        cache["last_fetched"] = now
        return result, "network"
    except Exception as e:
        print(f"Error fetching feed: {e}")
        # If network fetch fails but cache has data, return cache as fallback
        if cache["data"]:
            return cache["data"], "fallback"
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        data, source = fetch_feed(bypass_cache=refresh)
        return jsonify({
            "status": "success",
            "source": source,
            "data": data
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
