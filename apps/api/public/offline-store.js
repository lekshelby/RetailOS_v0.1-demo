/* RetailOS local storage: catalogue cache and offline sale replay queue. */
(function () {
  const databaseName = 'retailos-offline';
  const databaseVersion = 1;
  let databasePromise;

  function database() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('catalogues')) db.createObjectStore('catalogues', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('sales')) db.createObjectStore('sales', { keyPath: 'offlineId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open local POS storage'));
    });
    return databasePromise;
  }

  async function read(storeName, key) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Unable to read local POS data'));
    });
  }

  async function write(storeName, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || new Error('Unable to save local POS data'));
    });
  }

  async function list(storeName) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Unable to read local POS data'));
    });
  }

  async function remove(storeName, key) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to remove local POS data'));
    });
  }

  window.RetailOffline = {
    getCatalogue: (key) => read('catalogues', key),
    putCatalogue: (key, items) => write('catalogues', { key, items, savedAt: new Date().toISOString() }),
    putSale: (sale) => write('sales', sale),
    getSales: () => list('sales'),
    removeSale: (offlineId) => remove('sales', offlineId),
  };
}());
