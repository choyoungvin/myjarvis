const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
    // macOS Calendar
    getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),

    // macOS Reminders
    getReminders: () => ipcRenderer.invoke('get-reminders'),

    // Notion
    getNotionTasks: () => ipcRenderer.invoke('get-notion-tasks'),

    // Config
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (data) => ipcRenderer.invoke('save-config', data),
    transcribeAudio: (buffer) => ipcRenderer.invoke('transcribe-audio', buffer),
    askLlm: (payload) => ipcRenderer.invoke('ask-llm', payload),

    // Window controls
    minimize: () => ipcRenderer.send('window-minimize'),
    close:    () => ipcRenderer.send('window-close'),
});
