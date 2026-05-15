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
const STORAGE_KEY = 'db-gameagent-chats-v2';
const LANG_KEY = 'db-gameagent-language';
const APP_NAME = 'DB GameAgent';

const I18N = {
  ru: {
    welcome: 'Задай вопрос по операторам, предметам, врагам, стадиям или лору. Если база пустая, сначала пересобери индекс.',
    newChat: 'Новый чат',
    emptyAnswer: 'Пустой ответ модели.',
    error: 'Ошибка',
    connected: 'Модель подключена',
    needEnv: 'Нужен .env с ключом и моделью',
    chats: 'Чаты',
    requests: 'запросов',
    deleteChat: 'Удалить чат',
    documents: 'документов',
    images: 'изображений',
    rebuilding: 'Индексирую',
    rebuildIndex: 'Пересобрать индекс',
    settings: 'Настройки',
    language: 'Язык',
    provider: 'LLM provider',
    model: 'Модель',
    modelSearch: 'Поиск модели',
    loadingModels: 'Загружаю модели...',
    noModels: 'Список моделей недоступен. Используется модель из .env или ручной ввод.',
    manualModel: 'Модель вручную',
    memory: 'Память пользователя',
    tools: 'Model tool calls',
    akWiki: 'Arknights Wiki Search',
    endfieldWiki: 'Endfield Wiki Search',
    brave: 'Brave Web Search',
    sourcesLimit: 'Источников',
    contextChars: 'Символов контекста',
    historyMessages: 'Сообщений истории',
    temperature: 'Температура',
    memoryTitle: 'Memory',
    memoryEmpty: 'Пока пусто.',
    eyebrow: 'Локальный индекс + внешние источники + облачная или локальная модель',
    chatTitle: 'Чат по базе игр',
    searching: 'Ищу по индексу и вызываю модель...',
    placeholder: "Например: сравни Amiya и Kal'tsit по лору или найди материалы D32 Steel",
    send: 'Отправить',
    quickSearch: 'Быстрый поиск',
    search: 'Искать',
    answerSources: 'Источники ответа',
    sourcesEmpty: 'Источники появятся после ответа или поиска.',
    imageTitle: 'Изображения',
    imagesEmpty: 'Подходящие картинки будут показаны после запроса.',
    indexUpdated: 'Индекс обновлен: документов {documents}, изображений {images}.',
    loadingProviders: 'Загрузка провайдеров...',
    notConfigured: 'not configured',
    keyOk: 'key ok',
    noKey: 'no key',
    on: 'on',
    off: 'off'
  },
  en: {
    welcome: 'Ask about operators, items, enemies, stages, or lore. If the database is empty, rebuild the index first.',
    newChat: 'New chat',
    emptyAnswer: 'Empty model response.',
    error: 'Error',
    connected: 'Model connected',
    needEnv: 'Fill .env with an API key and model',
    chats: 'Chats',
    requests: 'requests',
    deleteChat: 'Delete chat',
    documents: 'documents',
    images: 'images',
    rebuilding: 'Indexing',
    rebuildIndex: 'Rebuild index',
    settings: 'Settings',
    language: 'Language',
    provider: 'LLM provider',
    model: 'Model',
    modelSearch: 'Search models',
    loadingModels: 'Loading models...',
    noModels: 'Model list is unavailable. The .env model or manual input will be used.',
    manualModel: 'Manual model',
    memory: 'User memory',
    tools: 'Model tool calls',
    akWiki: 'Arknights Wiki Search',
    endfieldWiki: 'Endfield Wiki Search',
    brave: 'Brave Web Search',
    sourcesLimit: 'Sources',
    contextChars: 'Context chars',
    historyMessages: 'History messages',
    temperature: 'Temperature',
    memoryTitle: 'Memory',
    memoryEmpty: 'Empty for now.',
    eyebrow: 'Local index + external sources + cloud or local model',
    chatTitle: 'Game database chat',
    searching: 'Searching the index and calling the model...',
    placeholder: "Example: compare Amiya and Kal'tsit by lore or find D32 Steel materials",
    send: 'Send',
    quickSearch: 'Quick search',
    search: 'Search',
    answerSources: 'Answer sources',
    sourcesEmpty: 'Sources will appear after an answer or search.',
    imageTitle: 'Images',
    imagesEmpty: 'Relevant images will appear after a request.',
    indexUpdated: 'Index updated: {documents} documents, {images} images.',
    loadingProviders: 'Loading providers...',
    notConfigured: 'not configured',
    keyOk: 'key ok',
    noKey: 'no key',
    on: 'on',
    off: 'off'
  }
};

function cls(...items) {
  return items.filter(Boolean).join(' ');
}

function createWelcome(lang) {
  return { role: 'assistant', content: I18N[lang].welcome, welcome: true };
}

function createChat(lang, title = I18N[lang].newChat) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    messages: [createWelcome(lang)],
    sources: [],
    images: [],
    createdAt: now,
    updatedAt: now
  };
}

function titleFromText(text, lang) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return I18N[lang].newChat;
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
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'ru');
  const t = I18N[lang];
  const [health, setHealth] = useState(null);
  const [chats, setChats] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Ignore broken localStorage.
    }
    return [createChat(lang)];
  });
  const [activeChatId, setActiveChatId] = useState(() => chats[0]?.id);
  const [input, setInput] = useState('');
  const [busyChatId, setBusyChatId] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [memory, setMemory] = useState({});
  const [provider, setProvider] = useState('');
  const [models, setModels] = useState([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [useTools, setUseTools] = useState(false);
  const [useWikiSearch, setUseWikiSearch] = useState(true);
  const [useEndfieldWikiSearch, setUseEndfieldWikiSearch] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [retrievalLimit, setRetrievalLimit] = useState(8);
  const [maxContextChars, setMaxContextChars] = useState(9000);
  const [maxHistoryMessages, setMaxHistoryMessages] = useState(8);
  const [temperature, setTemperature] = useState(0.2);
  const [rebuilding, setRebuilding] = useState(false);
  const endRef = useRef(null);
  const runtimeSettingsLoadedRef = useRef(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) || chats[0],
    [chats, activeChatId]
  );
  const messages = activeChat?.messages || [createWelcome(lang)];
  const sources = activeChat?.sources || [];
  const images = activeChat?.images || [];
  const busy = busyChatId === activeChat?.id;
  const userMessages = useMemo(
    () => messages.filter((m) => m.role !== 'system').map((m) => (m.welcome ? { ...m, content: t.welcome } : m)),
    [messages, t.welcome]
  );
  const filteredModels = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase();
    if (!needle) return models.slice(0, 200);
    return models.filter((model) => model.toLowerCase().includes(needle)).slice(0, 200);
  }, [models, modelSearch]);
  const selectedProvider = useMemo(
    () => (health?.providers || []).find((item) => item.id === provider),
    [health, provider]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  async function refresh() {
    try {
      const [h, m] = await Promise.all([api('/api/health'), api('/api/memory')]);
      setHealth(h);
      setProvider((current) => current || h.llm_provider || '');
      setSelectedModel((current) => current || h.llm_model || '');
      setManualModel((current) => current || h.llm_model || '');
      if (!runtimeSettingsLoadedRef.current) {
        setTemperature(h.llm_temperature ?? 0.2);
        setRetrievalLimit(h.max_context_results ?? 8);
        setMaxContextChars(h.max_context_chars ?? 9000);
        setMaxHistoryMessages(h.max_history_messages ?? 8);
        runtimeSettingsLoadedRef.current = true;
      }
      setMemory(m.memory || {});
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    async function loadModels() {
      setModelLoading(true);
      try {
        const result = await api(`/api/providers/${encodeURIComponent(provider)}/models`);
        if (cancelled) return;
        const nextModels = result.models || [];
        setModels(nextModels);
        const nextDefault = result.default_model || '';
        setSelectedModel((current) => (current && nextModels.includes(current) ? current : nextDefault || nextModels[0] || ''));
        setManualModel((current) => current || nextDefault || nextModels[0] || '');
        setModelSearch('');
      } catch {
        if (!cancelled) {
          setModels([]);
          setSelectedModel('');
        }
      } finally {
        if (!cancelled) setModelLoading(false);
      }
    }
    loadModels();
    return () => {
      cancelled = true;
    };
  }, [provider]);

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
    const chat = createChat(lang);
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput('');
    setError('');
    setSearchResults([]);
  }

  function deleteChat(chatId) {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== chatId);
      const fallback = next[0] || createChat(lang);
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
    const nextTitle = activeChat.title === I18N.ru.newChat || activeChat.title === I18N.en.newChat
      ? titleFromText(text, lang)
      : activeChat.title;
    const model = selectedModel || manualModel.trim() || selectedProvider?.model || undefined;

    setError('');
    setInput('');
    updateChat(chatId, (chat) => ({ ...chat, title: nextTitle, messages: nextMessages }));
    setBusyChatId(chatId);

    try {
      const payloadMessages = nextMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.welcome ? I18N[lang].welcome : m.content }));
      const result = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: payloadMessages,
          provider: provider || undefined,
          model,
          temperature: Number(temperature),
          use_memory: useMemory,
          use_tool_calls: useTools,
          use_wiki_search: useWikiSearch,
          use_endfield_wiki_search: useEndfieldWikiSearch,
          use_web_search: useWebSearch,
          retrieval_limit: Number(retrievalLimit),
          top_k: Number(retrievalLimit),
          max_context_chars: Number(maxContextChars),
          max_history_messages: Number(maxHistoryMessages)
        })
      });
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [...nextMessages, { role: 'assistant', content: result.answer || t.emptyAnswer }],
        sources: result.sources || [],
        images: result.images || []
      }));
    } catch (err) {
      setError(err.message);
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [...nextMessages, { role: 'assistant', content: `${t.error}: ${err.message}` }]
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
            {
              role: 'assistant',
              content: t.indexUpdated.replace('{documents}', result.documents).replace('{images}', result.images)
            }
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
            <h1>{APP_NAME}</h1>
            <p>{health?.model_configured ? t.connected : t.needEnv}</p>
          </div>
        </div>

        <section className="chatList">
          <div className="sectionTitle rowTitle">
            <span><MessageSquare size={16} /> {t.chats}</span>
            <button className="iconButton" onClick={addChat} title={t.newChat}><Plus size={16} /></button>
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
                  <small>{chat.messages.filter((m) => m.role === 'user').length} {t.requests}</small>
                </span>
                <button
                  className="deleteChat"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteChat(chat.id);
                  }}
                  title={t.deleteChat}
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
            <span>{health?.documents ?? 0} {t.documents}</span>
          </div>
          <div className="statusLine">
            <ImageIcon size={16} />
            <span>{health?.images ?? 0} {t.images}</span>
          </div>
          <button className="wideButton" onClick={rebuildIndex} disabled={rebuilding}>
            <RefreshCw size={16} className={cls(rebuilding && 'spin')} />
            {rebuilding ? t.rebuilding : t.rebuildIndex}
          </button>
        </section>

        <section className="settings">
          <div className="sectionTitle"><Settings size={16} /> {t.settings}</div>
          <label className="selectLabel">
            <span>{t.language}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="selectLabel">
            <span>{t.provider}</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={!health?.providers?.length}>
              {!health?.providers?.length && <option value="">{t.loadingProviders}</option>}
              {(health?.providers || []).map((item) => (
                <option key={item.id} value={item.id} disabled={!item.configured}>
                  {item.label}{item.model ? ` · ${item.model}` : ''}{item.configured ? '' : ` · ${t.notConfigured}`}
                </option>
              ))}
            </select>
          </label>
          <label className="selectLabel">
            <span>{t.model}</span>
            <input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder={t.modelSearch} />
            <select value={selectedModel} onChange={(e) => {
              setSelectedModel(e.target.value);
              setManualModel(e.target.value);
            }} disabled={modelLoading || filteredModels.length === 0}>
              {modelLoading && <option value="">{t.loadingModels}</option>}
              {!modelLoading && filteredModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            {!modelLoading && models.length === 0 && <span className="fieldHint">{t.noModels}</span>}
            <input value={manualModel} onChange={(e) => {
              setManualModel(e.target.value);
              setSelectedModel('');
            }} placeholder={t.manualModel} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useMemory} onChange={(e) => setUseMemory(e.target.checked)} />
            <span>{t.memory}</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useTools} onChange={(e) => setUseTools(e.target.checked)} disabled={selectedProvider && !selectedProvider.supports_tools} />
            <span>{t.tools}</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useWikiSearch} onChange={(e) => setUseWikiSearch(e.target.checked)} />
            <span>{t.akWiki}</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useEndfieldWikiSearch} onChange={(e) => setUseEndfieldWikiSearch(e.target.checked)} disabled={!health?.endfield_wiki_search_enabled} />
            <span>{t.endfieldWiki}</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} disabled={!health?.brave_configured || !health?.web_search_enabled} />
            <span>{t.brave}</span>
          </label>
          <div className="searchState">
            <Globe2 size={14} />
            <span>AK Wiki: {health?.wiki_search_enabled ? t.on : t.off} · Endfield: {health?.endfield_wiki_search_enabled ? t.on : t.off} · Brave: {health?.brave_configured ? t.keyOk : t.noKey}</span>
          </div>
          <label className="range">
            <span>{t.temperature}: {Number(temperature).toFixed(2)}</span>
            <input min="0" max="2" step="0.05" type="range" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </label>
          <label className="range">
            <span>{t.sourcesLimit}: {retrievalLimit}</span>
            <input min="1" max="30" type="range" value={retrievalLimit} onChange={(e) => setRetrievalLimit(Number(e.target.value))} />
          </label>
          <label className="range">
            <span>{t.contextChars}: {maxContextChars}</span>
            <input min="1000" max="60000" step="1000" type="range" value={maxContextChars} onChange={(e) => setMaxContextChars(Number(e.target.value))} />
          </label>
          <label className="range">
            <span>{t.historyMessages}: {maxHistoryMessages}</span>
            <input min="2" max="60" type="range" value={maxHistoryMessages} onChange={(e) => setMaxHistoryMessages(Number(e.target.value))} />
          </label>
        </section>

        <section className="memory">
          <div className="sectionTitle"><Sparkles size={16} /> {t.memoryTitle}</div>
          {Object.keys(memory).length === 0 ? (
            <p className="muted">{t.memoryEmpty}</p>
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
            <div className="eyebrow">{t.eyebrow}</div>
            <h2>{activeChat?.title || t.chatTitle}</h2>
          </div>
          <div className="apiBase">{provider || health?.llm_provider || API}{manualModel ? ` · ${manualModel}` : ''}</div>
        </header>

        {error && <div className="error">{error}</div>}

        <div className="chatPane">
          <div className="messages">
            {userMessages.map((message, index) => (
              <article key={index} className={cls('message', message.role)}>
                <div className="messageRole">{message.role === 'user' ? (lang === 'ru' ? 'Вы' : 'You') : 'Agent'}</div>
                <div className="messageText">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </article>
            ))}
            {busy && (
              <article className="message assistant">
                <div className="messageRole">Agent</div>
                <div className="messageText muted">{t.searching}</div>
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
              placeholder={t.placeholder}
            />
            <button className="sendButton" onClick={send} disabled={Boolean(busyChatId) || !input.trim()} title={t.send}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </section>

      <aside className="inspector">
        <section className="searchBox">
          <div className="sectionTitle"><Search size={16} /> {t.quickSearch}</div>
          <div className="searchLine">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
            <button onClick={runSearch} title={t.search}><Search size={16} /></button>
          </div>
        </section>

        <section className="results">
          <div className="sectionTitle"><MessageSquare size={16} /> {t.answerSources}</div>
          {(sources.length ? sources : searchResults).slice(0, 8).map((item) => (
            <div className="sourceItem" key={`${item.category}-${item.id}`}>
              <div className="sourceMeta">{item.category} · {item.source}</div>
              <strong>{item.title}</strong>
              <p>{item.snippet || item.body}</p>
            </div>
          ))}
          {!sources.length && !searchResults.length && <p className="muted">{t.sourcesEmpty}</p>}
        </section>

        <section className="imageResults">
          <div className="sectionTitle"><Wrench size={16} /> {t.imageTitle}</div>
          <div className="imageGrid">
            {images.map((image) => (
              <figure key={image.id}>
                <img src={`${API}${image.url}`} alt={image.name} />
                <figcaption>{image.name}</figcaption>
              </figure>
            ))}
          </div>
          {!images.length && <p className="muted">{t.imagesEmpty}</p>}
        </section>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
