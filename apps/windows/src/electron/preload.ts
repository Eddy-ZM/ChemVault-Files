import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("chemvaultDesktop", {
  login: () => ipcRenderer.invoke("auth:login"),
  getTokens: () => ipcRenderer.invoke("auth:getTokens"),
  setTokens: (tokens: unknown) => ipcRenderer.invoke("auth:setTokens", tokens),
  clearTokens: () => ipcRenderer.invoke("auth:clear"),
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  saveFile: (input: { defaultPath: string; bytes: ArrayBuffer }) => ipcRenderer.invoke("dialog:saveFile", input),
  notify: (input: { title: string; body: string }) => ipcRenderer.invoke("notify", input),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  onMenuNewFolder: (callback: () => void) => ipcRenderer.on("menu:new-folder", callback),
  onMenuSignOut: (callback: () => void) => ipcRenderer.on("menu:sign-out", callback),
});
