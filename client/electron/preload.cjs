/**
 * RB Assistant — secure preload (contextBridge only).
 * Exposes minimal `window.rb` API to renderer; no nodeIntegration.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rb", {
  // Trigger main-process capture (Shift+Space equivalent).
  capture: () => ipcRenderer.invoke("rb:capture"),
  cancelDrag: () => ipcRenderer.invoke("rb:drag-cancel"),
  // VIEW/MOVE toggle: setInteractive(true)=MOVE clickable, false=VIEW click-through.
  setInteractive: (on) => ipcRenderer.invoke("rb:set-interactive", on),
  resize: (w, h) => ipcRenderer.invoke("rb:resize", w, h),
  minimize: () => ipcRenderer.invoke("rb:minimize"),
  toggleCompact: () => ipcRenderer.invoke("rb:toggle-compact"),
  hide: () => ipcRenderer.invoke("rb:hide"),
  toggleClickThrough: () => ipcRenderer.invoke("rb:toggle-click-through"),
  quit: () => ipcRenderer.invoke("rb:quit"),
  // Events from main: each returns an unsubscribe fn so renderer cleans up
  // on unmount (avoids double-fire under React StrictMode remount).
  onStatus: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("rb:status", h);
    return () => ipcRenderer.removeListener("rb:status", h);
  },
  onAnswer: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("rb:answer", h);
    return () => ipcRenderer.removeListener("rb:answer", h);
  },
  onAnswerError: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("rb:answer-error", h);
    return () => ipcRenderer.removeListener("rb:answer-error", h);
  },
  onClickThrough: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("rb:click-through", h);
    return () => ipcRenderer.removeListener("rb:click-through", h);
  },
  onDragMode: (fn) => {
    const h = (_e, v) => fn(v);
    ipcRenderer.on("rb:drag-mode", h);
    return () => ipcRenderer.removeListener("rb:drag-mode", h);
  },
});
