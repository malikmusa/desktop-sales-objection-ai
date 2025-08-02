import React, { useState, useRef, useEffect } from 'react';

class AudioCaptureEngine {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.isRecording = false;
    this.deepgramSocket = null;
    this.onTranscriptCallback = null;
  }

  async startCapture(settings, onTranscript) {
    try {
      this.onTranscriptCallback = onTranscript;

      // Get audio devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(
        (device) => device.kind === 'audioinput'
      );

      console.log(
        'Available audio devices:',
        audioDevices.map((d) => d.label)
      );

      // Find VB-Audio Cable or similar virtual audio device
      const virtualDevice = audioDevices.find(
        (device) =>
          device.label.toLowerCase().includes('cable') ||
          device.label.toLowerCase().includes('vb-audio') ||
          device.label.toLowerCase().includes('virtual') ||
          device.label.toLowerCase().includes('blackhole') ||
          device.label.toLowerCase().includes('loopback')
      );

      if (!virtualDevice) {
        throw new Error(
          'Virtual audio device not found. Please install VB-Audio Cable or similar virtual audio driver.'
        );
      }

      console.log('Using virtual audio device:', virtualDevice.label);

      // Request audio stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: virtualDevice.deviceId,
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Create audio context
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: 16000,
      });

      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create source and processor
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Set up Deepgram connection if API key provided
      if (settings.deepgramApiKey) {
        this.initDeepgram(settings);
      }

      // Handle audio data
      this.processor.onaudioprocess = (event) => {
        if (this.isRecording) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);

          // Convert to Int16Array for Deepgram
          const int16Array = this.float32ToInt16(inputData);

          // Send to Deepgram if connected
          if (
            this.deepgramSocket &&
            this.deepgramSocket.readyState === WebSocket.OPEN
          ) {
            this.deepgramSocket.send(int16Array.buffer);
          } else {
            // Fallback: simulate transcription for demo
            this.simulateTranscription(inputData);
          }
        }
      };

      // Connect audio nodes
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isRecording = true;
      console.log('Audio capture started successfully');
      return { success: true };
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  }

  stopCapture() {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.deepgramSocket) {
      this.deepgramSocket.close();
      this.deepgramSocket = null;
    }

    console.log('Audio capture stopped');
    return { success: true };
  }

  initDeepgram(settings) {
    const { deepgramApiKey, selectedModel, language } = settings;

    try {
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=${selectedModel}&language=${language}&encoding=linear16&sample_rate=16000&channels=1&interim_results=true`;

      this.deepgramSocket = new WebSocket(wsUrl, ['token', deepgramApiKey]);

      this.deepgramSocket.onopen = () => {
        console.log('Deepgram WebSocket connected');
      };

      this.deepgramSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (
            data.channel &&
            data.channel.alternatives &&
            data.channel.alternatives[0]
          ) {
            const transcript = data.channel.alternatives[0].transcript;
            const confidence = data.channel.alternatives[0].confidence;

            if (
              transcript &&
              transcript.trim() &&
              confidence >= settings.confidenceThreshold
            ) {
              if (this.onTranscriptCallback) {
                this.onTranscriptCallback(transcript);
              }
            }
          }
        } catch (error) {
          console.error('Error parsing Deepgram response:', error);
        }
      };

      this.deepgramSocket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
      };

      this.deepgramSocket.onclose = () => {
        console.log('Deepgram WebSocket disconnected');
      };
    } catch (error) {
      console.error('Error initializing Deepgram:', error);
    }
  }

  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      int16Array[i] = Math.max(
        -32768,
        Math.min(32767, float32Array[i] * 32768)
      );
    }
    return int16Array;
  }

  // Simulate transcription for demo purposes when no API key
  simulateTranscription(audioData) {
    // Check if there's actual audio (not silence)
    const audioLevel = this.calculateAudioLevel(audioData);

    if (audioLevel > 0.01) {
      // Threshold for detecting speech
      // Simulate random demo phrases
      const demoPhrase = this.getRandomDemoPhrase();

      // Throttle demo output
      if (!this.lastDemoTime || Date.now() - this.lastDemoTime > 3000) {
        this.lastDemoTime = Date.now();

        if (this.onTranscriptCallback) {
          this.onTranscriptCallback(demoPhrase);
        }
      }
    }
  }

  calculateAudioLevel(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  getRandomDemoPhrase() {
    const demoPhrases = [
      'That sounds too expensive for our budget',
      'I need to think about it and discuss with my team',
      "We're already working with another vendor",
      "I'm not sure this is the right fit for us",
      'Can you call me back next month?',
      "We don't have budget approved for this year",
      'I need to see more features before deciding',
    ];

    return demoPhrases[Math.floor(Math.random() * demoPhrases.length)];
  }
}

const AudioCapture = ({
  isCapturing,
  onStartCapture,
  onStopCapture,
  onNewTranscript,
  settings,
}) => {
  const [audioEngine] = useState(() => new AudioCaptureEngine());
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const handleStart = async () => {
    try {
      setError('');
      await audioEngine.startCapture(settings, onNewTranscript);
      onStartCapture();
    } catch (error) {
      setError(error.message);
      console.error('Start capture error:', error);
    }
  };

  const handleStop = async () => {
    try {
      await audioEngine.stopCapture();
      onStopCapture();
      setError('');
    } catch (error) {
      setError(error.message);
      console.error('Stop capture error:', error);
    }
  };

  return (
    <div className="audio-capture">
      <div className="capture-controls">
        {!isCapturing ? (
          <button
            className="start-button"
            onClick={handleStart}
            disabled={
              !settings.deepgramApiKey && process.env.NODE_ENV === 'production'
            }
          >
            🎤 Start Listening
          </button>
        ) : (
          <button className="stop-button" onClick={handleStop}>
            ⏹️ Stop Listening
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!settings.deepgramApiKey && (
        <div className="demo-mode-notice">
          <span className="demo-icon">🔄</span>
          <span>
            Demo Mode - Add Deepgram API key in settings for real transcription
          </span>
        </div>
      )}

      {isCapturing && (
        <div className="audio-indicator">
          <div className="audio-bars">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
          </div>
          <span>Listening to system audio...</span>
        </div>
      )}
    </div>
  );
};

export default AudioCapture;
