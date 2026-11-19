"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const APP_ID = "com.shiftvault.desktop";
const ENTRY = path.join(__dirname, "www", "index.html");
const ICON = path.join(__dirname, "www", "icon-dark.png");

function createWindow() {
  const window = new BrowserWindow({
    width: 480,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    resizable: true,
    show: false,
    title: "ShiftVault",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    icon: ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);

  window.once("ready-to-show", () => window.show());
  window.loadFile(ENTRY);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
