// Sandboxed preload: exposes only `window.jobRadarDesktop` (design D3). No Node.js in the page.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { CHANNELS, type DesktopBridge } from "./bridge";

const bridge: DesktopBridge = {
  getInfo: () => ipcRenderer.invoke(CHANNELS.getInfo),
  setLaunchAtLogin: (on) => ipcRenderer.invoke(CHANNELS.setLaunchAtLogin, Boolean(on)),
  setClaudePath: (path) =>
    ipcRenderer.invoke(CHANNELS.setClaudePath, typeof path === "string" ? path : null),
  installBrowser: () => ipcRenderer.invoke(CHANNELS.installBrowser),
  removeChromium: () => ipcRenderer.invoke(CHANNELS.removeChromium),
  onBrowserProgress: (cb) => {
    const fn = (_e: IpcRendererEvent, line: unknown) => cb(String(line));
    ipcRenderer.on(CHANNELS.browserProgress, fn);
    return () => void ipcRenderer.off(CHANNELS.browserProgress, fn);
  },
  restart: () => ipcRenderer.invoke(CHANNELS.restart),
  openLogs: () => ipcRenderer.invoke(CHANNELS.openLogs),
};

contextBridge.exposeInMainWorld("jobRadarDesktop", bridge);
