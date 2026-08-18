const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('dropApp', {
    list: (opts) => ipcRenderer.invoke('entries:list', opts),
    create: (entry) => ipcRenderer.invoke('entries:create', entry),
    togglePin: (id) => ipcRenderer.invoke('entries:togglePin', id),
    remove: (id) => ipcRenderer.invoke('entries:delete', id),
    // file operations
    saveFile: (sourcePath, originalName) => ipcRenderer.invoke('files:save', { sourcePath, originalName }),
    openFile: (storedName) => ipcRenderer.invoke('files:open', storedName),
    revealFile: (storedName) => ipcRenderer.invoke('files:reveal', storedName),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    // events
    onEntriesChanged: (callback) => ipcRenderer.on('entries:changed', callback),
    // clipboard
    getClipboardEnabled: () => ipcRenderer.invoke('clipboard:getEnabled'),
    setClipboardEnabled: (enabled) => ipcRenderer.invoke('clipboard:setEnabled', enabled),
});