const symbolCountEl = document.getElementById("symbolCount");
const webullCountEl = document.getElementById("webullCount");
const robinhoodCountEl = document.getElementById("robinhoodCount");
const newsGrid = document.getElementById("newsGrid");
const newsSearch = document.getElementById("newsSearch");

const STORAGE_KEY = "family-portfolio-data";
let cards = [];

loadNewsCards();
newsSearch.addEventListener("input", render);

function loadNewsCards() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    renderEmpty(
      "No saved portfolio data found yet. Go to the Portfolio page and upload Webull and Robinhood files."
    );
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const webullRows = Array.isArray(parsed.webullRows) ? parsed.webullRows : [];
    const robinhoodRows = Array.isArray(parsed.robinhoodRows) ? parsed.robinhoodRows : [];

    const webullSymbols = uniqueSymbols(webullRows);
    const robinhoodSymbols = uniqueSymbols(robinhoodRows);
    const merged = new Map();

    webullSymbols.forEach((symbol) => {
      merged.set(symbol, { symbol, sources: ["Webull"] });
    });

    robinhoodSymbols.forEach((symbol) => {
      if (merged.has(symbol)) {
        const existing = merged.get(symbol);
        if (!existing.sources.includes("Robinhood")) {
          existing.sources.push("Robinhood");
        }
      } else {
        merged.set(symbol, { symbol, sources: ["Robinhood"] });
      }
    });

    cards = Array.from(merged.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));

    symbolCountEl.textContent = String(cards.length);
    webullCountEl.textContent = String(webullSymbols.length);
    robinhoodCountEl.textContent = String(robinhoodSymbols.length);

    if (!cards.length) {
      renderEmpty("No symbols found in saved data. Upload portfolio files first.");
      return;
    }

    render();
  } catch (err) {
    console.error(err);
    renderEmpty("Saved data could not be read. Re-upload files on the Portfolio page.");
  }
}

function uniqueSymbols(rows) {
  const set = new Set();
  rows.forEach((row) => {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    if (symbol) set.add(symbol);
  });
  return Array.from(set);
}

function render() {
  const query = newsSearch.value.trim().toLowerCase();
  const visible = cards.filter((card) => {
    if (!query) return true;
    return card.symbol.toLowerCase().includes(query);
  });

  if (!visible.length) {
    renderEmpty("No symbols match your search.");
    return;
  }

  newsGrid.innerHTML = visible
    .map((card) => {
      const symbol = encodeURIComponent(card.symbol);
      const companyNews = `https://www.google.com/search?q=${symbol}+stock+news&tbm=nws`;
      const earnings = `https://www.nasdaq.com/market-activity/stocks/${card.symbol.toLowerCase()}/earnings`;
      const quote = `https://finance.yahoo.com/quote/${symbol}`;
      const calendar = `https://www.investing.com/economic-calendar/`;

      return `
        <article class="news-card">
          <h3>${card.symbol}</h3>
          <p class="news-meta">Portfolio: ${card.sources.join(" + ")}</p>
          <div class="news-links">
            <a href="${companyNews}" target="_blank" rel="noopener noreferrer">Latest News</a>
            <a href="${earnings}" target="_blank" rel="noopener noreferrer">Upcoming Earnings</a>
            <a href="${quote}" target="_blank" rel="noopener noreferrer">Quote Snapshot</a>
            <a href="${calendar}" target="_blank" rel="noopener noreferrer">Macro Event Calendar</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderEmpty(message) {
  newsGrid.innerHTML = `<article class="empty-card">${message}</article>`;
}
