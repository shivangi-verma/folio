// SortableJS loaded via <script> tag (global `Sortable`)

/**
 * MyFolio — Web App version of the sidepanel
 * 
 * Storage strategy (web vs extension):
 *  - chrome.storage.local  → localStorage  (persistent, same-origin)
 *  - chrome.storage.session → localStorage  (we keep data persistent — sessionStorage
 *    would clear on tab close, losing the watchlist, which is undesirable)
 *  - IndexedDB (via SymbolDB) — unchanged, works identically in any browser context
 */

const CF_WORKER_URL = "https://folio.devsim.workers.dev/";

let stockData = {}; // Current display data
let masterStockData = {}; // All NSE stocks for suggestions
let userStockList = []; // User's persisted list of stocks

// --- Data persistence (localStorage only — no chrome.storage in web context) ---

async function loadUserStockList() {
  try {
    const localData = localStorage.getItem('userStockList');
    userStockList = localData ? JSON.parse(localData) : [];
  } catch (error) {
    console.error('Error loading user stock list:', error);
    userStockList = [];
  }
}

async function saveUserStockList() {
  try {
    localStorage.setItem('userStockList', JSON.stringify(userStockList));
  } catch (error) {
    console.error('Error saving user stock list:', error);
  }
}

let searchableStocks = []; // Optimization: flattened list for search

// --- Price Cache ---
const PRICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — skip network fetch if cache is fresher
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes — auto-refresh prices (replaces service worker)
let autoRefreshTimer = null;

/**
 * Load cached price data from localStorage for all stocks in userStockList.
 * Returns the oldest cache timestamp (to decide if a refresh is needed).
 */
async function loadCachedPrices() {
  if (userStockList.length === 0) return null;

  let oldestTimestamp = Infinity;
  let loadedCount = 0;

  try {
    for (const ticker of userStockList) {
      const raw = localStorage.getItem(`stock_${ticker}`);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry && entry.data) {
          stockData[ticker] = entry.data;
          loadedCount++;
          if (entry.timestamp < oldestTimestamp) {
            oldestTimestamp = entry.timestamp;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Error loading cached prices:", err);
  }

  console.log(`Loaded ${loadedCount}/${userStockList.length} stocks from price cache`);
  return loadedCount > 0 ? oldestTimestamp : null;
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load Theme
  initializeTheme();

  // 2. Load Master Stock Data (IndexedDB first, bundled fallback)
  try {
    let symbolSource = 'bundled';
    let idbResult = null;

    // Try IndexedDB first (may fail in incognito/restricted contexts)
    try {
      if (typeof SymbolDB !== 'undefined') {
        idbResult = await SymbolDB.getSymbols("NSE");
      }
    } catch (idbErr) {
      console.warn("IndexedDB unavailable, falling back to bundled data:", idbErr);
    }

    if (idbResult && idbResult.data) {
      // IndexedDB has fresh data — use it
      masterStockData = idbResult.data;
      symbolSource = 'indexeddb';

      // Check if it's older than 7 days, and if so, refresh in the background silently
      const SYMBOL_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - idbResult.timestamp > SYMBOL_REFRESH_INTERVAL_MS) {
        console.log("Symbol data is older than 7 days, refreshing in background...");
        refreshSymbols(false);
      }
    } else {
      // First launch or empty DB — use bundled JSON for instant UX
      const response = await fetch("./NSE_CM_sym_master.json");
      if (!response.ok) throw new Error(`Failed to fetch symbol master: HTTP ${response.status}`);
      masterStockData = await response.json();

      // Seed IndexedDB with bundled data so it's available offline
      if (typeof SymbolDB !== 'undefined') {
        SymbolDB.saveSymbols("NSE", masterStockData).catch(err =>
          console.warn("Failed to seed IndexedDB:", err)
        );
      }

      // Trigger background refresh for latest data immediately on first load
      console.log("First launch, fetching latest symbols from exchange in background...");
      refreshSymbols(false);
    }

    const totalSymbols = Object.keys(masterStockData).length;
    console.log(`Loaded ${totalSymbols} total symbols from ${symbolSource} (EQ filtered in search index)`);

    // Optimization: Pre-calculate searchable list once
    buildSearchIndex(masterStockData);

    initializeSpotlight(); // Init spotlight after data load
  } catch (e) {
    console.error("Failed to load master stock data", e);
    showToast("Failed to load stock directory", "error");
    // Still initialize spotlight so the UI doesn't break — search will just be empty
    initializeSpotlight();
  }

  // 3. Load User Stocks
  await loadUserStockList();
  if (userStockList.length === 0) {
    // Default Nifty 50 subset if empty
    userStockList = ["RELIANCE", "TCS", "HDFCBANK"];
    await saveUserStockList();
  }

  // 4. Cache-first: show cached prices instantly, then refresh if stale
  const oldestCache = await loadCachedPrices();
  const hasCachedData = Object.keys(stockData).length > 0;

  if (hasCachedData) {
    // Render cached data immediately — zero loading state
    updateStockDisplay();
    const cacheAge = Date.now() - oldestCache;
    document.getElementById("lastUpdated").textContent = `Last Updated: ${new Date(oldestCache).toLocaleTimeString()}`;

    if (cacheAge > PRICE_CACHE_TTL) {
      // Cache is stale — silently refresh in background (no skeletons)
      console.log(`Price cache is ${Math.round(cacheAge / 1000)}s old, refreshing silently...`);
      fetchAllStocks(); // no await — non-blocking background refresh
    } else {
      console.log(`Price cache is fresh (${Math.round(cacheAge / 1000)}s old), skipping fetch`);
    }
  } else {
    // No cache at all (first launch) — show skeletons and fetch
    await fetchAllStocks();
  }

  // 5. Setup Event Listeners
  setupEventListeners();

  // 6. Start auto-refresh timer (replaces the service worker's periodic alarm)
  startAutoRefresh();

  // 7. Refresh on tab visibility change (user returning to tab after being away)
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

function setupEventListeners() {
  // Spotlight Trigger
  const searchTrigger = document.getElementById('searchTrigger');
  const spotlightOverlay = document.getElementById('spotlightOverlay');
  const spotlightInput = document.getElementById('spotlightInput');

  searchTrigger.addEventListener('click', () => {
    openSpotlight();
  });

  // Keyboard Shortcuts (Cmd+K, Esc)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSpotlight();
    }
    if (e.key === 'Escape') {
      closeSpotlight();
      closeManageModal();
    }
  });

  // Close Spotlight on Overlay Click
  spotlightOverlay.addEventListener('click', (e) => {
    if (e.target === spotlightOverlay) closeSpotlight();
  });

  // Manage Modal interactions
  document.getElementById('manageButton').addEventListener('click', openManageModal);
  document.getElementById('closeManageModal').addEventListener('click', closeManageModal);
  document.getElementById('manageModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('manageModal')) closeManageModal();
  });

  // Event Delegation: Manage List (Deletion)
  document.getElementById('manageList').addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (btn) {
      e.stopPropagation();
      removeStock(btn.dataset.symbol);
    }
  });

  // Event Delegation: Spotlight Results (Selection)
  document.getElementById('spotlightResults').addEventListener('click', (e) => {
    const item = e.target.closest('.spotlight-item');
    if (item) {
      const symbol = item.dataset.symbol;
      if (!userStockList.includes(symbol)) {
        addStock(symbol);

        // Dynamically toggle icon to checkmark instantly
        const icon = item.querySelector('.ph');
        if (icon) {
          icon.className = 'ph ph-check';
          icon.style.color = 'var(--success)';
        }
      } else {
        showToast(`${symbol} is already in your list`, 'warning');
      }
    }
  });

  // Refresh Symbols Button
  document.getElementById('refreshSymbolsBtn').addEventListener('click', () => refreshSymbols(true));
}

// --- Auto-Refresh (replaces the service worker alarm in the Chrome extension) ---

function startAutoRefresh() {
  // Clear any existing timer
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);

  autoRefreshTimer = setInterval(() => {
    if (userStockList.length > 0 && document.visibilityState === 'visible') {
      console.log('Auto-refresh: fetching latest prices...');
      fetchAllStocks();
    }
  }, AUTO_REFRESH_INTERVAL);

  console.log(`Auto-refresh started: every ${AUTO_REFRESH_INTERVAL / 60000} minutes`);
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (userStockList.length === 0) return;

  // Check if enough time has passed since last update to warrant a refresh
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const oldestCache = findOldestCacheTimestamp();

  if (oldestCache && (Date.now() - oldestCache) > PRICE_CACHE_TTL) {
    console.log('Tab became visible with stale data, refreshing...');
    fetchAllStocks();
  }
}

/**
 * Scan localStorage for the oldest stock cache entry to determine staleness.
 */
function findOldestCacheTimestamp() {
  let oldest = Infinity;
  for (const ticker of userStockList) {
    try {
      const raw = localStorage.getItem(`stock_${ticker}`);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry && entry.timestamp && entry.timestamp < oldest) {
          oldest = entry.timestamp;
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }
  return oldest === Infinity ? null : oldest;
}

// --- Theme Logic ---
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggle');
  btn.innerHTML = theme === 'light' ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun"></i>';
}

// --- Spotlight Logic ---
let spotlightSelectedIndex = -1;

function showDefaultSuggestions() {
  const popularSymbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "HINDUNILVR", "LT"];
  const matches = [];

  for (const sym of popularSymbols) {
    if (masterStockData && masterStockData[sym]) {
      matches.push(masterStockData[sym]);
    }
  }

  if (matches.length === 0 && searchableStocks.length > 0) {
    for (let i = 0; i < Math.min(10, searchableStocks.length); i++) {
      matches.push(searchableStocks[i].data);
    }
  }

  renderSpotlightResults(matches);
}

function openSpotlight() {
  const overlay = document.getElementById('spotlightOverlay');
  const input = document.getElementById('spotlightInput');

  overlay.classList.add('active');
  input.value = '';
  showDefaultSuggestions();
  input.focus();
  spotlightSelectedIndex = -1;
}

function closeSpotlight() {
  document.getElementById('spotlightOverlay').classList.remove('active');
}

function initializeSpotlight() {
  const input = document.getElementById('spotlightInput');
  const resultsContainer = document.getElementById('spotlightResults');

  // Filter Logic
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim().toUpperCase();
    spotlightSelectedIndex = -1;

    if (query.length < 1) {
      showDefaultSuggestions();
      return;
    }

    // Filter using pre-calculated list (limit 20 for perf/UI)
    const matches = [];
    for (let i = 0; i < searchableStocks.length; i++) {
      const item = searchableStocks[i];
      if (item.searchStr.includes(query)) {
        matches.push(item.data);
        if (matches.length >= 20) break;
      }
    }

    renderSpotlightResults(matches);
  });

  // Keyboard Navigation
  input.addEventListener('keydown', (e) => {
    const items = resultsContainer.querySelectorAll('.spotlight-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      spotlightSelectedIndex = Math.min(spotlightSelectedIndex + 1, items.length - 1);
      updateSelection(items);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      spotlightSelectedIndex = Math.max(spotlightSelectedIndex - 1, 0);
      updateSelection(items);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (spotlightSelectedIndex >= 0) {
        items[spotlightSelectedIndex].click();
      } else if (items.length > 0) {
        items[0].click();
      }
    }
  });

  function updateSelection(items) {
    items.forEach((item, index) => {
      if (index === spotlightSelectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }
}

function renderSpotlightResults(matches) {
  const container = document.getElementById('spotlightResults');
  if (matches.length === 0) {
    container.innerHTML = `<li style="padding:16px; text-align:center; color:var(--text-secondary)">No results found</li>`;
    return;
  }

  container.innerHTML = matches.map((stock, index) => {
    const isAlreadyAdded = userStockList.includes(stock.exSymbol);
    const iconClass = isAlreadyAdded ? "ph-check" : "ph-plus";
    const iconStyle = isAlreadyAdded ? "color: var(--success); font-size:16px;" : "font-size:16px;";

    return `
        <li class="spotlight-item" data-symbol="${stock.exSymbol}">
            <div style="display:flex; flex-direction:column;">
                <span class="spotlight-item-symbol">${stock.exSymbol}</span>
                <span class="spotlight-item-name">${stock.exSymName}</span>
            </div>
            <i class="ph ${iconClass}" style="${iconStyle}"></i>
        </li>
    `;
  }).join('');
}

async function addStock(symbol) {
  if (userStockList.includes(symbol)) {
    showToast(`${symbol} is already in your list`, 'warning');
    return;
  }

  showToast(`Adding ${symbol}...`, 'info');

  // 1. Add to local list and save
  userStockList.push(symbol);
  await saveUserStockList();

  // 2. Show a skeleton for this new item at the bottom of the current list
  const container = document.getElementById("stockContainer");
  const skeletonHTML = `
    <div id="temp-skeleton-${symbol}" class="glass-card skeleton-item" style="padding: 16px; height: 72px; position: relative; overflow: hidden; margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div class="skeleton-line" style="width: 100px; height: 16px; border-radius: 4px;"></div>
                <div class="skeleton-line" style="width: 60px; height: 12px; border-radius: 4px;"></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                <div class="skeleton-line" style="width: 80px; height: 16px; border-radius: 4px;"></div>
                <div class="skeleton-line" style="width: 50px; height: 12px; border-radius: 4px;"></div>
            </div>
        </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', skeletonHTML);
  container.lastElementChild.scrollIntoView({ behavior: 'smooth' });

  try {
    const singleData = await fetchStockData(symbol);
    const tempSkeleton = document.getElementById(`temp-skeleton-${symbol}`);
    if (tempSkeleton) {
      tempSkeleton.remove();
    }

    if (singleData) {
      stockData[symbol] = singleData;
      updateStockDisplay();
      showToast(`Added ${symbol}`, 'success');
    } else {
      // Rollback if data loading failed
      userStockList = userStockList.filter(s => s !== symbol);
      await saveUserStockList();
      updateStockDisplay();
      showToast(`Failed to load data for ${symbol}`, 'error');
    }
  } catch (error) {
    console.error("Error adding stock:", error);
    const tempSkeleton = document.getElementById(`temp-skeleton-${symbol}`);
    if (tempSkeleton) {
      tempSkeleton.remove();
    }
    // Rollback on catch
    userStockList = userStockList.filter(s => s !== symbol);
    await saveUserStockList();
    updateStockDisplay();
    showToast(`Failed to fetch ${symbol}`, 'error');
  }
}

// --- Manage Modal Logic ---
function openManageModal() {
  const modal = document.getElementById('manageModal');
  const list = document.getElementById('manageList');

  modal.classList.add('active');

  // Update symbol last-updated timestamp
  updateSymbolsTimestamp();

  if (userStockList.length === 0) {
    list.innerHTML = `<p style="text-align:center; padding:20px; color:var(--text-secondary);">Your watchlist is empty.</p>`;
    return;
  }

  list.innerHTML = userStockList.map(symbol => `
        <div class="manage-item">
            <span style="font-weight:600;">${symbol}</span>
            <button class="delete-btn" data-symbol="${symbol}">
                <i class="ph ph-trash"></i>
            </button>
        </div>
    `).join('');
}

// Expose removeStock to global scope for the inline onclick handler
window.removeStock = async function (symbol) {
  userStockList = userStockList.filter(s => s !== symbol);
  await saveUserStockList();
  delete stockData[symbol];

  // Remove from localStorage cache
  localStorage.removeItem(`stock_${symbol}`);

  // Refresh UI
  updateStockDisplay();
  openManageModal(); // Refresh modal list

  showToast(`Removed ${symbol}`, 'success');
}

function closeManageModal() {
  document.getElementById('manageModal').classList.remove('active');
}

// --- Fetching Logic ---
async function fetchAllStocks() {
  const container = document.getElementById("stockContainer");
  const loadingContainer = document.getElementById("loadingSkeleton");

  // Show full loading skeleton only if we have NO data yet (Initial Load)
  if (Object.keys(stockData).length === 0) {
    const count = userStockList.length > 0 ? userStockList.length : 1;
    loadingContainer.innerHTML = '';

    const skeletonHTML = `
        <div class="glass-card skeleton-item" style="padding: 16px; height: 72px; position: relative; overflow: hidden;">
            <div style="display: flex; justify-content: space-between;">
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div class="skeleton-line" style="width: 100px; height: 16px; border-radius: 4px;"></div>
                    <div class="skeleton-line" style="width: 60px; height: 12px; border-radius: 4px;"></div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                    <div class="skeleton-line" style="width: 80px; height: 16px; border-radius: 4px;"></div>
                    <div class="skeleton-line" style="width: 50px; height: 12px; border-radius: 4px;"></div>
                </div>
            </div>
        </div>
      `;

    for (let i = 0; i < count; i++) {
      loadingContainer.insertAdjacentHTML('beforeend', skeletonHTML);
    }

    loadingContainer.classList.remove("hidden");
  }

  if (userStockList.length === 0) {
    loadingContainer.classList.add("hidden");
    updateStockDisplay();
    return;
  }

  try {
    const tickersParam = userStockList.join(',');

    const response = await fetch(
      `${CF_WORKER_URL}?stock=${tickersParam}`
    );

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    if (data.error) throw new Error(data.error);

    // Update stockData and Cache
    const timestamp = Date.now();

    Object.keys(data).forEach(ticker => {
      const stockInfo = data[ticker];
      if (!stockInfo.error) {
        stockData[ticker] = stockInfo;

        // Cache in localStorage
        const storageKey = `stock_${ticker}`;
        const cacheObj = { data: stockInfo, timestamp: timestamp };
        localStorage.setItem(storageKey, JSON.stringify(cacheObj));
      }
    });

    updateStockDisplay();
    document.getElementById("lastUpdated").textContent = `Last Updated: ${new Date().toLocaleTimeString()}`;

  } catch (e) {
    console.error("Batch fetch failed:", e);
    showToast("Failed to refresh stocks", "error");
  } finally {
    loadingContainer.classList.add("hidden");
  }
}

// --- Rendering Logic ---
function updateStockDisplay() {
  const container = document.getElementById("stockContainer");

  if (userStockList.length === 0) {
    container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--text-secondary);">
                <i class="ph ph-sparkle" style="font-size:32px; margin-bottom:12px; display:block;"></i>
                <p>Your watchlist is empty.</p>
                <p style="font-size:12px; margin-top:8px;">Press ⌘K to add stocks</p>
            </div>
        `;
    return;
  }

  container.innerHTML = userStockList.map(ticker => {
    const stock = stockData[ticker];
    if (!stock) {
      // Render a sleek skeleton placeholder for this loading ticker
      return `
        <div class="glass-card stock-item skeleton-item" data-ticker="${ticker}" style="padding: 16px; height: 72px; position: relative; overflow: hidden;">
            <div style="display: flex; justify-content: space-between;">
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-weight:600; color:var(--primary); font-size: 14px;">${ticker}</span>
                        <div class="skeleton-line" style="width: 80px; height: 12px; border-radius: 4px;"></div>
                    </div>
                    <div class="skeleton-line" style="width: 60px; height: 12px; border-radius: 4px;"></div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                    <div class="skeleton-line" style="width: 70px; height: 16px; border-radius: 4px;"></div>
                    <div class="skeleton-line" style="width: 40px; height: 12px; border-radius: 4px;"></div>
                </div>
            </div>
        </div>
      `;
    }

    const price = stock.price.price;
    const change = stock.price.change;
    const pChange = stock.price.dyChange;
    const isPos = change >= 0;
    const priceData = stock.price;

    return `
        <div class="glass-card stock-item" data-ticker="${ticker}">
            <div class="stock-header">
                <div class="stock-info">
                    <div class="stock-title">
                        <h3>${stock.info.name}</h3>
                        <a href="https://www.tradingview.com/chart/?symbol=NSE:${ticker}" target="_blank" class="tradingview-link" title="View Advanced Chart">
                            <i class="ph-fill ph-arrow-square-out"></i>
                        </a>
                    </div>
                    <div class="stock-meta">
                        <span style="font-weight:600; color:var(--primary);">${ticker}</span>
                        <span>•</span>
                        <span>${stock.gic.sector}</span>
                    </div>
                </div>
                <div class="stock-price">
                    <div class="price-current">₹${formatNumber(price)}</div>
                    <div class="price-change ${isPos ? 'positive' : 'negative'}">
                        ${isPos ? '<i class="ph ph-caret-up"></i>' : '<i class="ph ph-caret-down"></i>'}
                        ${Math.abs(change).toFixed(2)} (${Math.abs(pChange).toFixed(2)}%)
                    </div>
                </div>
            </div>
            
            <div class="details-grid">
                <div class="detail-row">
                <span class="detail-label">Market Cap</span> <span class="detail-value">${formatMarketCap(stock.ratios.marketCap)}</span>
                </div>
                <div class="detail-row"><span class="detail-label">P/E Ratio</span> <span class="detail-value">${formatNumber(stock.ratios.pe)}</span></div>
                <div class="detail-row"><span class="detail-label">52W High</span> <span class="detail-value">₹${formatNumber(stock.ratios['52wHigh'])}</span></div>
                <div class="detail-row"><span class="detail-label">52W Low</span> <span class="detail-value">₹${formatNumber(stock.ratios['52wLow'])}</span></div>
                <div class="detail-row"><span class="detail-label">Day's Range</span> <span class="detail-value" style="text-align:right;">₹${formatNumber(priceData.l)} - ₹${formatNumber(priceData.h)}</span></div>
                <div class="detail-row">
                <span class="detail-label">EPS</span> <span class="detail-value">₹${formatNumber(stock.ratios.eps)}</span></div>
                <div class="detail-row">
                <span class="detail-label">Risk</span> <span class="detail-value">${stock.labels.risk.title}</span>
                </div>
            </div>
        </div>
        `;
  }).join('');

  // Add click listeners for expanding details (safely for CSP)
  container.querySelectorAll('.stock-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (isDragging) return;
      // Don't toggle if clicking links
      if (e.target.closest('a')) return;
      toggleDetails(item);
    });
  });

  // Initialize SortableJS
  initSortable();
}

// --- SortableJS ---
let sortableInstance = null;
let isDragging = false;

function initSortable() {
  const container = document.getElementById('stockContainer');
  if (!container) return;

  // Destroy previous instance if it exists (prevents duplicates on re-render)
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }

  // Guard: skip if SortableJS didn't load (e.g. CDN blocked)
  if (typeof Sortable === 'undefined') {
    console.warn('SortableJS not loaded — drag-and-drop disabled');
    return;
  }

  sortableInstance = Sortable.create(container, {
    animation: 200,
    delay: 150,              // Distinguish click (expand) from drag
    delayOnTouchOnly: true,  // Delay only on touch devices, desktop drag is instant
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    filter: '.skeleton-item, a, button, i, .delete-btn', // Don't allow dragging skeleton placeholders or links/buttons
    preventOnFilter: false,  // Allow default event on filtered items
    draggable: '.stock-item', // Only stock items are draggable
    onStart: function () {
      isDragging = true;
      // Collapse any expanded details to prevent visual glitches during drag
      container.querySelectorAll('.details-grid.expanded').forEach(el => {
        el.style.maxHeight = null;
        el.classList.remove('expanded');
      });
    },
    onEnd: function (evt) {
      // Rebuild userStockList from the new DOM order
      const items = container.querySelectorAll('.stock-item[data-ticker]');
      userStockList = Array.from(items).map(el => el.dataset.ticker);
      saveUserStockList();

      // If manage modal is open, refresh it to reflect new order
      const manageModal = document.getElementById('manageModal');
      if (manageModal && manageModal.classList.contains('active')) {
        openManageModal();
      }

      // Reset dragging flag after click event has had a chance to fire
      setTimeout(() => {
        isDragging = false;
      }, 50);
    }
  });
}

function toggleDetails(element) {
  if (window.getSelection().toString().length > 0) return;

  const details = element.querySelector('.details-grid');
  const isExpanded = details.classList.contains('expanded');

  if (!isExpanded) {
    details.classList.add('expanded');
    details.style.maxHeight = details.scrollHeight + 20 + "px";
  } else {
    details.style.maxHeight = null;
    details.classList.remove('expanded');
  }
}

function formatNumber(num) {
  return num ? num.toFixed(2) : 'N/A';
}

function formatMarketCap(val) {
  if (!val) return 'N/A';
  if (val > 1000) return `₹${(val / 1000).toFixed(2)}T`;
  return `₹${val.toFixed(2)}Cr`;
}

function showToast(msg, type = 'info') {
  const container = document.querySelector('.toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'warning-circle';

  toast.innerHTML = `<i class="ph ph-${icon}"></i> ${msg}`;

  container.appendChild(toast);

  if (window.Motion) {
    window.Motion.animate(toast, { y: [20, 0], opacity: [0, 1] }, { duration: 0.3 });
  }

  setTimeout(() => {
    if (window.Motion) {
      window.Motion.animate(toast, { opacity: 0, y: -20 }, { duration: 0.2 })
        .finished
        .catch(err => console.warn('Toast animation error', err))
        .finally(() => {
          if (toast.isConnected) toast.remove();
        });
    } else {
      if (toast.isConnected) toast.remove();
    }
  }, 3000);
}

async function fetchStockData(ticker, retryCount = 0) {
  try {
    // Check localStorage cache first
    const storageKey = `stock_${ticker}`;
    let cachedData = null;

    const localData = localStorage.getItem(storageKey);
    if (localData) {
      cachedData = JSON.parse(localData);
    }

    // Use cached data if recent enough (15 min)
    if (cachedData) {
      const cacheAge = Date.now() - cachedData.timestamp;
      if (cacheAge < 15 * 60 * 1000) {
        console.log(`Using cached data for ${ticker} (${Math.round(cacheAge / 1000 / 60)} min old)`);
        return cachedData.data;
      }
    }

    // Fetch fresh data
    const response = await fetch(
      `${CF_WORKER_URL}?stock=${ticker}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const batchData = await response.json();
    const data = batchData[ticker];

    if (!data || data.error) {
      throw new Error(data ? data.error : "Data not found");
    }

    // Cache successful response in localStorage
    const newCacheData = {
      data: data,
      timestamp: Date.now()
    };
    localStorage.setItem(storageKey, JSON.stringify(newCacheData));

    return data;
  } catch (error) {
    console.error(`Error fetching ${ticker}:`, error);

    // Retry logic (max 3 attempts with exponential backoff)
    if (retryCount < 3) {
      console.log(`Retrying ${ticker} (attempt ${retryCount + 1})...`);
      showToast(`Retrying ${ticker} (attempt ${retryCount + 1})...`, 'warning');
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(fetchStockData(ticker, retryCount + 1));
        }, 1000 * (retryCount + 1));
      });
    }

    // Try to return cached data if available (even stale)
    try {
      const storageKey = `stock_${ticker}`;
      const localData = localStorage.getItem(storageKey);
      if (localData) {
        const cachedData = JSON.parse(localData);
        if (cachedData && cachedData.data) {
          cachedData.data.isCached = true;
          showToast(`Showing cached data for ${ticker}`, 'info');
          return cachedData.data;
        }
      }
    } catch (storageError) {
      console.error("Error accessing localStorage:", storageError);
    }

    showToast(`Failed to fetch data for ${ticker}`, 'error');
    return null;
  }
}

// --- Symbol Data Management ---

/**
 * Build the pre-computed search index from raw symbol master data.
 * Filters to EQ series only and pre-computes uppercase search strings.
 */
function buildSearchIndex(data) {
  searchableStocks = Object.entries(data)
    .filter(([_, value]) => value.exSeries === "EQ" || value.exSeries === "RR")
    .map(([key, value]) => ({
      symbol: value.exSymbol,
      name: value.exSymName,
      searchStr: (value.exSymbol + " " + value.exSymName).toUpperCase(),
      data: value
    }));
  console.log(`Search index built: ${searchableStocks.length} EQ stocks`);
}

const SYMBOL_MASTER_URL = "https://public.fyers.in/sym_details/NSE_CM_sym_master.json";

async function refreshSymbols(isManual = false) {
  const btn = document.getElementById('refreshSymbolsBtn');
  const statusEl = document.getElementById('symbolsLastUpdated');

  if (btn && btn.disabled) return;

  if (btn) {
    btn.disabled = true;
    btn.classList.add('refreshing');
  }
  if (statusEl) {
    statusEl.textContent = 'Updating symbols...';
  }

  try {
    const response = await fetch(SYMBOL_MASTER_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // Save to IndexedDB (with fallback if IndexedDB is unavailable)
    if (typeof SymbolDB !== 'undefined') {
      try {
        await SymbolDB.saveSymbols("NSE", data);
      } catch (idbErr) {
        console.warn('IndexedDB save failed, data still available in memory:', idbErr);
      }
    }

    // Update in-memory data and rebuild search index
    masterStockData = data;
    buildSearchIndex(masterStockData);

    if (isManual) {
      showToast(`Symbols updated (${searchableStocks.length} EQ stocks)`, 'success');
    }
  } catch (err) {
    console.error('Symbol refresh error:', err);
    if (isManual) {
      showToast('Failed to refresh symbols', 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('refreshing');
    }
    updateSymbolsTimestamp();
  }
}

/**
 * Update the "last updated" text in the manage modal footer.
 */
async function updateSymbolsTimestamp() {
  const statusEl = document.getElementById('symbolsLastUpdated');
  if (!statusEl) return;

  try {
    let timestamp = null;
    if (typeof SymbolDB !== 'undefined') {
      timestamp = await SymbolDB.getLastUpdated("NSE");
    }

    if (timestamp) {
      const age = Date.now() - timestamp;
      const hours = Math.floor(age / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      let ageStr;
      if (days > 0) {
        ageStr = `${days}d ago`;
      } else if (hours > 0) {
        ageStr = `${hours}h ago`;
      } else {
        ageStr = 'just now';
      }

      const count = Object.keys(masterStockData).length;
      statusEl.textContent = `${count} symbols · Updated ${ageStr}`;
    } else {
      const count = Object.keys(masterStockData).length;
      statusEl.textContent = count > 0 ? `${count} symbols · Bundled data` : 'Using bundled data';
    }
  } catch (err) {
    statusEl.textContent = 'Using bundled data';
  }
}
