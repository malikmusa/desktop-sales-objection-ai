import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SALES_FLOWCHART_XML } from './flow.js';
import './App.css';

// Reusable StreamingText component
const StreamingText = ({ text, showCursor = false }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const timeoutRef = useRef(null);
  const lastTextRef = useRef('');
  const streamingIndexRef = useRef(0);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

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
            setDisplayedText(
              previousText + newContent.slice(0, streamingIndexRef.current + 1)
            );
            streamingIndexRef.current++;
            timeoutRef.current = setTimeout(streamChars, 25);
          } else {
            setIsStreaming(false);
            setDisplayedText(newText);
          }
        };

        newContent.length > 0 ? streamChars() : setIsStreaming(false);
      } else {
        setDisplayedText(newText);
        setIsStreaming(false);
      }
      lastTextRef.current = newText;
    }

    return () => timeoutRef.current && clearTimeout(timeoutRef.current);
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

// Updated SalesSuggestionsPanel component with client-triggered analysis
const SalesSuggestionsPanel = ({
  conversation,
  isAnalyzing,
  onClose,
  openaiApiKey,
  setIsAnalyzing,
  isListening,
  // Add these new props from the main component
  conversationHistory,
  clientAccumulatedText,
}) => {
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [error, setError] = useState('');
  const [lastAnalyzedClientText, setLastAnalyzedClientText] = useState('');
  const analysisTimeoutRef = useRef(null);
  const lastAnalysisTimeRef = useRef(0);

  const analyzeConversation = useCallback(async () => {
    if (!conversation || !openaiApiKey || !isListening) return;

    const now = Date.now();
    if (now - lastAnalysisTimeRef.current < 500) return; // Prevent too frequent calls

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
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are a real-time AI sales coaching with access to a complete sales conversation flowchart in XML format. 

Here is the complete sales flowchart XML document:

${SALES_FLOWCHART_XML}

This XML contains a comprehensive sales conversation flowchart with:
- Opening qualification questions
- Business model assessment paths
- Problem discovery sequences
- Goal setting frameworks
- Objection handling scripts
- Closing sequences
- All the connecting logic and decision trees

Use this flowchart to provide specific sales coaching advice, scripts, and next steps based on where the conversation is in the flow.

Analyze the XML structure to understand:
- The sequence of questions
- The branching logic based on responses
- The specific scripts and reframes
- The objection handling frameworks
- The closing techniques

Provide actionable guidance based on this complete sales methodology. 
 
CONVERSATION FORMAT:
- "Client:" = prospect/client speaking
- "You:" = salesperson speaking

**Behavior Rules:**
- Keep suggestions short (1–3 lines) and conversational
- Use simple, human language
- Stay neutral and non-pushy, but persuasive
- Watch for objection triggers like "not sure," "too expensive," "need to think," etc.
- Focus on what the salesperson should say NEXT based on what the client just said

Return analysis in JSON format:
{
  "suggestedResponses": [
    { 
      "response": "exact phrase/question to use", 
    }
  ]
}`,
              },
              {
                role: 'user',
                content: `LIVE SALES CONVERSATION:\n\n${conversation}\n\nThe client just spoke. Provide instant analysis for what the salesperson should respond RIGHT NOW.`,
              },
            ],
            max_tokens: 2500,
            temperature: 0.6,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const analysis = data.choices[0]?.message?.content || '{}';
      const cleaned = analysis
        .trim()
        .replace(/^```json?/, '')
        .replace(/```$/, '');
      const parsedAnalysis = JSON.parse(cleaned);

      setAnalysisHistory((prev) => [
        ...prev.slice(-4), // Keep last 4 analyses
        {
          timestamp: new Date(),
          suggestedResponses: parsedAnalysis?.suggestedResponses || [],
          triggerText: clientAccumulatedText, // Store what client said that triggered this
        },
      ]);

      // Update the last analyzed client text
      setLastAnalyzedClientText(clientAccumulatedText);
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      setError(`Analysis failed: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    conversation,
    openaiApiKey,
    isListening,
    setIsAnalyzing,
    clientAccumulatedText,
  ]);

  // Client-triggered analysis effect
  useEffect(() => {
    if (
      !isListening ||
      !conversation ||
      !openaiApiKey ||
      !clientAccumulatedText
    )
      return;

    // Check if client has said something new
    const clientTextChanged = clientAccumulatedText !== lastAnalyzedClientText;
    const hasMinimumContent = clientAccumulatedText.trim().length > 10; // At least 10 characters

    // Only trigger analysis when:
    // 1. Client text has changed (new client speech)
    // 2. There's meaningful content
    // 3. Enough time has passed since last analysis
    const timeSinceLastAnalysis = Date.now() - lastAnalysisTimeRef.current;
    const enoughTimePassed = timeSinceLastAnalysis > 2000; // 2 seconds minimum

    if (clientTextChanged && hasMinimumContent && enoughTimePassed) {
      console.log('🎯 Client spoke - triggering AI analysis...');

      // Clear any pending analysis
      if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);

      // Trigger analysis after a short delay to ensure client finished speaking
      analysisTimeoutRef.current = setTimeout(analyzeConversation, 1000);
    }

    return () => {
      if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
    };
  }, [
    clientAccumulatedText,
    lastAnalyzedClientText,
    analyzeConversation,
    isListening,
    openaiApiKey,
    conversation,
  ]);

  // Update error state
  useEffect(() => {
    setError(
      isListening && !openaiApiKey
        ? 'OpenAI API key required for real-time analysis. Please configure in Settings.'
        : ''
    );
  }, [isListening, openaiApiKey]);

  const renderContent = () => {
    if (!openaiApiKey)
      return (
        <div className="no-api-key">
          <p>⚙️ OpenAI API key required for real-time sales coaching.</p>
          <p>Configure your API key in Settings to get live assistance.</p>
        </div>
      );

    if (!isListening)
      return (
        <div className="not-listening">
          <p>
            🎤 Start the conversation analysis to get real-time sales coaching.
          </p>
          <p>
            I'll analyze the conversation when the CLIENT speaks and provide
            instant suggestions for your response.
          </p>
        </div>
      );

    if (error)
      return (
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
      );

    // Show all analysis history
    if (analysisHistory.length > 0) {
      return (
        <div className="responses-section">
          <h4>💬 AI Coaching History</h4>
          <p className="coaching-note">
            🎯 Analysis triggers when client speaks
          </p>
          <div className="responses-history">
            {analysisHistory.map((analysis, historyIndex) => (
              <div key={historyIndex} className="analysis-block">
                <div className="analysis-timestamp">
                  {analysis.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {historyIndex === analysisHistory.length - 1 && (
                    <span className="latest-badge">Latest</span>
                  )}
                  {isAnalyzing &&
                    historyIndex === analysisHistory.length - 1 && (
                      <span className="analyzing-badge">🔄 Updating...</span>
                    )}
                </div>
                <div className="responses-list">
                  {analysis.suggestedResponses?.map(
                    (response, responseIndex) => (
                      <div key={responseIndex} className="response-item">
                        <p className="response-text">
                          <strong>You respond:</strong> "{response?.response}"
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Auto-scroll to bottom for new responses */}
          <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
        </div>
      );
    }

    // Loading state
    if (isAnalyzing) {
      return (
        <div className="loading-analysis">
          <div className="loading-spinner"></div>
          <p>Client spoke - analyzing for your next response...</p>
        </div>
      );
    }

    // Waiting state
    return (
      <div className="waiting-for-content">
        <p>🎧 Listening for client speech...</p>
        <p>I'll provide coaching suggestions when the CLIENT speaks.</p>
        <p>Waiting for client to say something...</p>
      </div>
    );
  };

  return (
    <div className="sales-suggestions-panel">
      <div className="panel-header">
        <h3>🎯 Live Sales Coach</h3>
        <div className="panel-controls">
          <div className="live-status">
            {isListening && isAnalyzing && (
              <span className="analyzing-badge">
                🔴 Analyzing Client Speech...
              </span>
            )}
            {isListening && !isAnalyzing && (
              <span className="live-badge">✅ Waiting for Client</span>
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
      <div className="panel-content">{renderContent()}</div>
    </div>
  );
};

// Custom hooks for better state management
const useAudioDevices = () => {
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  const loadAudioDevices = useCallback(async () => {
    try {
      const devices = await window.electronAPI.getAudioDevices();
      if (devices.error) throw new Error(devices.error);

      setAudioDevices(devices);
      const defaultDevice = devices.find((d) => d.isDefault) || devices[0];
      if (defaultDevice) setSelectedDevice(defaultDevice.id);
    } catch (error) {
      console.error('Error loading audio devices:', error);
      throw error;
    }
  }, []);

  return { audioDevices, selectedDevice, setSelectedDevice, loadAudioDevices };
};

const useApiKeys = () => {
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  useEffect(() => {
    const savedDeepgram = localStorage.getItem('deepgramApiKey');
    const savedOpenai = localStorage.getItem('openaiApiKey');
    if (savedDeepgram) setDeepgramApiKey(savedDeepgram);
    if (savedOpenai) setOpenaiApiKey(savedOpenai);
  }, []);

  const saveApiKeys = useCallback(() => {
    if (!deepgramApiKey.trim())
      throw new Error('Please enter a valid Deepgram API key');
    localStorage.setItem('deepgramApiKey', deepgramApiKey.trim());
    if (openaiApiKey.trim())
      localStorage.setItem('openaiApiKey', openaiApiKey.trim());
  }, [deepgramApiKey, openaiApiKey]);

  return {
    deepgramApiKey,
    setDeepgramApiKey,
    openaiApiKey,
    setOpenaiApiKey,
    saveApiKeys,
  };
};

const useConversation = () => {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentClientInterim, setCurrentClientInterim] = useState('');
  const [currentYourInterim, setCurrentYourInterim] = useState('');
  const [clientAccumulatedText, setClientAccumulatedText] = useState('');
  const [yourAccumulatedText, setYourAccumulatedText] = useState('');
  const [combinedConversation, setCombinedConversation] = useState('');
  const [lastClientFinal, setLastClientFinal] = useState('');
  const [lastYourFinal, setLastYourFinal] = useState('');
  const [hasStartedTranscription, setHasStartedTranscription] = useState(false);

  // Handle final transcripts
  useEffect(() => {
    const updateHistory = (text, lastFinal, setLastFinal, speaker) => {
      if (text !== lastFinal && text?.trim()) {
        const newText = text.replace(lastFinal, '').trim();
        if (newText) {
          setConversationHistory((prev) => [
            ...prev,
            { speaker, text: newText, timestamp: new Date() },
          ]);
        }
        setLastFinal(text);
      }
    };

    updateHistory(
      clientAccumulatedText,
      lastClientFinal,
      setLastClientFinal,
      'Client'
    );
    updateHistory(yourAccumulatedText, lastYourFinal, setLastYourFinal, 'You');
  }, [
    clientAccumulatedText,
    yourAccumulatedText,
    lastClientFinal,
    lastYourFinal,
  ]);

  // Update combined conversation
  useEffect(() => {
    let combined = '';
    conversationHistory.forEach((entry) => {
      combined += `${entry.speaker}: ${entry.text}\n\n`;
    });
    if (currentClientInterim?.trim())
      combined += `Client: ${currentClientInterim.trim()}\n\n`;
    if (currentYourInterim?.trim())
      combined += `You: ${currentYourInterim.trim()}\n\n`;
    setCombinedConversation(combined);
  }, [conversationHistory, currentClientInterim, currentYourInterim]);

  const clearConversation = useCallback(() => {
    setConversationHistory([]);
    setCurrentClientInterim('');
    setCurrentYourInterim('');
    setClientAccumulatedText('');
    setYourAccumulatedText('');
    setCombinedConversation('');
    setLastClientFinal('');
    setLastYourFinal('');
    setHasStartedTranscription(false);
  }, []);

  return {
    conversationHistory,
    currentClientInterim,
    setCurrentClientInterim,
    currentYourInterim,
    setCurrentYourInterim,
    clientAccumulatedText,
    setClientAccumulatedText,
    yourAccumulatedText,
    setYourAccumulatedText,
    combinedConversation,
    hasStartedTranscription,
    setHasStartedTranscription,
    clearConversation,
  };
};

// Audio processing utilities
const createDeepgramConnection = (apiKey, isClient, callbacks) => {
  return new Promise((resolve, reject) => {
    const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true`;
    const socket = new WebSocket(wsUrl, ['token', apiKey.trim()]);

    socket.onopen = () => {
      console.log(
        `Deepgram connected for ${isClient ? 'CLIENT' : 'MICROPHONE'}`
      );
      resolve(socket);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;

        if (transcript?.trim()) {
          callbacks.onTranscript(transcript.trim(), isFinal, isClient);
        }
      } catch (error) {
        console.error('Error parsing Deepgram response:', error);
      }
    };

    socket.onerror = reject;
    socket.onclose = (event) =>
      console.log(
        `Deepgram closed for ${isClient ? 'client' : 'microphone'}:`,
        event.code
      );

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
  });
};

const setupAudioProcessing = async (stream, socket) => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  });
  if (audioContext.state === 'suspended') await audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (event) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const inputData = event.inputBuffer.getChannelData(0);
      const int16Array = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
      }
      socket.send(int16Array.buffer);
    }
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return { audioContext, processor, stream };
};

// Main App Component
function App() {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [audioStatus, setAudioStatus] = useState('Ready');
  const [showSettings, setShowSettings] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { audioDevices, selectedDevice, setSelectedDevice, loadAudioDevices } =
    useAudioDevices();
  const {
    deepgramApiKey,
    setDeepgramApiKey,
    openaiApiKey,
    setOpenaiApiKey,
    saveApiKeys,
  } = useApiKeys();
  const conversation = useConversation();

  // Refs for audio management
  const clientSocketRef = useRef(null);
  const micSocketRef = useRef(null);
  const audioResourcesRef = useRef({});
  const conversationEndRef = useRef(null);

  // Check Electron environment
  useEffect(() => {
    const isElectronEnv =
      window.electronAPI ||
      window.process?.type === 'renderer' ||
      window.navigator?.userAgent?.indexOf('Electron') !== -1;

    if (isElectronEnv) {
      setIsElectron(true);
      setTimeout(() => {
        if (window.electronAPI) {
          loadAudioDevices();
          window.electronAPI.onAudioData((audioData) => {
            if (clientSocketRef.current?.readyState === WebSocket.OPEN) {
              clientSocketRef.current.send(audioData);
            }
          });
        }
      }, 300);
    } else {
      setIsElectron(false);
      setError('This app must be run as an Electron desktop application');
    }

    return () => window.electronAPI?.removeAudioDataListener?.();
  }, [loadAudioDevices]);

  // Auto-scroll to conversation bottom
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    conversation.conversationHistory,
    conversation.currentClientInterim,
    conversation.currentYourInterim,
  ]);

  const handleTranscript = useCallback(
    (transcript, isFinal, isClient) => {
      if (!conversation.hasStartedTranscription) {
        conversation.setHasStartedTranscription(true);
      }

      if (isClient) {
        if (isFinal) {
          conversation.setClientAccumulatedText((prev) =>
            prev ? `${prev} ${transcript}` : transcript
          );
          conversation.setCurrentClientInterim('');
        } else {
          conversation.setCurrentClientInterim(transcript);
        }
      } else {
        if (isFinal) {
          conversation.setYourAccumulatedText((prev) =>
            prev ? `${prev} ${transcript}` : transcript
          );
          conversation.setCurrentYourInterim('');
        } else {
          conversation.setCurrentYourInterim(transcript);
        }
      }
    },
    [conversation]
  );

  const startAudioCapture = useCallback(async () => {
    try {
      setError('');
      setAudioStatus('Starting...');
      conversation.clearConversation();

      if (!deepgramApiKey.trim()) {
        throw new Error(
          'Please enter your Deepgram API key first (click Settings)'
        );
      }

      setIsListening(true);

      const transcriptCallbacks = { onTranscript: handleTranscript };

      // Setup client audio (system/desktop)
      if (selectedDevice === 'browser-capture') {
        setAudioStatus('Getting desktop capture...');
        const sources = await window.electronAPI.getDesktopSources();
        const primarySource =
          sources.find((s) => s.name === 'Entire Screen') || sources[0];

        try {
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
              },
            },
          });

          if (stream.getAudioTracks().length === 0) {
            stream.getTracks().forEach((track) => track.stop());
            const result = await window.electronAPI.startAudioCapture(
              'system-audio'
            );
            if (!result.success)
              throw new Error('Could not access desktop audio');
          } else {
            clientSocketRef.current = await createDeepgramConnection(
              deepgramApiKey,
              true,
              transcriptCallbacks
            );
            audioResourcesRef.current.client = await setupAudioProcessing(
              stream,
              clientSocketRef.current
            );
          }
        } catch (desktopError) {
          throw new Error(`Desktop capture failed: ${desktopError.message}`);
        }
      } else if (selectedDevice === 'microphone-test') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: false,
          },
        });
        clientSocketRef.current = await createDeepgramConnection(
          deepgramApiKey,
          true,
          transcriptCallbacks
        );
        audioResourcesRef.current.client = await setupAudioProcessing(
          stream,
          clientSocketRef.current
        );
      } else if (window.electronAPI) {
        clientSocketRef.current = await createDeepgramConnection(
          deepgramApiKey,
          true,
          transcriptCallbacks
        );
        const result = await window.electronAPI.startAudioCapture(
          selectedDevice
        );
        if (result.error) throw new Error(result.error);
      }

      // Setup microphone after delay
      setTimeout(async () => {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
            },
          });
          micSocketRef.current = await createDeepgramConnection(
            deepgramApiKey,
            false,
            transcriptCallbacks
          );
          audioResourcesRef.current.microphone = await setupAudioProcessing(
            micStream,
            micSocketRef.current
          );
          setAudioStatus('✅ Live conversation analysis active');
        } catch (micError) {
          console.error('Microphone setup failed:', micError);
          setAudioStatus('✅ Live conversation analysis active (System only)');
        }
      }, 200);
    } catch (error) {
      console.error('Error starting audio capture:', error);
      setError(error.message);
      setAudioStatus('❌ Error occurred');
      setIsListening(false);
    }
  }, [deepgramApiKey, selectedDevice, conversation, handleTranscript]);

  const stopAudioCapture = useCallback(async () => {
    [clientSocketRef, micSocketRef].forEach((ref) => {
      if (ref.current) {
        ref.current.close(1000, 'Manual stop');
        ref.current = null;
      }
    });

    Object.values(audioResourcesRef.current).forEach((resources) => {
      resources?.processor?.disconnect();
      resources?.audioContext?.close();
      resources?.stream?.getTracks().forEach((track) => track.stop());
    });
    audioResourcesRef.current = {};

    if (window.electronAPI) {
      try {
        await window.electronAPI.stopAudioCapture();
      } catch (error) {
        console.error('Error stopping audio capture:', error);
      }
    }

    setIsListening(false);
    setAudioStatus('Stopped');
    conversation.setCurrentClientInterim('');
    conversation.setCurrentYourInterim('');
  }, [conversation]);

  const handleSaveSettings = useCallback(() => {
    try {
      saveApiKeys();
      setShowSettings(false);
      setError('');
    } catch (error) {
      setError(error.message);
    }
  }, [saveApiKeys]);

  const renderConversation = () => {
    if (
      !conversation.hasStartedTranscription &&
      conversation.conversationHistory.length === 0
    ) {
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
        {conversation.conversationHistory.map((entry, index) => (
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

        {[
          {
            interim: conversation.currentClientInterim,
            speaker: 'Client',
            label: '🗣️ Client',
          },
          {
            interim: conversation.currentYourInterim,
            speaker: 'You',
            label: '🎤 You',
          },
        ].map(
          ({ interim, speaker, label }, idx) =>
            interim && (
              <div
                key={idx}
                className={`message ${speaker.toLowerCase()}-message interim`}
              >
                <div className="message-header">
                  <span className={`speaker-label ${speaker.toLowerCase()}`}>
                    {label}
                  </span>
                  <span className="interim-label">typing...</span>
                </div>
                <div className="message-text">
                  <StreamingText text={interim} showCursor={true} />
                </div>
              </div>
            )
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
              </a>
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
          </div>

          <div className="settings-buttons">
            <button onClick={handleSaveSettings} className="save-btn">
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
          <button
            className={isListening ? 'stop-btn' : 'start-btn'}
            onClick={isListening ? stopAudioCapture : startAudioCapture}
            disabled={
              !isListening && (!deepgramApiKey.trim() || !selectedDevice)
            }
          >
            {isListening ? '⏹️ Stop Analysis' : '▶️ Start Live Coaching'}
          </button>

          <button
            className="clear-btn"
            onClick={conversation.clearConversation}
          >
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
                  {conversation.conversationHistory.length > 0 && (
                    <span className="message-count">
                      {conversation.conversationHistory.length} messages
                    </span>
                  )}
                  {(conversation.currentClientInterim ||
                    conversation.currentYourInterim) && (
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
            conversation={conversation.combinedConversation}
            isAnalyzing={isAnalyzing}
            openaiApiKey={openaiApiKey}
            setIsAnalyzing={setIsAnalyzing}
            isListening={isListening}
            onClose={() => setShowSuggestions(false)}
            // Add these new props:
            conversationHistory={conversation.conversationHistory}
            clientAccumulatedText={conversation.clientAccumulatedText}
          />
        )}
      </main>
    </div>
  );
}

export default App;
