const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dropApp', {
    list: (opts) => ipcRenderer.invoke('entries:list', opts),
    create: (entry) => ipcRenderer.invoke('entries:create', entry),
    togglePin: (id) => ipcRenderer.invoke('entries:togglePin', id),
    remove: (id) => ipcRenderer.invoke('entries:delete', id),
});