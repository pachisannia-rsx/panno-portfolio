const webullInput = document.getElementById("webullInput");
const robinhoodInput = document.getElementById("robinhoodInput");
const webullStatus = document.getElementById("webullStatus");
const robinhoodStatus = document.getElementById("robinhoodStatus");
const liveStatus = document.getElementById("liveStatus");
const refreshPricesBtn = document.getElementById("refreshPricesBtn");
const searchInput = document.getElementById("searchInput");
const holdingsBody = document.getElementById("holdingsBody");
const webullTotalEl = document.getElementById("webullTotal");
const robinhoodTotalEl = document.getElementById("robinhoodTotal");
const combinedTotalEl = document.getElementById("combinedTotal");
const totalCostEl = document.getElementById("totalCost");
const totalGainEl = document.getElementById("totalGain");
const totalPositionsEl = document.getElementById("totalPositions");
let chartTitleEl;
let chartChangeEl;
let chartStartLabelEl;
let chartEndLabelEl;
let chartLinePathEl;
let chartFillPathEl;
let chartEmptyEl;
const tabs = Array.from(document.querySelectorAll(".portfolio-tabs .tab"));

const STORAGE_KEY = "family-portfolio-data";

const DEFAULT_WEBULL = [
  { symbol: "AAPL", name: "Apple", shares: 3, buyPrice: 235.45 },
  { symbol: "RACE", name: "Ferrari", shares: 2, buyPrice: 504.11 },
];

const DEFAULT_ROBINHOOD = [
  { symbol: "USO", name: "United States Oil Fund", shares: 47, buyPrice: 78.67 },
  { symbol: "IBIT", name: "iShares Bitcoin Trust ETF", shares: 30, buyPrice: 62.1 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", shares: 1, buyPrice: 677.58 },
];

let webullRows = [];
let robinhoodRows = [];
let currentPortfolio = "combined";
let sortKey = "symbol";
let sortDir = "asc";
let autoRefreshTimer = null;
let valueHistory = { combined: [], webull: [], robinhood: [] };

ensureChartElements();
loadFromStorageOrDefaults();
wireUpload(webullInput, "webull");
wireUpload(robinhoodInput, "robinhood");
searchInput.addEventListener("input", render);
refreshPricesBtn.addEventListener("click", refreshPrices);

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    currentPortfolio = tab.dataset.portfolio;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
});

document.querySelectorAll("th[data-key]").forEach((th) => {
  th.addEventListener("click", () => {
    const clickedKey = th.dataset.key;
    if (sortKey === clickedKey) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = clickedKey;
      sortDir = "asc";
    }
    render();
  });
});

render();
refreshPrices();
startAutoRefresh();

function wireUpload(input, source) {
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    getStatusEl(source).textContent = `Reading ${file.name}...`;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheet];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const normalized = normalizeRows(json, source);

      if (source === "webull") {
        webullRows = normalized;
      } else {
        robinhoodRows = normalized;
      }

      if (!normalized.length) {
        getStatusEl(source).textContent = `No valid rows found in ${file.name}.`;
      } else {
        getStatusEl(source).textContent = `Loaded ${normalized.length} holdings from ${file.name}.`;
      }

      persistData();
      render();
      await refreshPrices();
    } catch (err) {
      getStatusEl(source).textContent = `Could not read ${file.name}. Try another Excel file.`;
      console.error(err);
    }
  });
}

function getStatusEl(source) {
  return source === "webull" ? webullStatus : robinhoodStatus;
}

function normalizeRows(dataRows, source) {
  return dataRows
    .map((row) => {
      const get = (...keys) => {
        for (const key of keys) {
          const value = row[key];
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            return value;
          }
        }
        return "";
      };

      const symbol = String(get("Symbol", "Ticker", "symbol", "ticker")).trim().toUpperCase();
      const name = String(get("Name", "Asset", "Company", "name", "asset")).trim();
      const shares = toNumber(get("Shares", "Quantity", "shares", "qty", "Units"));
      const buyPrice = toNumber(get("Buy Price", "Average Cost", "Avg Cost", "buyPrice", "Entry"));
      const price = toNumber(get("Price", "Current Price", "Market Price", "price"));
      const valueRaw = toNumber(get("Market Value", "Value", "Current Value", "value"));
      const costRaw = toNumber(get("Cost Basis", "Cost", "Book Value", "cost"));

      const cost = costRaw || shares * buyPrice;
      const marketPrice = price || (shares ? valueRaw / shares : 0);
      const value = valueRaw || shares * marketPrice;
      const gain = value - cost;

      return {
        symbol,
        name,
        shares,
        buyPrice,
        price: marketPrice,
        hasLivePrice: false,
        value,
        cost,
        gain,
        source,
      };
    })
    .filter((row) => row.symbol || row.name || row.value || row.cost || row.shares);
}

function seedRows(entries, source) {
  return entries.map((entry) => {
    const shares = Number(entry.shares || 0);
    const buyPrice = Number(entry.buyPrice || 0);
    const cost = shares * buyPrice;
    return {
      symbol: entry.symbol,
      name: entry.name,
      shares,
      buyPrice,
      price: buyPrice,
      hasLivePrice: false,
      value: cost,
      cost,
      gain: 0,
      source,
    };
  });
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,%\s,]/g, "")) || 0;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value || 0);
}

function getCurrentRows() {
  if (currentPortfolio === "webull") return [...webullRows];
  if (currentPortfolio === "robinhood") return [...robinhoodRows];
  return [...webullRows, ...robinhoodRows];
}

function getFilteredAndSorted() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = getCurrentRows().filter((row) => {
    if (!query) return true;
    return (
      row.symbol.toLowerCase().includes(query) ||
      row.name.toLowerCase().includes(query) ||
      row.source.toLowerCase().includes(query)
    );
  });

  return filtered.sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }

    const result = String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? result : -result;
  });
}

function render() {
  const visibleRows = getFilteredAndSorted();
  renderTable(visibleRows);
  updateMetrics();
  renderPerformanceChart();
}

function renderTable(tableRows) {
  if (!tableRows.length) {
    holdingsBody.innerHTML = '<tr><td colspan="8" class="empty">No matching rows.</td></tr>';
    return;
  }

  holdingsBody.innerHTML = tableRows
    .map((row) => {
      const gainClass = row.gain > 0 ? "up" : row.gain < 0 ? "down" : "neutral";
      const priceText = row.hasLivePrice
        ? formatCurrency(row.price)
        : `${formatCurrency(row.price)} (entry)`;
      return `
        <tr>
          <td>${escapeHtml(row.symbol || "-")}</td>
          <td>${escapeHtml(row.name || "-")}</td>
          <td>${formatNumber(row.shares)}</td>
          <td>${priceText}</td>
          <td>${formatCurrency(row.value)}</td>
          <td>${formatCurrency(row.cost)}</td>
          <td class="${gainClass}">${formatCurrency(row.gain)}</td>
          <td>${row.source === "webull" ? "Webull" : "Robinhood"}</td>
        </tr>
      `;
    })
    .join("");
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (row[key] || 0), 0);
}

function updateMetrics() {
  const combinedRows = [...webullRows, ...robinhoodRows];
  const webullValue = sum(webullRows, "value");
  const robinhoodValue = sum(robinhoodRows, "value");
  const combinedValue = webullValue + robinhoodValue;
  const combinedCost = sum(combinedRows, "cost");
  const combinedGain = combinedValue - combinedCost;

  webullTotalEl.textContent = formatCurrency(webullValue);
  robinhoodTotalEl.textContent = formatCurrency(robinhoodValue);
  combinedTotalEl.textContent = formatCurrency(combinedValue);
  totalCostEl.textContent = formatCurrency(combinedCost);
  totalGainEl.textContent = formatCurrency(combinedGain);
  totalPositionsEl.textContent = formatNumber(combinedRows.length);

  totalGainEl.classList.remove("up", "down", "neutral");
  totalGainEl.classList.add(combinedGain > 0 ? "up" : combinedGain < 0 ? "down" : "neutral");
  captureHistorySnapshot({ webullValue, robinhoodValue, combinedValue });
}

async function refreshPrices() {
  if (window.location.protocol === "file:") {
    liveStatus.textContent =
      "You opened the file directly. Run: python3 server.py, then open http://127.0.0.1:8000/ (or /portfolio.html).";
    return;
  }

  const symbols = uniqueSymbols([...webullRows, ...robinhoodRows]);
  if (!symbols.length) {
    liveStatus.textContent = "No symbols available for live pricing.";
    return;
  }

  refreshPricesBtn.disabled = true;
  liveStatus.textContent = "Fetching live prices...";

  try {
    const query = encodeURIComponent(symbols.join(","));
    const response = await fetch(`/api/prices?symbols=${query}`);

    if (!response.ok) {
      let message = `Price request failed with status ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload.error) message = errorPayload.error;
      } catch (parseError) {
        // Keep default message when response is not JSON.
      }
      throw new Error(message);
    }

    const payload = await response.json();
    const prices = payload.prices || {};
    const returnedSymbols = Object.keys(prices);
    if (!returnedSymbols.length) {
      throw new Error("No prices were returned. Check FINNHUB_API_KEY and symbol support.");
    }

    applyPrices(webullRows, prices);
    applyPrices(robinhoodRows, prices);
    persistData();
    render();

    const fetchedAt = payload.asOf ? new Date(payload.asOf) : new Date();
    const allSymbols = uniqueSymbols([...webullRows, ...robinhoodRows]);
    const missingCount = Math.max(0, allSymbols.length - returnedSymbols.length);
    const warningText = missingCount ? ` (${missingCount} symbol${missingCount === 1 ? "" : "s"} unavailable)` : "";
    liveStatus.textContent = `Live prices updated at ${fetchedAt.toLocaleTimeString()}${warningText}.`;
  } catch (err) {
    console.error(err);
    liveStatus.textContent = `Live pricing unavailable: ${err.message}`;
  } finally {
    refreshPricesBtn.disabled = false;
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);

  autoRefreshTimer = setInterval(async () => {
    if (!isUsMarketOpenNow()) return;
    await refreshPrices();
  }, 60000);
}

function isUsMarketOpenNow() {
  const now = new Date();
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);

  const weekday = etParts.find((part) => part.type === "weekday")?.value;
  const hour = Number(etParts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(etParts.find((part) => part.type === "minute")?.value || 0);
  const totalMinutes = hour * 60 + minute;
  const isWeekday = weekday && weekday !== "Sat" && weekday !== "Sun";

  // U.S. regular market hours: 9:30 AM to 4:00 PM ET (holidays not handled).
  return Boolean(isWeekday && totalMinutes >= 570 && totalMinutes < 960);
}

function uniqueSymbols(rows) {
  const set = new Set();
  rows.forEach((row) => {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    if (symbol) set.add(symbol);
  });
  return Array.from(set);
}

function applyPrices(rows, prices) {
  rows.forEach((row) => {
    const livePrice = Number(prices[row.symbol]);
    if (!livePrice || !Number.isFinite(livePrice)) return;

    row.price = livePrice;
    row.hasLivePrice = true;
    row.value = row.shares * livePrice;
    row.gain = row.value - row.cost;
  });
}

function captureHistorySnapshot(values) {
  const minuteTs = Math.floor(Date.now() / 60000) * 60000;
  upsertHistoryPoint("webull", minuteTs, values.webullValue);
  upsertHistoryPoint("robinhood", minuteTs, values.robinhoodValue);
  upsertHistoryPoint("combined", minuteTs, values.combinedValue);
  persistData();
}

function upsertHistoryPoint(portfolioKey, ts, value) {
  if (!Number.isFinite(value)) return;

  const history = valueHistory[portfolioKey] || [];
  const last = history[history.length - 1];
  if (last && last.ts === ts) {
    last.value = value;
  } else {
    history.push({ ts, value });
  }

  const maxPoints = 360;
  if (history.length > maxPoints) {
    history.splice(0, history.length - maxPoints);
  }

  valueHistory[portfolioKey] = history;
}

function renderPerformanceChart() {
  if (!chartTitleEl || !chartChangeEl || !chartStartLabelEl || !chartEndLabelEl || !chartLinePathEl || !chartFillPathEl || !chartEmptyEl) {
    return;
  }

  const series = valueHistory[currentPortfolio] || [];
  const chartName = currentPortfolio === "combined" ? "Combined" : currentPortfolio === "webull" ? "Webull" : "Robinhood";
  chartTitleEl.textContent = `${chartName} Performance`;

  if (series.length < 2) {
    chartLinePathEl.setAttribute("d", "");
    chartFillPathEl.setAttribute("d", "");
    chartEmptyEl.style.display = "block";
    chartChangeEl.textContent = "$0.00 (0.00%)";
    chartChangeEl.classList.remove("up", "down", "neutral");
    chartChangeEl.classList.add("neutral");
    chartStartLabelEl.textContent = "--";
    chartEndLabelEl.textContent = "--";
    return;
  }

  chartEmptyEl.style.display = "none";

  const width = 1000;
  const topPadding = 18;
  const bottom = 296;
  const chartHeight = bottom - topPadding;
  const values = series.map((point) => Number(point.value) || 0);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || Math.max(1, Math.abs(maxValue) * 0.01);

  const coords = series.map((point, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = bottom - ((point.value - minValue) / range) * chartHeight;
    return { x, y };
  });

  const linePath = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
    .join(" ");
  const fillPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${bottom} L ${coords[0].x.toFixed(2)} ${bottom} Z`;

  chartLinePathEl.setAttribute("d", linePath);
  chartFillPathEl.setAttribute("d", fillPath);

  const startValue = series[0].value;
  const endValue = series[series.length - 1].value;
  const delta = endValue - startValue;
  const pct = startValue ? (delta / startValue) * 100 : 0;

  chartChangeEl.textContent = `${formatCurrency(delta)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;
  chartChangeEl.classList.remove("up", "down", "neutral");
  chartChangeEl.classList.add(delta > 0 ? "up" : delta < 0 ? "down" : "neutral");

  chartStartLabelEl.textContent = formatChartTime(series[0].ts);
  chartEndLabelEl.textContent = formatChartTime(series[series.length - 1].ts);
}

function formatChartTime(ts) {
  const date = new Date(ts);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function persistData() {
  const payload = {
    webullRows,
    robinhoodRows,
    valueHistory,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadFromStorageOrDefaults() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    webullRows = seedRows(DEFAULT_WEBULL, "webull");
    robinhoodRows = seedRows(DEFAULT_ROBINHOOD, "robinhood");
    webullStatus.textContent = `Loaded ${webullRows.length} manual holdings.`;
    robinhoodStatus.textContent = `Loaded ${robinhoodRows.length} manual holdings.`;
    persistData();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    webullRows = Array.isArray(parsed.webullRows) ? parsed.webullRows : seedRows(DEFAULT_WEBULL, "webull");
    robinhoodRows = Array.isArray(parsed.robinhoodRows)
      ? parsed.robinhoodRows
      : seedRows(DEFAULT_ROBINHOOD, "robinhood");
    valueHistory = normalizeHistory(parsed.valueHistory);

    if (webullRows.length) {
      webullStatus.textContent = `Loaded ${webullRows.length} holdings from saved data.`;
    }
    if (robinhoodRows.length) {
      robinhoodStatus.textContent = `Loaded ${robinhoodRows.length} holdings from saved data.`;
    }
  } catch (err) {
    console.error("Storage parse failed", err);
    webullRows = seedRows(DEFAULT_WEBULL, "webull");
    robinhoodRows = seedRows(DEFAULT_ROBINHOOD, "robinhood");
    webullStatus.textContent = `Loaded ${webullRows.length} manual holdings.`;
    robinhoodStatus.textContent = `Loaded ${robinhoodRows.length} manual holdings.`;
    persistData();
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeHistory(rawHistory) {
  const empty = { combined: [], webull: [], robinhood: [] };
  if (!rawHistory || typeof rawHistory !== "object") return empty;

  const sanitize = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((point) => ({
        ts: Number(point.ts) || 0,
        value: Number(point.value) || 0,
      }))
      .filter((point) => point.ts > 0 && Number.isFinite(point.value));
  };

  return {
    combined: sanitize(rawHistory.combined),
    webull: sanitize(rawHistory.webull),
    robinhood: sanitize(rawHistory.robinhood),
  };
}

function ensureChartElements() {
  let chartCard = document.querySelector(".chart-card");
  if (!chartCard) {
    const tableArea = document.querySelector(".table-area");
    const page = document.querySelector(".page");
    if (tableArea && page) {
      chartCard = document.createElement("section");
      chartCard.className = "chart-card";
      chartCard.setAttribute("aria-live", "polite");
      chartCard.innerHTML = `
        <div class="chart-header">
          <h2 id="chartTitle">Combined Performance</h2>
          <p id="chartChange" class="neutral">$0.00 (0.00%)</p>
        </div>
        <div class="chart-stage">
          <svg id="portfolioChart" viewBox="0 0 1000 320" preserveAspectRatio="none" role="img" aria-label="Portfolio value chart">
            <defs>
              <linearGradient id="chartFillGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#14a363" stop-opacity="0.28"></stop>
                <stop offset="100%" stop-color="#14a363" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <path id="chartFillPath" fill="url(#chartFillGradient)"></path>
            <path id="chartLinePath" fill="none" stroke="#14a363" stroke-width="4" stroke-linecap="round"></path>
          </svg>
          <p id="chartEmpty" class="chart-empty">Collecting value history. Use Refresh Live Prices to build the trend line.</p>
        </div>
        <div class="chart-footer">
          <span id="chartStartLabel">--</span>
          <span id="chartEndLabel">--</span>
        </div>
      `;
      page.insertBefore(chartCard, tableArea);
    }
  }

  chartTitleEl = document.getElementById("chartTitle");
  chartChangeEl = document.getElementById("chartChange");
  chartStartLabelEl = document.getElementById("chartStartLabel");
  chartEndLabelEl = document.getElementById("chartEndLabel");
  chartLinePathEl = document.getElementById("chartLinePath");
  chartFillPathEl = document.getElementById("chartFillPath");
  chartEmptyEl = document.getElementById("chartEmpty");
}
