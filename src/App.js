import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// StreamingText component for ChatGPT-like streaming effect
const StreamingText = ({ text, showCursor = false }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const timeoutRef = useRef(null);
  const lastTextRef = useRef('');
  const streamingIndexRef = useRef(0);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (text !== lastTextRef.current) {
      const previousText = lastTextRef.current;
      const newText = text;

      if (
        newText.length > previousText.length &&
        newText.startsWith(previousText)
      ) {
        setIsStreaming(true);
        const newContent = newText.slice(previousText.length);
        setDisplayedText(previousText);
        streamingIndexRef.current = 0;

        const streamChars = () => {
          if (streamingIndexRef.current < newContent.length) {
            const currentStreamedText =
              previousText + newContent.slice(0, streamingIndexRef.current + 1);
            setDisplayedText(currentStreamedText);
            streamingIndexRef.current++;
            timeoutRef.current = setTimeout(streamChars, 25);
          } else {
            setIsStreaming(false);
            setDisplayedText(newText);
          }
        };

        if (newContent.length > 0) {
          streamChars();
        } else {
          setIsStreaming(false);
          setDisplayedText(newText);
        }
      } else {
        setDisplayedText(newText);
        setIsStreaming(false);
      }

      lastTextRef.current = newText;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text]);

  useEffect(() => {
    if (!displayedText && text) {
      setDisplayedText(text);
      lastTextRef.current = text;
    }
  }, [text, displayedText]);

  return (
    <span style={{ display: 'inline' }}>
      {displayedText}
      {(isStreaming || showCursor) && (
        <span className="streaming-cursor">▋</span>
      )}
    </span>
  );
};

// Sales Suggestions Panel Component
const SalesSuggestionsPanel = ({
  conversation,
  isAnalyzing,
  onClose,
  openaiApiKey,
  setIsAnalyzing,
  isListening,
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [error, setError] = useState('');
  const [lastAnalyzedLength, setLastAnalyzedLength] = useState(0);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const analysisTimeoutRef = useRef(null);
  const lastAnalysisTimeRef = useRef(0);

  // Real-time analysis effect
  useEffect(() => {
    if (!isListening || !conversation || !openaiApiKey) {
      return;
    }

    const conversationLength = conversation.length;
    const minInterval = 5000; // Minimum 5 seconds between analyses
    const minNewContent = 50; // Minimum 50 characters of new content
    const now = Date.now();

    // Check if we have enough new content and enough time has passed
    const hasEnoughNewContent =
      conversationLength > lastAnalyzedLength + minNewContent;
    const hasEnoughTimePassed = now - lastAnalysisTimeRef.current > minInterval;

    if (hasEnoughNewContent && hasEnoughTimePassed) {
      // Clear existing timeout
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }

      // Set timeout for analysis (debounce)
      analysisTimeoutRef.current = setTimeout(() => {
        analyzeConversation();
      }, 2000); // 2 second debounce
    }

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
      }
    };
  }, [conversation, openaiApiKey, isListening, lastAnalyzedLength]);

  // Error handling for missing API key
  useEffect(() => {
    if (isListening && !openaiApiKey) {
      setError(
        'OpenAI API key required for real-time analysis. Please configure in Settings.'
      );
    } else if (openaiApiKey) {
      setError('');
    }
  }, [isListening, openaiApiKey]);

  const analyzeConversation = async () => {
    if (!conversation || !openaiApiKey || !isListening) return;

    const now = Date.now();
    if (now - lastAnalysisTimeRef.current < 2000) {
      // Prevent too frequent calls
      return;
    }

    setError('');
    setIsAnalyzing(true);
    lastAnalysisTimeRef.current = now;

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `You are a real-time AI sales coach providing INSTANT analysis during live sales conversations.

CONTEXT: This is a LIVE conversation happening RIGHT NOW. The salesperson needs immediate, actionable guidance to influence the client's decision in real-time.

CONVERSATION FORMAT:
- "Client:" = prospect/client speaking
- "You:" = salesperson speaking


**Behavior Rules:**
- Don’t write messages for the client or salesperson — only give suggestions after the client speaks.
- Keep suggestions short (1–2 lines) and conversational.
- Use simple, human language. Avoid sounding robotic.
- Stay neutral and non-pushy, but persuasive and helpful.
- Never use technical jargon unless the client uses it first.

---

**Trigger Words to Watch For (examples):**
“not sure,” “too expensive,” “need to think,” “I already have,” “I’ll talk to my partner,” “maybe later,” “sounds interesting but…,” “let me think about it,” “I can’t afford that right now,” “we’re on a tight budget,” “we need to get quotes from others,” “this isn’t the right time,” “we’re not ready yet,” “check back with us next quarter,” “I still have questions,” “I don’t know if this will work for us,” “I need more time to decide,” “I need to check with my boss,” “my manager makes the final decision,” “we already have a vendor,” “we’re happy with our current provider,” “we built something in-house,” “this doesn’t seem like a priority,” “it’s not what we’re looking for,” “can you send me a proposal?” “just send me an email,” “thanks, but we’re good,” “circle back in a few months”

---

Now start listening for the conversation.

Respond **only when the client says something**. Wait for client input and suggest what the salesperson should say in response.

Return analysis in this JSON format:
{
  "suggestedResponses": [
    {
      "situation": "when client says X",
      "response": "exact phrase/question to use",
      "outcome": "expected result"
    }
  ]
}
+ Do not include any markdown formatting, Only return raw JSON.`,
              },
              {
                role: 'user',
                content: `LIVE SALES CONVERSATION (analyze for immediate action):

${conversation}

Provide instant analysis focusing on what the salesperson should do RIGHT NOW to influence this client's decision.`,
              },
            ],
            max_tokens: 1000,
            temperature: 0.2,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const analysis = data.choices[0]?.message?.content || '{}';

      try {
        const cleaned = analysis
          .trim()
          .replace(/^```json/, '')
          .replace(/^```/, '')
          .replace(/```$/, '');

        const parsedAnalysis = JSON.parse(cleaned);

        console.log('parsedAnalysis', parsedAnalysis);

        // Store analysis history for reference
        setAnalysisHistory((prev) => [
          ...prev.slice(-4), // Keep last 5 analyses
          {
            timestamp: new Date(),
            suggestedResponses: parsedAnalysis?.suggestedResponses || [],
          },
        ]);
      } catch (parseError) {
        console.error('Error parsing analysis:', parseError);
        setError('Failed to parse AI analysis');
      }

      setIsAnalyzing(false);
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      setError(`Analysis failed: ${error.message}`);
      setIsAnalyzing(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical':
        return '#ff0000';
      case 'High':
        return '#ff4444';
      case 'Medium':
        return '#ff8800';
      case 'Low':
        return '#4CAF50';
      default:
        return '#666';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'Critical':
        return '🚨';
      case 'High':
        return '⚡';
      case 'Medium':
        return '⚠️';
      case 'Low':
        return '💡';
      default:
        return '📝';
    }
  };

  const getLatestInsights = () => {
    if (analysisHistory.length === 0) return null;
    return analysisHistory[analysisHistory.length - 1];
  };

  const latestInsights = getLatestInsights();

  return (
    <div className="sales-suggestions-panel">
      <div className="panel-header">
        <h3>🎯 Live Sales Coach</h3>
        <div className="panel-controls">
          <div className="live-status">
            {isListening && isAnalyzing && (
              <span className="analyzing-badge">🔴 Analyzing...</span>
            )}
            {isListening && !isAnalyzing && (
              <span className="live-badge">✅ Live</span>
            )}
          </div>
          <button
            onClick={analyzeConversation}
            className="refresh-btn"
            title="Force Analysis"
            disabled={!openaiApiKey || isAnalyzing || !isListening}
          >
            🔄
          </button>
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        </div>
      </div>

      <div className="panel-content">
        {!openaiApiKey && (
          <div className="no-api-key">
            <p>⚙️ OpenAI API key required for real-time sales coaching.</p>
            <p>Configure your API key in Settings to get live assistance.</p>
          </div>
        )}

        {!isListening && openaiApiKey && (
          <div className="not-listening">
            <p>
              🎤 Start the conversation analysis to get real-time sales
              coaching.
            </p>
            <p>
              I'll analyze the conversation as it happens and provide instant
              suggestions.
            </p>
          </div>
        )}

        {isAnalyzing && openaiApiKey && (
          <div className="loading-analysis">
            <div className="loading-spinner"></div>
            <p>Analyzing conversation for immediate insights...</p>
          </div>
        )}

        {error && (
          <div className="analysis-error">
            <p>❌ {error}</p>
            {openaiApiKey && isListening && (
              <button
                onClick={analyzeConversation}
                className="retry-btn"
                disabled={isAnalyzing}
              >
                Retry Analysis
              </button>
            )}
          </div>
        )}

        {/* Suggested Responses Section */}
        {latestInsights && latestInsights.suggestedResponses.length > 0 && (
          <div className="responses-section">
            <h4>💬 Smart Responses</h4>
            <div className="responses-list">
              {latestInsights.suggestedResponses.map((response, index) => (
                <div key={index} className="response-item">
                  <p className="response-situation">
                    <strong>If client says:</strong> "{response.situation}"
                  </p>
                  <p className="response-text">
                    <strong>You respond:</strong> "{response.response}"
                  </p>
                  <p className="response-outcome">
                    <strong>Expected outcome:</strong> {response.outcome}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isListening &&
          !suggestions.length &&
          !obligations.length &&
          !isAnalyzing &&
          !error &&
          openaiApiKey && (
            <div className="waiting-for-content">
              <p>🎧 Listening to your conversation...</p>
              <p>
                I'll provide real-time coaching as the conversation develops.
              </p>
              <p>Keep talking - insights coming soon!</p>
            </div>
          )}
      </div>
    </div>
  );
};

function App() {
  const [isListening, setIsListening] = useState(false);
  const [clientTranscript, setClientTranscript] = useState('');
  const [yourTranscript, setYourTranscript] = useState('');
  const [combinedConversation, setCombinedConversation] = useState('');
  const [error, setError] = useState('');
  const [audioStatus, setAudioStatus] = useState('Ready');
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isElectron, setIsElectron] = useState(false);
  const [currentClientInterim, setCurrentClientInterim] = useState('');
  const [currentYourInterim, setCurrentYourInterim] = useState('');
  const [clientAccumulatedText, setClientAccumulatedText] = useState('');
  const [yourAccumulatedText, setYourAccumulatedText] = useState('');
  const [hasStartedTranscription, setHasStartedTranscription] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  // New states for unified conversation display
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [lastClientFinal, setLastClientFinal] = useState('');
  const [lastYourFinal, setLastYourFinal] = useState('');

  // Separate WebSocket connections for client and microphone
  const clientSocketRef = useRef(null);
  const micSocketRef = useRef(null);
  const audioListenerRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const conversationEndRef = useRef(null);

  // Check if running in Electron
  useEffect(() => {
    const checkElectron = () => {
      const isElectronEnv =
        window.electronAPI ||
        window.process?.type === 'renderer' ||
        window.navigator?.userAgent?.indexOf('Electron') !== -1 ||
        window.require;

      if (isElectronEnv) {
        setIsElectron(true);
        setTimeout(() => {
          if (window.electronAPI) {
            loadAudioDevices();
            audioListenerRef.current = (audioData) => {
              if (
                clientSocketRef.current &&
                clientSocketRef.current.readyState === WebSocket.OPEN
              ) {
                clientSocketRef.current.send(audioData);
              }
            };
            window.electronAPI.onAudioData(audioListenerRef.current);
          }
        }, 300);
      } else {
        setIsElectron(false);
        setError('This app must be run as an Electron desktop application');
      }
    };

    checkElectron();

    const savedKey = localStorage.getItem('deepgramApiKey');
    if (savedKey) {
      setDeepgramApiKey(savedKey);
    }

    const savedOpenaiKey = localStorage.getItem('openaiApiKey');
    if (savedOpenaiKey) {
      setOpenaiApiKey(savedOpenaiKey);
    }

    return () => {
      if (window.electronAPI && audioListenerRef.current) {
        window.electronAPI.removeAudioDataListener();
      }
    };
  }, []);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory, currentClientInterim, currentYourInterim]);

  // Handle final transcripts and update conversation history
  useEffect(() => {
    if (clientAccumulatedText !== lastClientFinal) {
      if (clientAccumulatedText && clientAccumulatedText.trim()) {
        const newText = clientAccumulatedText
          .replace(lastClientFinal, '')
          .trim();
        if (newText) {
          setConversationHistory((prev) => [
            ...prev,
            { speaker: 'Client', text: newText, timestamp: new Date() },
          ]);
        }
      }
      setLastClientFinal(clientAccumulatedText);
    }
  }, [clientAccumulatedText, lastClientFinal]);

  useEffect(() => {
    if (yourAccumulatedText !== lastYourFinal) {
      if (yourAccumulatedText && yourAccumulatedText.trim()) {
        const newText = yourAccumulatedText.replace(lastYourFinal, '').trim();
        if (newText) {
          setConversationHistory((prev) => [
            ...prev,
            { speaker: 'You', text: newText, timestamp: new Date() },
          ]);
        }
      }
      setLastYourFinal(yourAccumulatedText);
    }
  }, [yourAccumulatedText, lastYourFinal]);

  // Update combined conversation for analysis
  useEffect(() => {
    let combined = '';

    // Add finalized conversation history
    conversationHistory.forEach((entry) => {
      combined += `${entry.speaker}: ${entry.text}\n\n`;
    });

    // Add current interim text if any
    if (currentClientInterim && currentClientInterim.trim()) {
      combined += `Client: ${currentClientInterim.trim()}\n\n`;
    }
    if (currentYourInterim && currentYourInterim.trim()) {
      combined += `You: ${currentYourInterim.trim()}\n\n`;
    }

    setCombinedConversation(combined);
  }, [conversationHistory, currentClientInterim, currentYourInterim]);

  const loadAudioDevices = async () => {
    try {
      setAudioStatus('Loading audio devices...');
      const devices = await window.electronAPI.getAudioDevices();

      if (devices.error) {
        setError(`Failed to load audio devices: ${devices.error}`);
        return;
      }

      setAudioDevices(devices);
      const defaultDevice = devices.find((d) => d.isDefault) || devices[0];
      if (defaultDevice) {
        setSelectedDevice(defaultDevice.id);
      }
      setAudioStatus('Audio devices loaded');
    } catch (error) {
      console.error('Error loading audio devices:', error);
      setError(`Error loading audio devices: ${error.message}`);
    }
  };

  const setupAudioProcessing = async (stream, isClientAudio = true) => {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: 16000,
      });

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        const targetSocket = isClientAudio
          ? clientSocketRef.current
          : micSocketRef.current;

        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);

          const int16Array = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Array[i] = Math.max(
              -32768,
              Math.min(32767, inputData[i] * 32768)
            );
          }

          targetSocket.send(int16Array.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      if (isClientAudio) {
        audioContextRef.current = audioContext;
        processorRef.current = processor;
        streamRef.current = stream;
      }

      return true; // Return success
    } catch (error) {
      console.error('Audio processing setup failed:', error);
      throw error;
    }
  };

  const initializeDeepgramConnection = (isClient = true) => {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true`;

        const socket = new WebSocket(wsUrl, ['token', deepgramApiKey.trim()]);

        socket.onopen = () => {
          console.log(
            `Deepgram WebSocket connected for ${
              isClient ? 'CLIENT AUDIO (System/Desktop)' : 'YOUR MICROPHONE'
            }`
          );
          resolve();
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (
              data.channel &&
              data.channel.alternatives &&
              data.channel.alternatives[0]
            ) {
              const transcriptText = data.channel.alternatives[0].transcript;
              const isFinal = data.is_final;

              if (transcriptText && transcriptText.trim()) {
                if (!hasStartedTranscription) {
                  setHasStartedTranscription(true);
                }

                // IMPORTANT: isClient determines the audio source, not the order of speech
                if (isClient) {
                  // This is ALWAYS client audio (system/desktop capture)
                  console.log(
                    `CLIENT AUDIO: ${transcriptText} (Final: ${isFinal})`
                  );
                  if (isFinal) {
                    setClientAccumulatedText((prev) => {
                      const newText = transcriptText.trim();
                      return prev ? prev + ' ' + newText : newText;
                    });
                    setCurrentClientInterim('');
                  } else {
                    setCurrentClientInterim(transcriptText.trim());
                  }
                } else {
                  // This is ALWAYS your microphone audio
                  console.log(
                    `YOUR MIC: ${transcriptText} (Final: ${isFinal})`
                  );
                  if (isFinal) {
                    setYourAccumulatedText((prev) => {
                      const newText = transcriptText.trim();
                      return prev ? prev + ' ' + newText : newText;
                    });
                    setCurrentYourInterim('');
                  } else {
                    setCurrentYourInterim(transcriptText.trim());
                  }
                }
              }
            }
          } catch (parseError) {
            console.error('Error parsing Deepgram response:', parseError);
          }
        };

        socket.onerror = (error) => {
          console.error(
            `Deepgram WebSocket error for ${
              isClient ? 'client' : 'microphone'
            }:`,
            error
          );
          reject(error);
        };

        socket.onclose = (event) => {
          console.log(
            `Deepgram WebSocket closed for ${
              isClient ? 'client' : 'microphone'
            }:`,
            event.code,
            event.reason
          );
        };

        if (isClient) {
          clientSocketRef.current = socket;
        } else {
          micSocketRef.current = socket;
        }

        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            reject(
              new Error(
                `Deepgram connection timeout for ${
                  isClient ? 'client' : 'microphone'
                }`
              )
            );
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  };

  const startListening = async () => {
    console.log('=== START BUTTON CLICKED ===');

    try {
      setError('');
      setAudioStatus('Starting...');

      // Clear all transcript states
      setClientTranscript('');
      setYourTranscript('');
      setClientAccumulatedText('');
      setYourAccumulatedText('');
      setCurrentClientInterim('');
      setCurrentYourInterim('');
      setCombinedConversation('');
      setConversationHistory([]);
      setCurrentSpeaker(null);
      setLastClientFinal('');
      setLastYourFinal('');
      setHasStartedTranscription(false);

      if (!deepgramApiKey.trim()) {
        setError('Please enter your Deepgram API key first (click Settings)');
        return;
      }

      setIsListening(true);

      // Handle browser-capture for desktop audio (CLIENT AUDIO)
      if (selectedDevice === 'browser-capture') {
        console.log('=== USING DESKTOP CAPTURE FOR CLIENT AUDIO ===');
        setAudioStatus('Getting available screens and windows...');

        try {
          const sources = await window.electronAPI.getDesktopSources();

          if (!sources || sources.length === 0) {
            throw new Error('No screen sources available');
          }

          const primarySource =
            sources.find((source) => source.name === 'Entire Screen') ||
            sources[0];

          setAudioStatus('Accessing screen capture...');

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: primarySource.id,
              },
            },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: primarySource.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
              },
            },
          });

          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length === 0) {
            stream.getTracks().forEach((track) => track.stop());

            console.log('=== FALLBACK TO ELECTRON AUDIO CAPTURE ===');
            const result = await window.electronAPI.startAudioCapture(
              'system-audio'
            );
            if (result.success) {
              console.log('=== INITIALIZING CLIENT DEEPGRAM CONNECTION ===');
              await initializeDeepgramConnection(true); // TRUE = Client audio
              setAudioStatus(
                '✅ Desktop capture active - starting microphone...'
              );
            } else {
              throw new Error(
                'Could not access desktop audio. Please enable system audio sharing.'
              );
            }
          } else {
            console.log('=== DESKTOP CAPTURE SUCCESSFUL ===');
            setAudioStatus('Processing desktop audio...');
            console.log('=== INITIALIZING CLIENT DEEPGRAM CONNECTION ===');
            await initializeDeepgramConnection(true); // TRUE = Client audio
            await setupAudioProcessing(stream, true); // TRUE = client audio
            setAudioStatus(
              '✅ Desktop capture active - starting microphone...'
            );
          }

          // CRITICAL: Start microphone for YOUR voice with delay
          console.log('=== SCHEDULING MICROPHONE SETUP ===');
          setTimeout(async () => {
            try {
              console.log('=== STARTING MICROPHONE FOR YOUR VOICE ===');
              await startMicrophoneCapture();
              setAudioStatus(
                '✅ Live conversation analysis active (Desktop + Mic)'
              );
            } catch (micError) {
              console.error('Microphone setup failed:', micError);
              setAudioStatus(
                '✅ Live conversation analysis active (Desktop only)'
              );
            }
          }, 2000); // 2 second delay

          console.log('=== DESKTOP CAPTURE + MICROPHONE SETUP INITIATED ===');
          return;
        } catch (desktopCaptureError) {
          console.error('Desktop capture failed:', desktopCaptureError);
          setError(`Desktop capture failed: ${desktopCaptureError.message}`);
          setIsListening(false);
          return;
        }
      }

      // Handle microphone-test for testing (CLIENT AUDIO via mic)
      if (selectedDevice === 'microphone-test') {
        console.log('=== USING MICROPHONE TEST MODE ===');
        setAudioStatus('Requesting microphone access...');

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });

          console.log('=== MIC TEST: INITIALIZING CLIENT DEEPGRAM ===');
          setAudioStatus('Processing microphone audio...');
          await initializeDeepgramConnection(true); // TRUE = Client audio (via mic test)
          await setupAudioProcessing(stream, true); // TRUE = client audio

          // Start second microphone for your voice
          setTimeout(async () => {
            try {
              console.log('=== MIC TEST: STARTING YOUR MICROPHONE ===');
              await startMicrophoneCapture();
              setAudioStatus(
                '✅ Live conversation analysis active (Mic Test + Mic)'
              );
            } catch (micError) {
              console.error('Microphone setup failed:', micError);
              setAudioStatus(
                '✅ Live conversation analysis active (Mic Test only)'
              );
            }
          }, 2000);

          console.log('=== MICROPHONE TEST MODE ACTIVE ===');
          return;
        } catch (micError) {
          console.error('Microphone access failed:', micError);
          setError(
            `Microphone access failed: ${micError.message}. Please allow microphone permissions.`
          );
          setIsListening(false);
          return;
        }
      }

      // Handle system audio devices (CLIENT AUDIO)
      if (window.electronAPI && selectedDevice !== 'browser-capture') {
        console.log(
          '=== USING ELECTRON SYSTEM AUDIO CAPTURE ===',
          selectedDevice
        );
        setAudioStatus('Connecting to Deepgram for client audio...');

        console.log('=== INITIALIZING CLIENT DEEPGRAM CONNECTION ===');
        await initializeDeepgramConnection(true); // TRUE = Client audio

        setAudioStatus('Starting system audio capture...');
        const result = await window.electronAPI.startAudioCapture(
          selectedDevice
        );

        if (result.error) {
          throw new Error(result.error);
        }

        console.log('=== SYSTEM AUDIO ACTIVE, SCHEDULING MICROPHONE ===');
        // Start microphone for YOUR voice
        setTimeout(async () => {
          try {
            console.log('=== STARTING YOUR MICROPHONE ===');
            await startMicrophoneCapture();
            setAudioStatus(
              '✅ Live conversation analysis active (System + Mic)'
            );
          } catch (micError) {
            console.error('Microphone setup failed:', micError);
            setAudioStatus(
              '✅ Live conversation analysis active (System only)'
            );
          }
        }, 2000);
      } else {
        throw new Error('No audio capture method available');
      }
    } catch (error) {
      console.error('Error in startListening:', error);
      setError(error.message);
      setAudioStatus('❌ Error occurred');
      setIsListening(false);
    }
  };

  const startMicrophoneCapture = async () => {
    try {
      console.log('=== INITIALIZING YOUR MICROPHONE ===');
      setAudioStatus('Starting microphone for your voice...');

      // CRITICAL: Initialize microphone Deepgram connection with FALSE parameter
      console.log('=== CREATING SEPARATE DEEPGRAM CONNECTION FOR YOUR MIC ===');
      await initializeDeepgramConnection(false); // FALSE = Your microphone audio
      console.log('=== YOUR MICROPHONE DEEPGRAM CONNECTION ESTABLISHED ===');

      // Setup microphone capture
      const micSuccess = await setupMicrophoneCapture();
      if (!micSuccess) {
        throw new Error('Failed to setup microphone audio processing');
      }

      console.log('=== YOUR MICROPHONE CAPTURE SETUP COMPLETE ===');
      return true;
    } catch (error) {
      console.error('=== MICROPHONE CAPTURE FAILED ===', error);
      // Don't fail the whole process if microphone fails
      setError(
        `Microphone failed: ${error.message}. Client audio will still work.`
      );
      return false;
    }
  };

  const setupMicrophoneCapture = async () => {
    try {
      console.log('=== REQUESTING YOUR MICROPHONE PERMISSIONS ===');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true, // Enable for your voice
          noiseSuppression: true, // Enable for your voice
          autoGainControl: true, // Enable for your voice
        },
      });

      console.log('=== YOUR MICROPHONE STREAM OBTAINED ===');
      console.log('=== SETTING UP YOUR MICROPHONE AUDIO PROCESSING ===');
      const success = await setupAudioProcessing(stream, false); // FALSE = your microphone
      console.log('=== YOUR MICROPHONE AUDIO PROCESSING COMPLETE ===');
      return success;
    } catch (error) {
      console.error('=== YOUR MICROPHONE SETUP FAILED ===', error);
      if (error.name === 'NotAllowedError') {
        throw new Error(
          `Microphone access denied. Please allow microphone permissions in your browser.`
        );
      } else if (error.name === 'NotFoundError') {
        throw new Error(`No microphone found. Please connect a microphone.`);
      } else {
        throw new Error(`Microphone access failed: ${error.message}`);
      }
    }
  };

  const stopListening = async () => {
    if (clientSocketRef.current) {
      clientSocketRef.current.close(1000, 'Manual stop');
      clientSocketRef.current = null;
    }

    if (micSocketRef.current) {
      micSocketRef.current.close(1000, 'Manual stop');
      micSocketRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (window.electronAPI) {
      try {
        await window.electronAPI.stopAudioCapture();
      } catch (error) {
        console.error('Error stopping audio capture:', error);
      }
    }

    setIsListening(false);
    setAudioStatus('Stopped');
    setCurrentClientInterim('');
    setCurrentYourInterim('');
    setCurrentSpeaker(null);
  };

  const clearTranscript = () => {
    setClientTranscript('');
    setYourTranscript('');
    setClientAccumulatedText('');
    setYourAccumulatedText('');
    setCurrentClientInterim('');
    setCurrentYourInterim('');
    setCombinedConversation('');
    setConversationHistory([]);
    setCurrentSpeaker(null);
    setLastClientFinal('');
    setLastYourFinal('');
    setHasStartedTranscription(false);
  };

  const saveApiKey = () => {
    let hasError = false;

    if (deepgramApiKey.trim()) {
      localStorage.setItem('deepgramApiKey', deepgramApiKey.trim());
    } else {
      setError('Please enter a valid Deepgram API key');
      hasError = true;
    }

    if (openaiApiKey.trim()) {
      localStorage.setItem('openaiApiKey', openaiApiKey.trim());
    }

    if (!hasError) {
      setShowSettings(false);
      setError('');
    }
  };

  const renderConversation = () => {
    if (!hasStartedTranscription && conversationHistory.length === 0) {
      return (
        <div className="conversation-placeholder">
          <p>🎤 Conversation will appear here once you start the analysis...</p>
          <p>
            The client's voice (system audio) and your voice (microphone) will
            be transcribed in real-time.
          </p>
          {openaiApiKey && (
            <p>🎯 AI coaching will analyze your conversation as it happens!</p>
          )}
        </div>
      );
    }

    return (
      <div className="conversation-messages">
        {conversationHistory.map((entry, index) => (
          <div
            key={index}
            className={`message ${entry.speaker.toLowerCase()}-message`}
          >
            <div className="message-header">
              <span className={`speaker-label ${entry.speaker.toLowerCase()}`}>
                {entry.speaker === 'Client' ? '🗣️ Client - ' : '🎤 You - '}
              </span>
              <span className="message-time">
                {entry.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}{' '}
                :&nbsp;
              </span>
            </div>
            <div className="message-text">{entry.text}</div>
          </div>
        ))}

        {/* Show current interim results */}
        {currentClientInterim && (
          <div className="message client-message interim">
            <div className="message-header">
              <span className="speaker-label client">🗣️ Client</span>
              <span className="interim-label">typing...</span>
            </div>
            <div className="message-text">
              <StreamingText text={currentClientInterim} showCursor={true} />
            </div>
          </div>
        )}

        {currentYourInterim && (
          <div className="message you-message interim">
            <div className="message-header">
              <span className="speaker-label you">🎤 You</span>
              <span className="interim-label">typing...</span>
            </div>
            <div className="message-text">
              <StreamingText text={currentYourInterim} showCursor={true} />
            </div>
          </div>
        )}

        <div ref={conversationEndRef} />
      </div>
    );
  };

  if (!isElectron) {
    return (
      <div className="App">
        <div className="error-message">
          <h2>❌ Electron Required</h2>
          <p>This application must be run as an Electron desktop app.</p>
          <p>Please build and run the Electron version.</p>
        </div>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="App settings-view">
        <div className="settings-panel">
          <h2>⚙️ Settings</h2>

          <div className="setting-item">
            <label>Deepgram API Key:</label>
            <input
              type="password"
              value={deepgramApiKey}
              onChange={(e) => setDeepgramApiKey(e.target.value)}
              placeholder="Enter your Deepgram API key"
              className="api-key-input"
            />
            <p className="help-text">
              Get your free API key from{' '}
              <a
                href="https://deepgram.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                deepgram.com
              </a>
            </p>
          </div>

          <div className="setting-item">
            <label>OpenAI API Key (for Real-time Sales Coaching):</label>
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="Enter your OpenAI API key"
              className="api-key-input"
            />
            <p className="help-text">
              Get your API key from{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenAI Platform
              </a>{' '}
              (required for live sales coaching)
            </p>
          </div>

          <div className="setting-item">
            <label>System Audio Device (Client Voice):</label>
            <div className="device-selector">
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="device-select"
              >
                <option value="">Select audio device...</option>
                <option value="browser-capture">
                  🖥️ Desktop Capture (Recommended)
                </option>
                <option value="microphone-test">🎤 Microphone Test</option>
                {audioDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} {device.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={loadAudioDevices}
                className="refresh-btn"
                title="Refresh devices"
              >
                🔄
              </button>
            </div>
            <p className="help-text">
              Desktop Capture works best for YouTube/system audio. Microphone
              Test for testing with just microphone.
            </p>
          </div>

          <div className="settings-buttons">
            <button onClick={saveApiKey} className="save-btn">
              💾 Save & Close
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-top">
          <h1>🎯 Live Sales Coach</h1>
          <div className="header-controls">
            <span className="platform-badge">
              {window.electronAPI?.platform === 'win32'
                ? '🪟 Windows'
                : window.electronAPI?.platform === 'darwin'
                ? '🍎 macOS'
                : '🐧 Linux'}
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="settings-btn"
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>

        <div className="device-info">
          System Audio:{' '}
          {audioDevices.find((d) => d.id === selectedDevice)?.name || 'None'} →
          Client Voice | Microphone: {isListening ? ' Active' : ' Ready'} → Your
          Voice | AI Coach: {openaiApiKey ? '✅ Ready' : '❌ Configure API Key'}
        </div>

        <div className="controls">
          {!isListening ? (
            <button
              className="start-btn"
              onClick={startListening}
              disabled={!deepgramApiKey.trim() || !selectedDevice}
            >
              ▶️ Start Live Coaching
            </button>
          ) : (
            <button className="stop-btn" onClick={stopListening}>
              ⏹️ Stop Analysis
            </button>
          )}

          <button className="clear-btn" onClick={clearTranscript}>
            🗑️ Clear
          </button>

          <button
            className="suggestions-toggle-btn"
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            🎯 {showSuggestions ? 'Hide' : 'Show'} AI Coach
          </button>
        </div>

        <div className="status-info">
          Status: {audioStatus}
          {isListening && isAnalyzing && (
            <span className="analyzing-status"> • 🔴 AI Analyzing...</span>
          )}
          {isListening && !isAnalyzing && openaiApiKey && (
            <span className="live-status"> • ✅ AI Coach Active</span>
          )}
        </div>

        {error && <div className="error-message">❌ {error}</div>}
      </header>

      <main className="main-content">
        <div
          className={`conversation-section ${
            showSuggestions ? 'with-suggestions' : ''
          }`}
        >
          <div className="unified-conversation">
            <div className="conversation-panel">
              <div className="panel-header">
                <h3>💬 Live Conversation</h3>
                <div className="conversation-stats">
                  {conversationHistory.length > 0 && (
                    <span className="message-count">
                      {conversationHistory.length} messages
                    </span>
                  )}
                  {(currentClientInterim || currentYourInterim) && (
                    <span className="live-indicator">🔴 Live</span>
                  )}
                </div>
              </div>
              <div className="conversation-content">{renderConversation()}</div>
            </div>
          </div>
        </div>

        {showSuggestions && (
          <SalesSuggestionsPanel
            conversation={combinedConversation}
            isAnalyzing={isAnalyzing}
            openaiApiKey={openaiApiKey}
            setIsAnalyzing={setIsAnalyzing}
            isListening={isListening}
            onClose={() => setShowSuggestions(false)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
