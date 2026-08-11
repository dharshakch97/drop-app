const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
}

app.whenReady().then(() => {
    db = require('./db');

    ipcMain.handle('entries:list', (_event, opts) => db.listEntries(opts));
    ipcMain.handle('entries:create', (_event, entry) => db.createEntry(entry));
    ipcMain.handle('entries:togglePin', (_event, id) => db.togglePin(id));
    ipcMain.handle('entries:delete', (_event, id) => db.deleteEntry(id));

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});