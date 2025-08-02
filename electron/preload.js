// electron/preload.js

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script starting...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // Audio device management
    getAudioDevices: () => {
      console.log('getAudioDevices called');
      return ipcRenderer.invoke('get-audio-devices');
    },

    // Desktop capture - REQUIRED BY YOUR REACT APP
    getDesktopSources: () => {
      console.log('getDesktopSources called');
      return ipcRenderer.invoke('get-desktop-sources');
    },

    // Audio capture - REQUIRED BY YOUR REACT APP
    startAudioCapture: (deviceId) => {
      console.log('startAudioCapture called with deviceId:', deviceId);
      return ipcRenderer.invoke('start-audio-capture', deviceId);
    },

    stopAudioCapture: () => {
      console.log('stopAudioCapture called');
      return ipcRenderer.invoke('stop-audio-capture');
    },

    // Audio data listener - REQUIRED BY YOUR REACT APP
    onAudioData: (callback) => {
      console.log('onAudioData listener registered');
      ipcRenderer.on('audio-data', (event, data) => {
        console.log('Audio data received:', data.byteLength, 'bytes');
        callback(data);
      });
    },

    removeAudioDataListener: () => {
      console.log('removeAudioDataListener called');
      ipcRenderer.removeAllListeners('audio-data');
    },

    // Dialog helpers
    showErrorDialog: (title, content) =>
      ipcRenderer.invoke('show-error-dialog', title, content),
    showInfoDialog: (title, content) =>
      ipcRenderer.invoke('show-info-dialog', title, content),

    // App info
    isElectron: true,
    platform: process.platform,
  });

  console.log('electronAPI exposed successfully');
} catch (error) {
  console.error('Error exposing electronAPI:', error);
}

// Add console logging for debugging
window.addEventListener('DOMContentLoaded', () => {
  console.log('Electron preload script loaded');
  console.log('Platform:', process.platform);
  console.log('Electron APIs exposed:', Object.keys(window.electronAPI || {}));
});
