const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const filesDir = path.join(app.getPath('userData'), 'files');
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

let lastClipboardText = '';
let clipboardCaptureEnabled = false; // off by default until user turns it on
let clipboardInterval = null;

let db;

function createWindow() {
    const win = new BrowserWindow({
        width: 480,
        height: 700,
        title: 'Drop',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    // win.webContents.openDevTools(); // To enable dev tools
}

function startClipboardWatcher() {
    lastClipboardText = clipboard.readText();
    clipboardInterval = setInterval(() => {
        if (!clipboardCaptureEnabled) return;
        const current = clipboard.readText();
        const trimmed = current.trim();

        if (trimmed.length === 0 || trimmed === lastClipboardText) return;
        db.createEntry({
            type: 'snippet',
            content: trimmed,
            tags: '',
        });

        lastClipboardText = trimmed;
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.webContents.send('entries:changed');
    }, 1500);
}

app.whenReady().then(() => {
    db = require('./db');

    ipcMain.handle('entries:list', (_event, opts) => db.listEntries(opts));
    ipcMain.handle('entries:create', (_event, entry) => db.createEntry(entry));
    ipcMain.handle('entries:togglePin', (_event, id) => db.togglePin(id));
    ipcMain.handle('entries:delete', (_event, id) => {
        try {
            const entry = db.getEntry(id);
            if (entry && entry.type === 'file' && entry.content) {
                const filePath = path.join(filesDir, entry.content);
                fs.rm(filePath, { force: true }, () => { });
            }
            return db.deleteEntry(id);
        } catch (err) {
            console.log(err)
        }
    });
    // file operation
    ipcMain.handle('files:save', (_event, { sourcePath, originalName }) => {
        const ext = path.extname(originalName);
        const storedName = `${crypto.randomUUID()}${ext}`;
        const destPath = path.join(filesDir, storedName);
        fs.copyFileSync(sourcePath, destPath);

        return db.createEntry({
            type: 'file',
            title: originalName,
            content: storedName,
            tags: '',
        });
    });

    ipcMain.handle('files:open', (_event, storedName) => {
        shell.openPath(path.join(filesDir, storedName));
    });

    ipcMain.handle('files:reveal', (_event, storedName) => {
        shell.showItemInFolder(path.join(filesDir, storedName));
    });

    // clipboard enable/disable
    ipcMain.handle('clipboard:getEnabled', () => clipboardCaptureEnabled);
    ipcMain.handle('clipboard:setEnabled', (_event, enabled) => {
        clipboardCaptureEnabled = enabled;
        if (enabled) lastClipboardText = clipboard.readText();
        return clipboardCaptureEnabled;
    });

    createWindow();
    startClipboardWatcher();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});