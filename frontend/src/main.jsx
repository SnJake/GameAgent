import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Check,
  Database,
  Globe2,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Palette,
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
const UI_STYLE_KEY = 'db-gameagent-ui-style';
const UI_STYLE_PICKED_KEY = 'db-gameagent-ui-style-picked';
const THEME_KEY = 'db-gameagent-theme';
const APP_NAME = 'DB GameAgent';

const LANGUAGES = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' }
];

const UI_STYLES = [
  { id: 'foundry', key: 'styleFoundry', title: 'Foundry', meta: 'current tactical dark' },
  { id: 'atlas', key: 'styleAtlas', title: 'Atlas', meta: 'warm editorial' },
  { id: 'halo', key: 'styleHalo', title: 'Halo', meta: 'spatial glass' },
  { id: 'pulse', key: 'stylePulse', title: 'Pulse', meta: 'dense pro-tool' },
  { id: 'synth', key: 'styleSynth', title: 'Synth', meta: 'AI dev-tool' },
  { id: 'atelier', key: 'styleAtelier', title: 'Atelier', meta: 'editorial gradient' }
];

const THEMES = [
  { id: 'dark', key: 'themeDark' },
  { id: 'graphite', key: 'themeGraphite' },
  { id: 'light', key: 'themeLight' }
];

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

const UI_I18N = {
  ru: {
    style: 'Стиль',
    theme: 'Тема',
    styleFoundry: 'Foundry · текущий тактический',
    styleAtlas: 'Atlas · теплый editorial',
    styleHalo: 'Halo · spatial glass',
    stylePulse: 'Pulse · плотный pro-tool',
    styleSynth: 'Synth · AI dev-tool',
    styleAtelier: 'Atelier · editorial gradient',
    themeDark: 'Темная',
    themeGraphite: 'Графит',
    themeLight: 'Светлая',
    user: 'Вы',
    agent: 'Агент',
    chooseStyleTitle: 'Выбери интерфейс',
    chooseStyleSubtitle: 'Выбор сохранится для следующих запусков. Потом стиль, тему и язык можно менять в шапке или настройках.',
    chooseStyleHint: 'Сохранится один раз при запуске',
    openStyle: 'Открыть',
    launchFoundryDesc: 'Текущий стиль проекта: темная рабочая среда, янтарный акцент, плотные панели и спокойная читаемость.',
    launchAtlasDesc: 'Теплая editorial-эстетика из preview с кремовыми тонами и мягким ритмом для длинных ответов.',
    launchHaloDesc: 'Spatial glass: стеклянные панели, глубина, аква-акцент и более воздушная композиция.',
    launchPulseDesc: 'Плотный pro-tool в духе Linear/Vercel: тонкие линии, строгая сетка и высокая информационная плотность.',
    launchSynthDesc: 'AI dev-tool: контрастный workspace, cyan-акцент и инженерный характер интерфейса.',
    launchAtelierDesc: 'Editorial gradient: светящаяся брендовая подача с градиентным акцентом и мягкими поверхностями.'
  },
  en: {
    style: 'Style',
    theme: 'Theme',
    styleFoundry: 'Foundry · current tactical',
    styleAtlas: 'Atlas · warm editorial',
    styleHalo: 'Halo · spatial glass',
    stylePulse: 'Pulse · dense pro-tool',
    styleSynth: 'Synth · AI dev-tool',
    styleAtelier: 'Atelier · editorial gradient',
    themeDark: 'Dark',
    themeGraphite: 'Graphite',
    themeLight: 'Light',
    user: 'You',
    agent: 'Agent',
    chooseStyleTitle: 'Choose your interface',
    chooseStyleSubtitle: 'The choice is saved for future launches. You can still change style, theme, and language from the header or settings.',
    chooseStyleHint: 'Saved once at launch',
    openStyle: 'Open',
    launchFoundryDesc: 'The current project style: dark tactical workspace, amber accent, dense panels, and calm readability.',
    launchAtlasDesc: 'Warm editorial preview aesthetic with cream tones and a softer rhythm for long answers.',
    launchHaloDesc: 'Spatial glass: frosted panels, depth, aqua accents, and a more atmospheric composition.',
    launchPulseDesc: 'Dense pro-tool in the spirit of Linear/Vercel: fine lines, strict grid, and high information density.',
    launchSynthDesc: 'AI dev-tool: high-contrast workspace, cyan accent, and an engineering-focused feel.',
    launchAtelierDesc: 'Editorial gradient: luminous brand treatment with gradient accents and soft surfaces.'
  },
  zh: {
    welcome: '欢迎。你可以询问干员、物品、敌人、关卡或剧情。如果数据库为空，请先重建索引。',
    newChat: '新对话',
    emptyAnswer: '模型返回为空。',
    error: '错误',
    connected: '模型已连接',
    needEnv: '需要在 .env 中配置密钥和模型',
    chats: '对话',
    requests: '次请求',
    deleteChat: '删除对话',
    documents: '文档',
    images: '图片',
    rebuilding: '正在索引',
    rebuildIndex: '重建索引',
    settings: '设置',
    language: '语言',
    provider: 'LLM 提供商',
    model: '模型',
    modelSearch: '搜索模型',
    loadingModels: '正在加载模型...',
    noModels: '模型列表不可用，将使用 .env 或手动输入的模型。',
    manualModel: '手动模型',
    memory: '用户记忆',
    tools: '模型工具调用',
    akWiki: 'Arknights Wiki 搜索',
    endfieldWiki: 'Endfield Wiki 搜索',
    brave: 'Brave 网页搜索',
    sourcesLimit: '来源数量',
    contextChars: '上下文字符',
    historyMessages: '历史消息',
    temperature: '温度',
    memoryTitle: '记忆',
    memoryEmpty: '暂时为空。',
    eyebrow: '本地索引 + 外部来源 + 云端或本地模型',
    chatTitle: '游戏数据库聊天',
    searching: '正在搜索索引并调用模型...',
    placeholder: '例如：按剧情比较 Amiya 和 Kal\'tsit，或查找 D32 Steel 材料',
    send: '发送',
    quickSearch: '快速搜索',
    search: '搜索',
    answerSources: '回答来源',
    sourcesEmpty: '回答或搜索后会显示来源。',
    imageTitle: '图片',
    imagesEmpty: '请求后会显示相关图片。',
    indexUpdated: '索引已更新：{documents} 个文档，{images} 张图片。',
    loadingProviders: '正在加载提供商...',
    notConfigured: '未配置',
    keyOk: '密钥正常',
    noKey: '无密钥',
    on: '开',
    off: '关',
    user: '你',
    style: '风格',
    theme: '主题',
    styleFoundry: 'Foundry · 当前战术风',
    styleAtlas: 'Atlas · 温暖编辑风',
    styleHalo: 'Halo · 空间玻璃',
    stylePulse: 'Pulse · 紧凑专业',
    styleSynth: 'Synth · AI 开发工具',
    styleAtelier: 'Atelier · 编辑渐变',
    themeDark: '深色',
    themeGraphite: '石墨',
    themeLight: '浅色',
    chooseStyleTitle: '选择界面',
    chooseStyleSubtitle: '选择会为以后启动保存。之后仍可在顶部或设置中修改风格、主题和语言。',
    chooseStyleHint: '首次启动保存',
    openStyle: '打开',
    launchFoundryDesc: '项目当前风格：深色战术工作区、琥珀强调色、紧凑面板和稳定可读性。',
    launchAtlasDesc: '来自 preview 的温暖编辑风，奶油色调和更柔和的长回答节奏。',
    launchHaloDesc: '空间玻璃：磨砂面板、深度、青色强调和更轻盈的构图。',
    launchPulseDesc: 'Linear/Vercel 风格的紧凑专业工具：细线、严格网格和高信息密度。',
    launchSynthDesc: 'AI 开发工具：高对比工作区、青色强调和工程化气质。',
    launchAtelierDesc: '编辑渐变：发光品牌感、渐变强调和柔和表面。'
  },
  ja: {
    welcome: 'ようこそ。オペレーター、アイテム、敵、ステージ、ストーリーについて質問できます。データベースが空なら、まずインデックスを再構築してください。',
    newChat: '新規チャット',
    emptyAnswer: 'モデルの応答が空です。',
    error: 'エラー',
    connected: 'モデル接続済み',
    needEnv: '.env にキーとモデルを設定してください',
    chats: 'チャット',
    requests: '件のリクエスト',
    deleteChat: 'チャットを削除',
    documents: 'ドキュメント',
    images: '画像',
    rebuilding: '索引作成中',
    rebuildIndex: 'インデックス再構築',
    settings: '設定',
    language: '言語',
    provider: 'LLM プロバイダー',
    model: 'モデル',
    modelSearch: 'モデルを検索',
    loadingModels: 'モデルを読み込み中...',
    noModels: 'モデル一覧を取得できません。.env または手動入力のモデルを使用します。',
    manualModel: '手動モデル',
    memory: 'ユーザーメモリ',
    tools: 'モデルのツール呼び出し',
    akWiki: 'Arknights Wiki 検索',
    endfieldWiki: 'Endfield Wiki 検索',
    brave: 'Brave Web 検索',
    sourcesLimit: 'ソース数',
    contextChars: 'コンテキスト文字数',
    historyMessages: '履歴メッセージ',
    temperature: '温度',
    memoryTitle: 'メモリ',
    memoryEmpty: 'まだ空です。',
    eyebrow: 'ローカル索引 + 外部ソース + クラウドまたはローカルモデル',
    chatTitle: 'ゲームデータベースチャット',
    searching: '索引を検索してモデルを呼び出しています...',
    placeholder: '例: Amiya と Kal\'tsit をストーリーで比較、または D32 Steel の素材を探す',
    send: '送信',
    quickSearch: 'クイック検索',
    search: '検索',
    answerSources: '回答ソース',
    sourcesEmpty: '回答または検索後にソースが表示されます。',
    imageTitle: '画像',
    imagesEmpty: 'リクエスト後に関連画像が表示されます。',
    indexUpdated: 'インデックス更新: {documents} 件のドキュメント、{images} 件の画像。',
    loadingProviders: 'プロバイダーを読み込み中...',
    notConfigured: '未設定',
    keyOk: 'キー OK',
    noKey: 'キーなし',
    on: 'オン',
    off: 'オフ',
    user: 'あなた',
    style: 'スタイル',
    theme: 'テーマ',
    styleFoundry: 'Foundry · 現在のタクティカル',
    styleAtlas: 'Atlas · 暖かいエディトリアル',
    styleHalo: 'Halo · スペーシャルグラス',
    stylePulse: 'Pulse · 密度の高いプロツール',
    styleSynth: 'Synth · AI 開発ツール',
    styleAtelier: 'Atelier · エディトリアルグラデ',
    themeDark: 'ダーク',
    themeGraphite: 'グラファイト',
    themeLight: 'ライト',
    chooseStyleTitle: 'インターフェースを選択',
    chooseStyleSubtitle: '選択は次回起動以降も保存されます。スタイル、テーマ、言語は後からヘッダーや設定で変更できます。',
    chooseStyleHint: '初回起動時に保存',
    openStyle: '開く',
    launchFoundryDesc: '現在のプロジェクトスタイル: ダークな戦術ワークスペース、アンバーのアクセント、密度の高いパネル、落ち着いた可読性。',
    launchAtlasDesc: 'preview の暖かいエディトリアル美学。クリームトーンと長文回答向けの柔らかいリズム。',
    launchHaloDesc: 'スペーシャルグラス: すりガラスのパネル、奥行き、アクアアクセント、より空気感のある構成。',
    launchPulseDesc: 'Linear/Vercel 風の高密度プロツール。細い線、厳密なグリッド、高い情報密度。',
    launchSynthDesc: 'AI 開発ツール: 高コントラストのワークスペース、シアンアクセント、エンジニアリング寄りの質感。',
    launchAtelierDesc: 'エディトリアルグラデーション: 発光するブランド表現、グラデーションアクセント、柔らかな面。'
  },
  ko: {
    welcome: '환영합니다. 오퍼레이터, 아이템, 적, 스테이지, 스토리에 대해 물어보세요. 데이터베이스가 비어 있으면 먼저 인덱스를 다시 빌드하세요.',
    newChat: '새 채팅',
    emptyAnswer: '모델 응답이 비어 있습니다.',
    error: '오류',
    connected: '모델 연결됨',
    needEnv: '.env에 키와 모델을 설정하세요',
    chats: '채팅',
    requests: '요청',
    deleteChat: '채팅 삭제',
    documents: '문서',
    images: '이미지',
    rebuilding: '인덱싱 중',
    rebuildIndex: '인덱스 다시 빌드',
    settings: '설정',
    language: '언어',
    provider: 'LLM 제공자',
    model: '모델',
    modelSearch: '모델 검색',
    loadingModels: '모델 로드 중...',
    noModels: '모델 목록을 사용할 수 없습니다. .env 또는 수동 입력 모델을 사용합니다.',
    manualModel: '수동 모델',
    memory: '사용자 메모리',
    tools: '모델 도구 호출',
    akWiki: 'Arknights Wiki 검색',
    endfieldWiki: 'Endfield Wiki 검색',
    brave: 'Brave 웹 검색',
    sourcesLimit: '소스',
    contextChars: '컨텍스트 문자',
    historyMessages: '히스토리 메시지',
    temperature: '온도',
    memoryTitle: '메모리',
    memoryEmpty: '아직 비어 있습니다.',
    eyebrow: '로컬 인덱스 + 외부 소스 + 클라우드 또는 로컬 모델',
    chatTitle: '게임 데이터베이스 채팅',
    searching: '인덱스를 검색하고 모델을 호출하는 중...',
    placeholder: '예: Amiya와 Kal\'tsit을 스토리 기준으로 비교하거나 D32 Steel 재료 찾기',
    send: '보내기',
    quickSearch: '빠른 검색',
    search: '검색',
    answerSources: '답변 소스',
    sourcesEmpty: '답변 또는 검색 후 소스가 표시됩니다.',
    imageTitle: '이미지',
    imagesEmpty: '요청 후 관련 이미지가 표시됩니다.',
    indexUpdated: '인덱스 업데이트: 문서 {documents}개, 이미지 {images}개.',
    loadingProviders: '제공자 로드 중...',
    notConfigured: '설정 안 됨',
    keyOk: '키 정상',
    noKey: '키 없음',
    on: '켜짐',
    off: '꺼짐',
    user: '나',
    style: '스타일',
    theme: '테마',
    styleFoundry: 'Foundry · 현재 전술형',
    styleAtlas: 'Atlas · 따뜻한 에디토리얼',
    styleHalo: 'Halo · 공간 글래스',
    stylePulse: 'Pulse · 조밀한 프로 툴',
    styleSynth: 'Synth · AI 개발 툴',
    styleAtelier: 'Atelier · 에디토리얼 그라데이션',
    themeDark: '다크',
    themeGraphite: '그래파이트',
    themeLight: '라이트',
    chooseStyleTitle: '인터페이스 선택',
    chooseStyleSubtitle: '선택은 다음 실행에도 저장됩니다. 이후에도 헤더나 설정에서 스타일, 테마, 언어를 바꿀 수 있습니다.',
    chooseStyleHint: '첫 실행 때 저장',
    openStyle: '열기',
    launchFoundryDesc: '현재 프로젝트 스타일: 어두운 전술형 작업 공간, 앰버 포인트, 조밀한 패널, 차분한 가독성.',
    launchAtlasDesc: 'preview의 따뜻한 에디토리얼 미학. 크림 톤과 긴 답변에 맞는 부드러운 리듬.',
    launchHaloDesc: '공간 글래스: 반투명 패널, 깊이감, 아쿠아 포인트, 더 가벼운 구성.',
    launchPulseDesc: 'Linear/Vercel 느낌의 조밀한 프로 툴: 얇은 선, 엄격한 그리드, 높은 정보 밀도.',
    launchSynthDesc: 'AI 개발 툴: 고대비 워크스페이스, 시안 포인트, 엔지니어링 중심의 분위기.',
    launchAtelierDesc: '에디토리얼 그라데이션: 빛나는 브랜드 처리, 그라데이션 포인트, 부드러운 표면.'
  }
};

for (const lang of Object.keys(UI_I18N)) {
  I18N[lang] = { ...(I18N.en || {}), ...(I18N[lang] || {}), ...UI_I18N[lang] };
}

function getI18n(lang) {
  return I18N[lang] || I18N.ru || I18N.en;
}

function cls(...items) {
  return items.filter(Boolean).join(' ');
}

function createWelcome(lang) {
  return { role: 'assistant', content: getI18n(lang).welcome, welcome: true };
}

function createChat(lang, title = getI18n(lang).newChat) {
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
  if (!clean) return getI18n(lang).newChat;
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

function styleDescriptionKey(styleId) {
  return `launch${styleId[0].toUpperCase()}${styleId.slice(1)}Desc`;
}

function StylePicker({ t, value, onChange, compact = false }) {
  return (
    <label className={compact ? 'toolbarSelect' : 'selectLabel'}>
      <span>{t.style}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {UI_STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            {t[style.key] || style.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemePicker({ t, value, onChange, compact = false }) {
  return (
    <label className={compact ? 'toolbarSelect' : 'selectLabel'}>
      <span>{t.theme}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {THEMES.map((themeItem) => (
          <option key={themeItem.id} value={themeItem.id}>
            {t[themeItem.key] || themeItem.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function LanguagePicker({ t, value, onChange, compact = false }) {
  return (
    <label className={compact ? 'toolbarSelect' : 'selectLabel'}>
      <span>{t.language}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {LANGUAGES.map((language) => (
          <option key={language.id} value={language.id}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StyleLauncher({ t, uiStyle, theme, lang, onTheme, onLang, onChoose }) {
  return (
    <main className="styleGate">
      <section className="styleGateHeader">
        <div className="brand">
          <div className="brandMark"><Layers size={20} /></div>
          <div>
            <h1>{APP_NAME}</h1>
            <p>{t.chooseStyleHint}</p>
          </div>
        </div>
        <div className="preferenceBar">
          <ThemePicker t={t} value={theme} onChange={onTheme} compact />
          <LanguagePicker t={t} value={lang} onChange={onLang} compact />
        </div>
      </section>

      <section className="styleGateIntro">
        <div className="eyebrow"><Palette size={14} /> {t.style}</div>
        <h2>{t.chooseStyleTitle}</h2>
        <p>{t.chooseStyleSubtitle}</p>
      </section>

      <section className="styleGrid" aria-label={t.chooseStyleTitle}>
        {UI_STYLES.map((style) => (
          <button
            key={style.id}
            className={cls('styleCard', `styleCard-${style.id}`, uiStyle === style.id && 'selected')}
            onClick={() => onChoose(style.id)}
          >
            <span className="stylePreview" />
            <span className="styleCardBody">
              <span className="styleCardTop">
                <strong>{style.title}</strong>
                {uiStyle === style.id && <Check size={17} />}
              </span>
              <small>{t[style.key] || style.meta}</small>
              <span>{t[styleDescriptionKey(style.id)]}</span>
            </span>
            <span className="styleCardAction">{t.openStyle}</span>
          </button>
        ))}
      </section>
    </main>
  );
}

function App() {
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'ru');
  const t = getI18n(lang);
  const [uiStyle, setUiStyle] = useState(() => localStorage.getItem(UI_STYLE_KEY) || 'foundry');
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [stylePicked, setStylePicked] = useState(() => localStorage.getItem(UI_STYLE_PICKED_KEY) === '1');
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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiStyle = uiStyle;
    root.dataset.theme = theme;
    root.lang = lang;
    localStorage.setItem(UI_STYLE_KEY, uiStyle);
    localStorage.setItem(THEME_KEY, theme);
  }, [uiStyle, theme, lang]);

  function chooseUiStyle(nextStyle) {
    setUiStyle(nextStyle);
    setStylePicked(true);
    localStorage.setItem(UI_STYLE_PICKED_KEY, '1');
  }

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
    const newChatTitles = new Set(Object.values(I18N).map((locale) => locale.newChat));
    const nextTitle = newChatTitles.has(activeChat.title)
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
        .map((m) => ({ role: m.role, content: m.welcome ? getI18n(lang).welcome : m.content }));
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

  if (!stylePicked) {
    return (
      <StyleLauncher
        t={t}
        uiStyle={uiStyle}
        theme={theme}
        lang={lang}
        onTheme={setTheme}
        onLang={setLang}
        onChoose={chooseUiStyle}
      />
    );
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
          <StylePicker t={t} value={uiStyle} onChange={setUiStyle} />
          <ThemePicker t={t} value={theme} onChange={setTheme} />
          <LanguagePicker t={t} value={lang} onChange={setLang} />
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
          <div className="topbarControls">
            <StylePicker t={t} value={uiStyle} onChange={setUiStyle} compact />
            <ThemePicker t={t} value={theme} onChange={setTheme} compact />
            <LanguagePicker t={t} value={lang} onChange={setLang} compact />
            <div className="apiBase">{provider || health?.llm_provider || API}{manualModel ? ` · ${manualModel}` : ''}</div>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <div className="chatPane">
          <div className="messages">
            {userMessages.map((message, index) => (
              <article key={index} className={cls('message', message.role)}>
                <div className="messageRole">{message.role === 'user' ? (t.user || 'You') : (t.agent || 'Agent')}</div>
                <div className="messageText">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </article>
            ))}
            {busy && (
              <article className="message assistant">
                <div className="messageRole">{t.agent || 'Agent'}</div>
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
