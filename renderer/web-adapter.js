(function () {
    if (window.dropApp) {
        // Running inside Electron with native IPC bindings
        return;
    }

    const DB_NAME = 'drop_app_web_db';
    const STORE_NAME = 'entries';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('created_at', 'created_at', { unique: false });
                    store.createIndex('pinned', 'pinned', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getStore(mode = 'readonly') {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, mode);
        return { db, tx, store: tx.objectStore(STORE_NAME) };
    }

    function generateUUID() {
        if (crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0,
                v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    const webAdapter = {
        async list({ search = '' } = {}) {
            const { store } = await getStore('readonly');
            return new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => {
                    let entries = req.result || [];
                    const q = search.trim().toLowerCase();
                    if (q) {
                        entries = entries.filter((e) => {
                            const c = (e.content || '').toLowerCase();
                            const t = (e.tags || '').toLowerCase();
                            const title = (e.title || '').toLowerCase();
                            return c.includes(q) || t.includes(q) || title.includes(q);
                        });
                    }
                    entries.sort((a, b) => {
                        if (b.pinned !== a.pinned) return b.pinned - a.pinned;
                        return b.created_at - a.created_at;
                    });
                    resolve(entries);
                };
                req.onerror = () => reject(req.error);
            });
        },

        async create({ type = 'snippet', title = '', content, tags = '' }) {
            const { store } = await getStore('readwrite');
            const now = Date.now();
            const entry = {
                id: generateUUID(),
                type,
                title,
                content,
                tags,
                pinned: 0,
                created_at: now,
                updated_at: now,
            };
            return new Promise((resolve, reject) => {
                const req = store.add(entry);
                req.onsuccess = () => resolve(entry);
                req.onerror = () => reject(req.error);
            });
        },

        async togglePin(id) {
            const { store } = await getStore('readwrite');
            return new Promise((resolve, reject) => {
                const getReq = store.get(id);
                getReq.onsuccess = () => {
                    const entry = getReq.result;
                    if (!entry) return resolve(null);
                    entry.pinned = entry.pinned ? 0 : 1;
                    entry.updated_at = Date.now();
                    const putReq = store.put(entry);
                    putReq.onsuccess = () => resolve(entry);
                    putReq.onerror = () => reject(putReq.error);
                };
                getReq.onerror = () => reject(getReq.error);
            });
        },

        async remove(id) {
            const { store } = await getStore('readwrite');
            return new Promise((resolve, reject) => {
                const req = store.delete(id);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            });
        },
    };

    window.dropApp = webAdapter;

    // Register PWA Service Worker if available
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((err) => {
                console.log('Service Worker registration failed:', err);
            });
        });
    }
})();
