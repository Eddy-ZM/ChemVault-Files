import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiBaseUrl = process.env.CHEMVAULT_API_BASE_URL || "https://file.chemvault.science";
const updateFeedUrl = process.env.CHEMVAULT_UPDATE_FEED_URL || "https://download.chemvault.science/files/windows/";
const isDev = Boolean(process.env.CHEMVAULT_DESKTOP_DEV_URL);
const currentDir = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

app.setName("ChemVault Files");
app.setAsDefaultProtocolClient("chemvaultfiles");

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "ChemVault Files",
    icon: join(app.getAppPath(), "build", "icon.ico"),
    webPreferences: {
      preload: join(currentDir, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.CHEMVAULT_DESKTOP_DEV_URL!);
  } else {
    await mainWindow.loadFile(join(currentDir, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  installMenu();
  registerIpc();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

function installMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: "File", submenu: [{ label: "New Folder", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.webContents.send("menu:new-folder") }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "selectAll" }, { role: "copy" }, { role: "paste" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Account", submenu: [{ label: "Sign Out", click: () => mainWindow?.webContents.send("menu:sign-out") }] },
    { label: "Help", submenu: [{ label: "ChemVault Files", click: () => shell.openExternal("https://file.chemvault.science/files") }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("auth:login", async () => startLogin());
  ipcMain.handle("auth:getTokens", async () => readTokens());
  ipcMain.handle("auth:setTokens", async (_event, tokens) => writeTokens(tokens));
  ipcMain.handle("auth:clear", async () => clearTokens());
  ipcMain.handle("dialog:openFiles", async () => openFiles());
  ipcMain.handle("dialog:saveFile", async (_event, input: { defaultPath: string; bytes: ArrayBuffer }) => saveFile(input));
  ipcMain.handle("notify", async (_event, input: { title: string; body: string }) => {
    if (Notification.isSupported()) new Notification(input).show();
  });
  ipcMain.handle("update:check", async () => {
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: updateFeedUrl });
      const result = await autoUpdater.checkForUpdates();
      return { status: "checked", updateInfo: result?.updateInfo ?? null };
    } catch (error) {
      return { status: "unavailable", message: error instanceof Error ? error.message : "Update check failed" };
    }
  });
}

async function startLogin() {
  const loginUrl = new URL("/api/app/auth/login", apiBaseUrl);
  loginUrl.searchParams.set("redirect_uri", "chemvaultfiles://auth");

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      title: "Sign in to ChemVault Files",
      parent: mainWindow ?? undefined,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    const finish = async (url: string) => {
      const parsed = new URL(url);
      const tokens = {
        accessToken: parsed.searchParams.get("access_token") || "",
        refreshToken: parsed.searchParams.get("refresh_token") || "",
        tokenType: parsed.searchParams.get("token_type") || "Bearer",
        expiresIn: Number(parsed.searchParams.get("expires_in") || 3600),
        refreshExpiresIn: Number(parsed.searchParams.get("refresh_expires_in") || 2592000),
        user: { email: parsed.searchParams.get("email") || "" }
      };
      if (!tokens.accessToken || !tokens.refreshToken) throw new Error("Login did not return a session token.");
      await writeTokens(tokens);
      authWindow.close();
      resolve(tokens);
    };

    authWindow.webContents.on("will-redirect", (event, url) => {
      if (url.startsWith("chemvaultfiles://auth")) {
        event.preventDefault();
        finish(url).catch(reject);
      }
    });
    authWindow.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("chemvaultfiles://auth")) {
        event.preventDefault();
        finish(url).catch(reject);
      }
    });
    authWindow.on("closed", () => resolve(null));
    authWindow.loadURL(loginUrl.toString()).catch(reject);
  });
}

async function openFiles() {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile", "multiSelections"]
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(async (filePath) => {
    const data = await readFile(filePath);
    return {
      name: filePath.split(/[\\/]/).pop() || "file",
      path: filePath,
      size: data.byteLength,
      bytes: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    };
  }));
}

async function saveFile(input: { defaultPath: string; bytes: ArrayBuffer }) {
  const options: Electron.SaveDialogOptions = {
    defaultPath: input.defaultPath
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, Buffer.from(input.bytes));
  return result.filePath;
}

async function tokenFilePath() {
  const dir = join(app.getPath("userData"), "secure");
  await mkdir(dir, { recursive: true });
  return join(dir, "session.bin");
}

async function readTokens() {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure token storage is unavailable.");
    const encrypted = await readFile(await tokenFilePath());
    const json = safeStorage.decryptString(encrypted);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function writeTokens(tokens: unknown) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure token storage is unavailable on this device.");
  }
  const json = JSON.stringify(tokens);
  const payload = safeStorage.encryptString(json);
  await writeFile(await tokenFilePath(), payload);
  return true;
}

async function clearTokens() {
  await rm(await tokenFilePath(), { force: true });
  return true;
}
