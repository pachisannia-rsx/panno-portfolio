# Family Portfolio Tracker

A simple 2-page portfolio website for Webull + Robinhood with live price updates from Finnhub.

## What is included
- Portfolio page with uploads, combined totals, and holdings table
- News & Events page with symbol-specific links
- Python backend endpoint: `/api/prices` to keep your API key private

## 1) Add your API key
Create a `.env` file in this folder with:

```bash
FINNHUB_API_KEY=your_finnhub_key_here
```

(`.env.example` is included as reference.)

## 2) Start the app locally
From this folder run:

```bash
python3 server.py
```

Then open:
- http://127.0.0.1:8000/PANNO%20Portfolio.html
- http://127.0.0.1:8000/news.html

Important: do not open `PANNO Portfolio.html` directly from Finder as a `file:///...` URL.
Live prices only work when the backend server is running and you open the `http://127.0.0.1:8000/...` URL.

## 3) Live pricing
- Prices auto-refresh once on page load.
- During U.S. market hours (Mon-Fri, 9:30 AM-4:00 PM ET), prices auto-refresh every 60 seconds.
- Click `Refresh Live Prices` anytime for latest prices.

## Notes
- Initial manual holdings are preloaded based on your messages.
- Uploading a new Excel file for a platform replaces that platform's current list.

## 4) Deploy so your grandfather can access anytime (Render)
1. Push this project to a GitHub repo.
2. Create a [Render](https://render.com/) account and click `New +` -> `Blueprint`.
3. Select your repo (Render will read `render.yaml` automatically).
4. In Render environment variables, set:
   - `FINNHUB_API_KEY` = your key
5. Deploy.
6. Open your new public URL (something like `https://panno-portfolio.onrender.com/PANNO%20Portfolio.html`) and share it.

After deployment, he can open that URL anytime without running your local computer.
