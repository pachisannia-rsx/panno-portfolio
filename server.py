#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def fetch_finnhub_quotes(symbols, token):
    prices = {}
    warnings = []
    for symbol in symbols:
        symbol = symbol.strip().upper()
        if not symbol:
            continue

        query = urllib.parse.urlencode({"symbol": symbol, "token": token})
        url = f"https://finnhub.io/api/v1/quote?{query}"

        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                error_msg = data.get("error")
                if isinstance(error_msg, str) and error_msg.strip():
                    warnings.append(f"{symbol}: {error_msg.strip()}")
                    continue
                current = data.get("c")
                prev_close = data.get("pc")
                candidate = current if isinstance(current, (int, float)) and current > 0 else prev_close
                if isinstance(candidate, (int, float)) and candidate > 0:
                    prices[symbol] = round(float(candidate), 4)
                else:
                    warnings.append(f"{symbol}: missing price fields")
        except (urllib.error.URLError, json.JSONDecodeError):
            warnings.append(f"{symbol}: request failed")
            continue

    return prices, warnings


class PortfolioHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/prices":
            self.handle_prices(parsed)
            return

        return super().do_GET()

    def handle_prices(self, parsed):
        token = os.environ.get("FINNHUB_API_KEY", "").strip()
        if not token:
            self.send_json(500, {"error": "Missing FINNHUB_API_KEY environment variable"})
            return

        params = urllib.parse.parse_qs(parsed.query)
        raw_symbols = params.get("symbols", [""])[0]
        symbols = [sym.strip().upper() for sym in raw_symbols.split(",") if sym.strip()]

        if not symbols:
            self.send_json(400, {"error": "Provide symbols query param, e.g. ?symbols=AAPL,SPY"})
            return

        prices, warnings = fetch_finnhub_quotes(symbols, token)
        if not prices:
            detail = warnings[0] if warnings else "Finnhub returned no prices"
            self.send_json(502, {"error": f"Live pricing unavailable ({detail})", "warnings": warnings})
            return
        payload = {
            "prices": prices,
            "count": len(prices),
            "warnings": warnings,
            "asOf": datetime.now(timezone.utc).isoformat(),
        }
        self.send_json(200, payload)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def guess_type(self, path):
        ext = Path(path).suffix.lower()
        return MIME_TYPES.get(ext, super().guess_type(path))


def main():
    load_env_file(ENV_PATH)
    os.chdir(BASE_DIR)
    server = HTTPServer((HOST, PORT), PortfolioHandler)
    print(f"Serving on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
