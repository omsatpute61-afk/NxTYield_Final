import { useState, useRef, useEffect } from 'react';
import { Activity, Droplets, Thermometer, CloudRain, ShieldAlert, Sprout, Send, MessageSquare, Bot } from 'lucide-react';
import { sendChatMessage } from '../lib/api';
import { useFarmData } from '../context/FarmDataContext';
import { compactValue, formatShortTime } from '../lib/farmUtils';
import './ChatAssistant.css';

const suggestions = [
  'How is my farm health?',
  'Should I water today?',
  'Give me NPK fertilizer advice',
];

function renderLines(content) {
  return content.split('\n').map((line, i) => (
    <span key={`${line}-${i}`}>
      {line}
      {i < content.split('\n').length - 1 && <br />}
    </span>
  ));
}

function ChatAssistant() {
  const { latest, summary, chatStatus, weather } = useFarmData();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    const providerText = chatStatus?.llm_enabled
      ? `I am connected to ${chatStatus.provider} and can use your live soil readings.`
      : 'AI API not available. I can answer basic sensor-based questions with local rules.';
    const greeting = {
      role: 'assistant',
      content: `Hello. ${providerText}`,
    };

    setMessages((current) => {
      if (!current.length) return [greeting];
      if (current.length === 1 && current[0].role === 'assistant' && current[0].content.startsWith('Hello. ')) {
        return [greeting];
      }
      return current;
    });
  }, [chatStatus?.llm_enabled, chatStatus?.provider]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (text) => {
    const q = (text || input).trim();
    if (!q || sending) return;

    const nextMessages = [...messages, { role: 'user', content: q }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const history = nextMessages
        .slice(-10)
        .map((msg) => ({ role: msg.role, content: msg.content }));
      const data = await sendChatMessage(q, history.slice(0, -1), latest);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.reply || data.message || 'AI API not available.',
        provider: data.provider,
      }]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Sorry, I could not reach the assistant endpoint: ${error.message}`,
      }]);
    } finally {
      setSending(false);
    }
  };

  const history = [
    { label: 'Active now', title: 'This Session' },
  ];
  const assistantStatus = chatStatus?.llm_enabled ? 'Assistant mode' : 'Assistant mode - API not available';

  return (
    <div className="container page-chat">
      <div className="chat-layout">
        <div className="panel chat-sidebar">
          <div className="panel-header">
            <h2 className="panel-title">Current Chat</h2>
          </div>
          <div className="history-list">
            {history.map((h, i) => (
              <div key={h.title} className={`history-item ${i === 0 ? 'active' : ''}`}>
                <MessageSquare size={14} />
                <div>
                  <span className="h-title">{h.title}</span>
                  <span className="h-label">{h.label}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={`assistant-mode-footer ${chatStatus?.llm_enabled ? 'online' : 'offline'}`}>
            <Bot size={18} />
            <div>
              <span className="am-title">Powered by Groq</span>
              <span className="am-label">{assistantStatus}</span>
            </div>
          </div>
        </div>

        <div className="panel chat-main">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-success" />
              <h2 className="panel-title" style={{ marginBottom: 0 }}>NxTYield AI Copilot</h2>
            </div>
            <div className={`badge ${summary.hasSensor ? 'badge-success' : 'badge-warning'}`}>
              {summary.hasSensor ? 'Farm Context Active' : 'Waiting for Context'}
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`chat-bubble-row ${msg.role}`}>
                <div className={`chat-avatar ${msg.role}`}>
                  {msg.role === 'assistant' ? <Bot size={16} /> : <span>You</span>}
                </div>
                <div className={`chat-bubble ${msg.role}`}>
                  {renderLines(msg.content)}
                  {msg.provider && msg.provider !== 'local' && (
                    <span className="text-primary text-sm"> {msg.provider}</span>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="chat-bubble-row assistant">
                <div className="chat-avatar assistant"><Bot size={16} /></div>
                <div className="chat-bubble assistant">Analyzing live context...</div>
              </div>
            )}

            {messages.length === 1 && (
              <div className="suggestions-row">
                <span className="sug-label">Suggested questions</span>
                <div className="sug-chips">
                  {suggestions.map((s) => (
                    <button key={s} className="sug-chip" onClick={() => handleSend(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="Ask anything about your farm..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={sending}
            />
            <button className="send-btn btn btn-primary" onClick={() => handleSend()} disabled={sending}>
              <Send size={16} />
            </button>
          </div>
        </div>

        <div className="panel context-panel">
          <div className="panel-header">
            <h2 className="panel-title">Live Farm Context</h2>
          </div>
          <p className="ctx-sub text-muted">AI receives current sensor readings from the backend</p>

          <div className="ctx-grid mt-3">
            <div className="ctx-row">
              <Activity size={16} className="text-success" />
              <div>
                <span className="ctx-key">Farm Health</span>
                <span className="ctx-val text-success">{summary.healthScore === null ? '--' : `${summary.healthScore} / 100`}</span>
              </div>
            </div>
            <div className="ctx-row">
              <Sprout size={16} className="text-success" />
              <div>
                <span className="ctx-key">Data Source</span>
                <span className="ctx-val">{latest?.source || 'Waiting'}</span>
              </div>
            </div>
            <div className="ctx-row">
              <Droplets size={16} className="text-primary" />
              <div>
                <span className="ctx-key">Avg. Moisture</span>
                <span className="ctx-val">{compactValue(latest?.moisture)}%</span>
              </div>
            </div>
            <div className="ctx-row">
              <Thermometer size={16} className="text-warning" />
              <div>
                <span className="ctx-key">Temperature</span>
                <span className="ctx-val">{compactValue(latest?.air_temperature ?? weather?.current?.temperature, 1)}C</span>
              </div>
            </div>
            <div className="ctx-row">
              <CloudRain size={16} className="text-primary" />
              <div>
                <span className="ctx-key">Rain Probability</span>
                <span className="ctx-val">{compactValue(weather?.current?.rain_probability)}%</span>
              </div>
            </div>
            <div className={`ctx-row ${latest?.rain_detected ? 'warning' : ''}`}>
              <ShieldAlert size={16} className="text-warning" />
              <div>
                <span className="ctx-key">Rain Sensor</span>
                <span className={`ctx-val ${latest?.rain_detected ? 'text-warning' : ''}`}>
                  {latest?.rain_detected === null || latest?.rain_detected === undefined ? 'Waiting' : latest.rain_detected ? 'Rain Detected' : 'Clear'}
                </span>
              </div>
            </div>
          </div>

          <div className="ctx-footer mt-4">
            <span className="ctx-key text-muted">Sensor freshness</span>
            <span className="ctx-conf text-muted">
              {summary.hasSensor ? `Updated ${formatShortTime(latest?.timestamp)}` : 'Waiting for live sensor readings'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatAssistant;
