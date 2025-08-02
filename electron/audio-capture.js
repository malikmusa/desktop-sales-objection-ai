// electron/audio-capture.js

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class AudioCapture {
  constructor() {
    this.isCapturing = false;
    this.audioProcess = null;
    this.audioCallback = null;
  }

  async getAudioDevices() {
    console.log('Getting audio devices...');
    return this.getFallbackDevices();
  }

  getFallbackDevices() {
    console.log('Using fallback devices for platform:', process.platform);

    return [
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
        isDefault: false,
      },
    ];
  }

  async startCapture(deviceId, audioCallback) {
    console.log('Starting audio capture for device:', deviceId);

    if (this.isCapturing) {
      throw new Error('Audio capture is already running');
    }

    this.audioCallback = audioCallback;

    if (deviceId === 'browser-capture') {
      return this.startBrowserCapture();
    } else if (deviceId === 'microphone-test') {
      return this.startMicrophoneTest();
    } else if (deviceId === 'system-audio') {
      return this.startSystemAudioCapture();
    } else {
      throw new Error(
        'Unsupported device type. Please use Desktop Screen Capture.'
      );
    }
  }

  async startBrowserCapture() {
    return new Promise((resolve) => {
      // This will be handled by the React frontend
      console.log('Browser capture mode selected - frontend will handle this');
      this.isCapturing = true;
      resolve({
        success: true,
        message: 'Browser capture mode - handle in frontend',
        useBrowserCapture: true,
      });
    });
  }

  async startMicrophoneTest() {
    return new Promise((resolve) => {
      // This will be handled by the React frontend using getUserMedia
      console.log('Microphone test mode selected - frontend will handle this');
      this.isCapturing = true;
      resolve({
        success: true,
        message: 'Microphone test mode - handle in frontend',
        useMicrophoneTest: true,
      });
    });
  }

  async startSystemAudioCapture() {
    return new Promise((resolve) => {
      // This is a placeholder for system audio capture
      // In practice, this would use Windows APIs or return browser capture
      console.log(
        'System audio capture mode selected - fallback to browser handling'
      );
      this.isCapturing = true;
      resolve({
        success: true,
        message: 'System audio capture mode - handle in frontend',
        useSystemAudio: true,
      });
    });
  }

  async stopCapture() {
    console.log('Stopping audio capture...');

    if (!this.isCapturing) {
      return { success: true, message: 'Audio capture was not running' };
    }

    this.isCapturing = false;
    this.audioCallback = null;

    return { success: true, message: 'Audio capture stopped' };
  }
}

module.exports = AudioCapture;
