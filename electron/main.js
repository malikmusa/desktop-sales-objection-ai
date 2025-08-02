// electron/main.js

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
} = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let audioCapture;

const isDevelopment = process.env.NODE_ENV === 'development';
const isPackaged = app.isPackaged;

// SIMPLE: Just use the working paths
let buildPath;
let preloadPath;
let audioCaptureModulePath;

if (isPackaged) {
  // In packaged app, we're in app.asar
  buildPath = path.join(__dirname, '..', 'build');
  preloadPath = path.join(__dirname, 'preload.js');
  audioCaptureModulePath = path.join(__dirname, 'audio-capture.js');
} else {
  // In development
  buildPath = path.join(__dirname, '../build');
  preloadPath = path.join(__dirname, 'preload.js');
  audioCaptureModulePath = path.join(__dirname, 'audio-capture.js');
}

console.log('=== PATHS ===');
console.log('isPackaged:', isPackaged);
console.log('buildPath:', buildPath);
console.log('preloadPath:', preloadPath);
console.log('Build exists:', fs.existsSync(buildPath));
console.log('Preload exists:', fs.existsSync(preloadPath));
console.log(
  'Index.html exists:',
  fs.existsSync(path.join(buildPath, 'index.html'))
);
console.log('================');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
    },
    title: 'Real-Time Transcriber',
    show: false,
    autoHideMenuBar: true,
  });

  const startUrl = 'http://localhost:3000';
  // const startUrl = `file://${path.join(buildPath, 'index.html')}`;
  console.log('Loading URL:', startUrl);

  mainWindow.loadURL(startUrl);

  // Error handling
  mainWindow.webContents.on(
    'did-fail-load',
    (event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load:', validatedURL);
      console.error('Error:', errorCode, errorDescription);
    }
  );

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Page loaded successfully');
    mainWindow.webContents.executeJavaScript(`
      console.log('electronAPI available:', !!window.electronAPI);
      console.log('electronAPI methods:', window.electronAPI ? Object.keys(window.electronAPI) : 'none');
    `);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDevelopment) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle permissions for screen capture
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = ['media', 'display-capture', 'audio-capture'];
      callback(allowedPermissions.includes(permission));
    }
  );

  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (request, callback) => {
      callback({ video: request.video, audio: request.audio });
    }
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize audio capture
  try {
    if (fs.existsSync(audioCaptureModulePath)) {
      const AudioCapture = require(audioCaptureModulePath);
      audioCapture = new AudioCapture();
      console.log('✅ AudioCapture loaded');
    } else {
      console.log('⚠️ Using fallback audio capture');
      audioCapture = createFallbackAudioCapture();
    }
  } catch (error) {
    console.error('❌ AudioCapture error:', error);
    audioCapture = createFallbackAudioCapture();
  }
}

function createFallbackAudioCapture() {
  return {
    getAudioDevices: async () => [
      {
        id: 'browser-capture',
        name: '📺 Desktop Screen Capture (With Audio) ⭐',
        type: 'browser',
        isDefault: true,
      },
      {
        id: 'microphone-test',
        name: '🎤 Test with Microphone',
        type: 'input',
      },
    ],
    startCapture: async (deviceId) => ({
      success: true,
      useBrowserCapture: true,
    }),
    stopCapture: async () => ({ success: true }),
  };
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-audio-devices', async () => {
  try {
    return await audioCapture.getAudioDevices();
  } catch (error) {
    console.error('get-audio-devices error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-desktop-sources', async () => {
  try {
    console.log('Getting desktop sources...');
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 },
    });
    console.log('Found', sources.length, 'desktop sources');
    return sources;
  } catch (error) {
    console.error('get-desktop-sources error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('start-audio-capture', async (event, deviceId) => {
  try {
    const result = await audioCapture.startCapture(deviceId, (audioData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio-data', audioData);
      }
    });
    return result;
  } catch (error) {
    console.error('start-audio-capture error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('stop-audio-capture', async () => {
  try {
    return await audioCapture.stopCapture();
  } catch (error) {
    console.error('stop-audio-capture error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('show-error-dialog', async (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.handle('show-info-dialog', async (event, title, content) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: title,
    message: content,
    buttons: ['OK'],
  });
});

// Handle app events
app.on('before-quit', () => {
  if (audioCapture) {
    audioCapture.stopCapture();
  }
});

// Security
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    require('electron').shell.openExternal(navigationUrl);
  });

  contents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
});
