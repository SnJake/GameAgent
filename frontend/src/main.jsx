import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Database,
  Globe2,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Wrench
} from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8017';
const STORAGE_KEY = 'arknights-db-agent-chats-v1';
const WELCOME_MESSAGE = {
  role: 'assistant',
  content: 'Задай вопрос по операторам, предметам, врагам, стадиям или лору Arknights. Если база пустая, сначала пересобери индекс.'
};

function cls(...items) {
  return items.filter(Boolean).join(' ');
}

function createChat(title = 'Новый чат') {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    messages: [WELCOME_MESSAGE],
    sources: [],
    images: [],
    createdAt: now,
    updatedAt: now
  };
}

function loadChats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((chat) => ({
        ...createChat(),
        ...chat,
        messages: Array.isArray(chat.messages) && chat.messages.length ? chat.messages : [WELCOME_MESSAGE],
        sources: Array.isArray(chat.sources) ? chat.sources : [],
        images: Array.isArray(chat.images) ? chat.images : []
      }));
    }
  } catch {
    // Ignore broken localStorage and start clean.
  }
  return [createChat()];
}

function titleFromText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Новый чат';
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}...` : clean;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || `HTTP ${response.status}`);
  }
  return data;
}

function App() {
  const [health, setHealth] = useState(null);
  const [chats, setChats] = useState(loadChats);
  const [activeChatId, setActiveChatId] = useState(() => chats[0]?.id);
  const [input, setInput] = useState('');
  const [busyChatId, setBusyChatId] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [memory, setMemory] = useState({});
  const [provider, setProvider] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [useTools, setUseTools] = useState(false);
  const [useWikiSearch, setUseWikiSearch] = useState(true);
  const [useEndfieldWikiSearch, setUseEndfieldWikiSearch] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [topK, setTopK] = useState(8);
  const [rebuilding, setRebuilding] = useState(false);
  const endRef = useRef(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) || chats[0],
    [chats, activeChatId]
  );
  const messages = activeChat?.messages || [WELCOME_MESSAGE];
  const sources = activeChat?.sources || [];
  const images = activeChat?.images || [];
  const busy = busyChatId === activeChat?.id;
  const userMessages = useMemo(() => messages.filter((m) => m.role !== 'system'), [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  async function refresh() {
    try {
      const [h, m] = await Promise.all([api('/api/health'), api('/api/memory')]);
      setHealth(h);
      setProvider((current) => current || h.llm_provider || '');
      setMemory(m.memory || {});
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatId, messages, busy]);

  function updateChat(chatId, updater) {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        return { ...updater(chat), updatedAt: new Date().toISOString() };
      })
    );
  }

  function addChat() {
    const chat = createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput('');
    setError('');
    setSearchResults([]);
  }

  function deleteChat(chatId) {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== chatId);
      const fallback = next[0] || createChat();
      if (activeChatId === chatId) {
        setActiveChatId(fallback.id);
      }
      return next.length ? next : [fallback];
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busyChatId || !activeChat) return;

    const chatId = activeChat.id;
    const nextMessages = [...activeChat.messages, { role: 'user', content: text }];
    const nextTitle = activeChat.title === 'Новый чат' ? titleFromText(text) : activeChat.title;

    setError('');
    setInput('');
    updateChat(chatId, (chat) => ({ ...chat, title: nextTitle, messages: nextMessages }));
    setBusyChatId(chatId);

    try {
      const payloadMessages = nextMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
      const result = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: payloadMessages,
          provider: provider || undefined,
          use_memory: useMemory,
          use_tool_calls: useTools,
          use_wiki_search: useWikiSearch,
          use_endfield_wiki_search: useEndfieldWikiSearch,
          use_web_search: useWebSearch,
          top_k: Number(topK)
        })
      });
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [...nextMessages, { role: 'assistant', content: result.answer || 'Пустой ответ модели.' }],
        sources: result.sources || [],
        images: result.images || []
      }));
    } catch (err) {
      setError(err.message);
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [...nextMessages, { role: 'assistant', content: `Ошибка: ${err.message}` }]
      }));
    } finally {
      setBusyChatId(null);
      refresh();
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setError('');
    try {
      const result = await api(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
      setSearchResults(result.results || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function rebuildIndex() {
    setRebuilding(true);
    setError('');
    try {
      const result = await api('/api/index/rebuild', { method: 'POST', body: '{}' });
      await refresh();
      if (activeChat) {
        updateChat(activeChat.id, (chat) => ({
          ...chat,
          messages: [
            ...chat.messages,
            { role: 'assistant', content: `Индекс обновлен: документов ${result.documents}, изображений ${result.images}.` }
          ]
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark"><Bot size={20} /></div>
          <div>
            <h1>Arknights DB Agent</h1>
            <p>{health?.model_configured ? 'BotHub подключен' : 'Нужен .env с ключом и моделью'}</p>
          </div>
        </div>

        <section className="chatList">
          <div className="sectionTitle rowTitle">
            <span><MessageSquare size={16} /> Чаты</span>
            <button className="iconButton" onClick={addChat} title="Новый чат"><Plus size={16} /></button>
          </div>
          <div className="chatItems">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={cls('chatItem', chat.id === activeChat?.id && 'active')}
                onClick={() => setActiveChatId(chat.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveChatId(chat.id);
                  }
                }}
                role="button"
                tabIndex={0}
                title={chat.title}
              >
                <span>
                  <strong>{chat.title}</strong>
                  <small>{chat.messages.filter((m) => m.role === 'user').length} запросов</small>
                </span>
                <button
                  className="deleteChat"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteChat(chat.id);
                  }}
                  title="Удалить чат"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="status">
          <div className="statusLine">
            <Database size={16} />
            <span>{health?.documents ?? 0} документов</span>
          </div>
          <div className="statusLine">
            <ImageIcon size={16} />
            <span>{health?.images ?? 0} изображений</span>
          </div>
          <button className="wideButton" onClick={rebuildIndex} disabled={rebuilding}>
            <RefreshCw size={16} className={cls(rebuilding && 'spin')} />
            {rebuilding ? 'Индексирую' : 'Пересобрать индекс'}
          </button>
        </section>

        <section className="settings">
          <div className="sectionTitle"><Settings size={16} /> Настройки</div>
          <label className="selectLabel">
            <span>LLM provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={!health?.providers?.length}>
              {!health?.providers?.length && <option value="">Loading providers...</option>}
              {(health?.providers || []).map((item) => (
                <option key={item.id} value={item.id} disabled={!item.configured}>
                  {item.label}{item.model ? ` · ${item.model}` : ''}{item.configured ? '' : ' · not configured'}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useMemory} onChange={(e) => setUseMemory(e.target.checked)} />
            <span>Память пользователя</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useTools} onChange={(e) => setUseTools(e.target.checked)} />
            <span>Model tool calls</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useWikiSearch} onChange={(e) => setUseWikiSearch(e.target.checked)} />
            <span>Arknights Wiki Search</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useEndfieldWikiSearch} onChange={(e) => setUseEndfieldWikiSearch(e.target.checked)} disabled={!health?.endfield_wiki_search_enabled} />
            <span>Endfield Wiki Search</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} disabled={!health?.brave_configured || !health?.web_search_enabled} />
            <span>Brave Web Search</span>
          </label>
          <div className="searchState">
            <Globe2 size={14} />
            <span>AK Wiki: {health?.wiki_search_enabled ? 'on' : 'off'} · Endfield: {health?.endfield_wiki_search_enabled ? 'on' : 'off'} · Brave: {health?.brave_configured ? 'key ok' : 'no key'}</span>
          </div>
          <label className="range">
            <span>Контекст: {topK}</span>
            <input min="3" max="20" type="range" value={topK} onChange={(e) => setTopK(e.target.value)} />
          </label>
        </section>

        <section className="memory">
          <div className="sectionTitle"><Sparkles size={16} /> Memory</div>
          {Object.keys(memory).length === 0 ? (
            <p className="muted">Пока пусто.</p>
          ) : (
            Object.entries(memory).map(([key, value]) => (
              <div className="memoryItem" key={key}>
                <strong>{key}</strong>
                <span>{value}</span>
              </div>
            ))
          )}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Локальный индекс + облачная модель</div>
            <h2>{activeChat?.title || 'Чат по базе Arknights'}</h2>
          </div>
          <div className="apiBase">{health?.base_url || API}</div>
        </header>

        {error && <div className="error">{error}</div>}

        <div className="chatPane">
          <div className="messages">
            {userMessages.map((message, index) => (
              <article key={index} className={cls('message', message.role)}>
                <div className="messageRole">{message.role === 'user' ? 'Вы' : 'Agent'}</div>
                <div className="messageText">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </article>
            ))}
            {busy && (
              <article className="message assistant">
                <div className="messageRole">Agent</div>
                <div className="messageText muted">Ищу по индексу и вызываю модель...</div>
              </article>
            )}
            <div ref={endRef} />
          </div>

          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Например: сравни Amiya и Kal'tsit по лору или найди материалы D32 Steel"
            />
            <button className="sendButton" onClick={send} disabled={Boolean(busyChatId) || !input.trim()} title="Отправить">
              <Send size={18} />
            </button>
          </div>
        </div>
      </section>

      <aside className="inspector">
        <section className="searchBox">
          <div className="sectionTitle"><Search size={16} /> Быстрый поиск</div>
          <div className="searchLine">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
            <button onClick={runSearch} title="Искать"><Search size={16} /></button>
          </div>
        </section>

        <section className="results">
          <div className="sectionTitle"><MessageSquare size={16} /> Источники ответа</div>
          {(sources.length ? sources : searchResults).slice(0, 8).map((item) => (
            <div className="sourceItem" key={`${item.category}-${item.id}`}>
              <div className="sourceMeta">{item.category} · {item.source}</div>
              <strong>{item.title}</strong>
              <p>{item.snippet || item.body}</p>
            </div>
          ))}
          {!sources.length && !searchResults.length && <p className="muted">Источники появятся после ответа или поиска.</p>}
        </section>

        <section className="imageResults">
          <div className="sectionTitle"><Wrench size={16} /> Изображения</div>
          <div className="imageGrid">
            {images.map((image) => (
              <figure key={image.id}>
                <img src={`${API}${image.url}`} alt={image.name} />
                <figcaption>{image.name}</figcaption>
              </figure>
            ))}
          </div>
          {!images.length && <p className="muted">Подходящие картинки будут показаны после запроса.</p>}
        </section>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
