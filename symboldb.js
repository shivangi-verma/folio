/**
 * SymbolDB — Lightweight IndexedDB wrapper for symbol master data.
 * 
 * Uses IndexedDB instead of chrome.storage.local because the NSE symbol
 * master is ~9.4 MB, exceeding the chrome.storage.local 10 MB quota.
 * 
 * Usage:
 *   await SymbolDB.saveSymbols("NSE", data);
 *   const { data, timestamp } = await SymbolDB.getSymbols("NSE");
 *   const ts = await SymbolDB.getLastUpdated("NSE");
 */

const SymbolDB = (() => {
  const DB_NAME = "FolioSymbolDB";
  const DB_VERSION = 1;
  const STORE_NAME = "symbols";

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "exchange" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save symbol master data for a given exchange.
   * @param {string} exchange - Exchange identifier (e.g., "NSE", "BSE")
   * @param {Object} data - The full symbol master JSON object
   * @returns {Promise<void>}
   */
  async function saveSymbols(exchange, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.put({
        exchange,
        data,
        timestamp: Date.now(),
      });

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  /**
   * Retrieve symbol master data for a given exchange.
   * @param {string} exchange - Exchange identifier (e.g., "NSE")
   * @returns {Promise<{ data: Object, timestamp: number } | null>}
   */
  async function getSymbols(exchange) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(exchange);

      request.onsuccess = () => {
        db.close();
        const result = request.result;
        if (result) {
          resolve({ data: result.data, timestamp: result.timestamp });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  /**
   * Get only the timestamp of the last update for an exchange.
   * @param {string} exchange - Exchange identifier
   * @returns {Promise<number | null>} - Timestamp in ms, or null if no data
   */
  async function getLastUpdated(exchange) {
    const result = await getSymbols(exchange);
    return result ? result.timestamp : null;
  }

  return { saveSymbols, getSymbols, getLastUpdated };
})();
