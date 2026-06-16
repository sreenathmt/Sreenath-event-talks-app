# BigQuery Release Radar 📢

A premium, fast, and responsive single-page web application that aggregates, categorizes, and displays Google Cloud BigQuery release notes. It features a dark-themed UI and an interactive Tweet Composer to share specific updates instantly on Twitter/X.

## Features

- **Granular Parsing**: Google's feed clusters multiple items under a single date. This app splits them using regex parsing on the backend, converting grouped releases into individual, category-specific cards.
- **Mock Twitter Composer**: Select any card to prefill a Twitter-styled post widget. It automatically calculates character limits using X/Twitter's formatting rules (where all links are counted as exactly 23 characters).
- **Web Intent Redirection**: Share directly to your timeline with one click, bypassing the need for paid API developer integrations.
- **Search & Filter**: Find specific features, fixes, or updates using text searching and type buttons (*Features*, *Issues*, *Changed*, *Deprecated*).
- **Hybrid Memory Cache**: Flask server caches RSS payloads for 10 minutes, protecting Google's feeds while keeping the client instant. You can force a refresh any time by clicking the "Refresh" button.
- **Aesthetic Dark Mode**: Responsive design complete with glassmorphic cards, custom scrollbars, and radial ambient backlights.

---

## Tech Stack

- **Backend**: Python 3.12, Flask, Requests, Feedparser
- **Frontend**: Vanilla HTML5, CSS3 (CSS Variables, Flexbox, CSS Grid), Vanilla JavaScript (ES6)

---

## Installation & Setup

### Prerequisites
Make sure you have **Python 3.12+** installed.

### 1. Clone the Repository
```bash
git clone https://github.com/sreenathmt/Sreenath-event-talks-app.git
cd Sreenath-event-talks-app
```

### 2. Set Up a Virtual Environment
```bash
python -m venv venv
```

**Activate it:**
- **Windows (PowerShell)**:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
- **Windows (CMD)**:
  ```cmd
  .\venv\Scripts\activate.bat
  ```
- **macOS/Linux**:
  ```bash
  source venv/bin/activate
  ```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the Server
```bash
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your web browser.

---

## Directory Structure

```
.
├── app.py                  # Main Flask application & parser
├── requirements.txt        # Python dependencies
├── .gitignore              # Files ignored by git
├── README.md               # Project documentation
├── templates/
│   └── index.html          # Main HTML structure
└── static/
    ├── css/
    │   └── style.css       # Custom dark-theme styling sheet
    └── js/
        └── app.js          # App state, logic, and twitter composer
```

---

## How It Works

### The Feed Splitter
When `/api/releases` is called, the backend fetches the XML feed. Since the XML groups updates by date inside HTML tags, the parser breaks down entries at `<h3>` boundaries:
```python
parts = re.split(r'(<h3>.*?</h3>)', summary_html)
```
Each content part is paired with its preceding category type (e.g. "Feature", "Issue") and sent as a discrete JSON object, which the frontend maps into cards.

### Twitter character counting
Twitter handles URLs differently by standardizing all URLs to a fixed **23 characters**. The Javascript front-end incorporates this logic to show exact limit warnings:
```javascript
function calculateTwitterTextLength(text) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    let length = text.length;
    const matches = text.match(urlRegex);
    if (matches) {
        matches.forEach(match => {
            length = length - match.length + 23;
        });
    }
    return length;
}
```

---

## License

This project is licensed under the MIT License.
