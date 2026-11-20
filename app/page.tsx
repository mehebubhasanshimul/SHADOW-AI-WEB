"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

const SUGGESTIONS = [
  "বাংলায় একটি সুন্দর গল্প লেখো",
  "Create a modern website using HTML",
  "Explain artificial intelligence simply",
  "Help me debug my JavaScript code"
];

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("LOCAL AI READY");
  const [theme, setTheme] = useState("dark");
  const [sidebar, setSidebar] = useState(false);

  const engine = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find(c => c.id === activeId);
  const messages = activeChat?.messages || [];

  // Load saved conversations
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shadow-ai-chats");
      const savedTheme = localStorage.getItem("shadow-ai-theme");

      if (savedTheme) setTheme(savedTheme);

      if (saved) {
        const parsed = JSON.parse(saved) as Chat[];

        if (parsed.length) {
          setChats(parsed);
          setActiveId(parsed[0].id);
          return;
        }
      }

      const first: Chat = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: []
      };

      setChats([first]);
      setActiveId(first.id);
    } catch {
      setChats([]);
    }
  }, []);

  // Save conversations
  useEffect(() => {
    if (chats.length) {
      localStorage.setItem(
        "shadow-ai-chats",
        JSON.stringify(chats)
      );
    }
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("shadow-ai-theme", theme);
  }, [theme]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, loading]);

  function newChat() {
    if (loading) return;

    const chat: Chat = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: []
    };

    setChats(prev => [chat, ...prev]);
    setActiveId(chat.id);
    setSidebar(false);
    setPrompt("");
  }

  function updateChat(
    id: string,
    callback: (chat: Chat) => Chat
  ) {
    setChats(prev =>
      prev.map(chat =>
        chat.id === id ? callback(chat) : chat
      )
    );
  }

  async function sendMessage(text = prompt) {
    const question = text.trim();

    if (!question || loading || !activeId) return;

    const chatId = activeId;
    const oldMessages = chats.find(
      c => c.id === chatId
    )?.messages || [];

    const userMessage: Message = {
      role: "user",
      content: question
    };

    const assistantMessage: Message = {
      role: "assistant",
      content: ""
    };

    const conversation = [
      ...oldMessages,
      userMessage,
      assistantMessage
    ];

    updateChat(chatId, chat => ({
      ...chat,
      title:
        chat.messages.length === 0
          ? question.slice(0, 35)
          : chat.title,
      messages: conversation
    }));

    setPrompt("");
    setLoading(true);
    setStatus("STARTING LOCAL AI...");

    try {
      // Import AI runtime only in the browser
      if (!engine.current) {
        const { pipeline } = await import(
          "@huggingface/transformers"
        );

        setStatus("DOWNLOADING AI MODEL...");

        engine.current = await pipeline(
          "text-generation",
          MODEL_ID,
          {
            dtype: "q4",
            progress_callback: (progress: any) => {
              setStatus(
                progress?.status === "progress"
                  ? `DOWNLOADING MODEL... ${Math.round(progress.progress || 0)}%`
                  : "LOADING LOCAL AI..."
              );
            }
          }
        );
      }

      setStatus("SHADOW AI IS THINKING...");

      const { TextStreamer } = await import(
        "@huggingface/transformers"
      );

      const context = conversation
        .filter(m => m.content)
        .slice(-9, -1)
        .map(m =>
          `<|im_start|>${m.role}\n${m.content}<|im_end|>`
        )
        .join("\n");

      const formattedPrompt =
        `<|im_start|>system\n` +
        `You are SHADOW AI, a helpful multilingual assistant. ` +
        `Answer in the same language as the user. ` +
        `Support Bangla and English. Be accurate and clear.` +
        `<|im_end|>\n` +
        context +
        (context ? "\n" : "") +
        `<|im_start|>user\n${question}<|im_end|>\n` +
        `<|im_start|>assistant\n`;

      let streamedText = "";

      const streamer = new TextStreamer(
        engine.current.tokenizer,
        {
          skip_prompt: true,
          callback_function: (chunk: string) => {
            streamedText += chunk;

            updateChat(chatId, chat => {
              const updated = [...chat.messages];
              const last = updated.length - 1;

              updated[last] = {
                role: "assistant",
                content: streamedText
              };

              return {
                ...chat,
                messages: updated
              };
            });
          }
        }
      );

      await engine.current(
        formattedPrompt,
        {
          max_new_tokens: 180,
          temperature: 0.7,
          do_sample: true,
          top_p: 0.9,
          repetition_penalty: 1.1,
          streamer
        }
      );

      if (!streamedText.trim()) {
        throw new Error(
          "The model returned an empty response."
        );
      }

      setStatus("LOCAL AI READY");

    } catch (error: any) {
      console.error("SHADOW AI:", error);

      updateChat(chatId, chat => {
        const updated = [...chat.messages];
        const last = updated.length - 1;

        updated[last] = {
          role: "assistant",
          content:
            "⚠️ SHADOW AI ERROR\n\n" +
            (error?.message || "Unknown error") +
            "\n\nPlease check your internet connection, " +
            "available RAM and browser storage. " +
            "Reload the page and try again."
        };

        return {
          ...chat,
          messages: updated
        };
      });

      setStatus("AI ERROR");

      // Reset failed engine
      engine.current = null;

    } finally {
      setLoading(false);
    }
  }

  function toggleTheme() {
    setTheme(prev =>
      prev === "dark" ? "light" : "dark"
    );
  }

  function copyText(text: string) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <main className={`app ${theme}`}>

      {/* SIDEBAR */}

      {sidebar && (
        <div
          className="overlay"
          onClick={() => setSidebar(false)}
        />
      )}

      <aside className={`sidebar ${sidebar ? "open" : ""}`}>

        <div className="side-header">
          <div className="brand">
            <div className="brand-icon">S</div>
            <div>
              <b>SHADOW <span>AI</span></b>
              <small>LOCAL INTELLIGENCE</small>
            </div>
          </div>

          <button
            className="icon-btn close-side"
            onClick={() => setSidebar(false)}
          >
            ×
          </button>
        </div>

        <button
          className="new-chat"
          onClick={newChat}
          disabled={loading}
        >
          <span>＋</span> New Chat
        </button>

        <div className="history-title">
          RECENT CONVERSATIONS
        </div>

        <div className="history">
          {chats.map(chat => (
            <button
              key={chat.id}
              className={`history-item ${
                activeId === chat.id ? "selected" : ""
              }`}
              onClick={() => {
                if (!loading) {
                  setActiveId(chat.id);
                  setSidebar(false);
                }
              }}
              disabled={loading}
            >
              <span>◈</span>
              <span className="history-name">
                {chat.title}
              </span>
            </button>
          ))}
        </div>

        <div className="side-bottom">
          <div className="model-card">
            <span className="online-dot" />
            <div>
              <b>Qwen 2.5 · 0.5B</b>
              <small>CPU / WASM ENGINE</small>
            </div>
          </div>

          <button
            className="side-setting"
            onClick={toggleTheme}
          >
            ◐ {theme === "dark" ? "Light Theme" : "Dark Theme"}
          </button>

          <div className="copyright">
            SHADOW JOKER © 2026
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <section className="main">

        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-btn menu-btn"
              onClick={() => setSidebar(true)}
            >
              ☰
            </button>

            <div className="mobile-brand">
              SHADOW <span>AI</span>
            </div>

            <span className="model-tag">
              Qwen 0.5B
            </span>
          </div>

          <div className="top-actions">
            <span className="local-tag">
              <i /> LOCAL
            </span>

            <button
              className="icon-btn"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>

            <button
              className="icon-btn"
              onClick={newChat}
              title="New chat"
              disabled={loading}
            >
              ＋
            </button>
          </div>
        </header>

        <div className="chat-area">

          {messages.length === 0 ? (

            <div className="welcome">

              <div className="hero-logo">
                <div className="hero-ring" />
                <div className="hero-letter">S</div>
              </div>

              <div className="animated-title">
                Welcome to <span>SHADOW AI</span>
              </div>

              <p className="welcome-sub">
                Your private AI assistant.
                Powered by local browser intelligence.
              </p>

              <div className="suggestions">
                {SUGGESTIONS.map((item, i) => (
                  <button
                    key={i}
                    className="suggestion"
                    onClick={() => sendMessage(item)}
                    disabled={loading}
                  >
                    <span>
                      {["✦", "⌘", "◈", "⚡"][i]}
                    </span>
                    {item}
                  </button>
                ))}
              </div>

              <div className="welcome-note">
                No API Key · No AI Backend · Browser CPU
              </div>

            </div>

          ) : (

            <div className="messages">

              {messages.map((message, index) => (
                <article
                  key={index}
                  className={`message ${message.role}`}
                >
                  <div className="avatar">
                    {message.role === "user" ? "U" : "S"}
                  </div>

                  <div className="message-content">
                    <div className="message-name">
                      {message.role === "user"
                        ? "You"
                        : "SHADOW AI"}
                    </div>

                    <div className="message-text">
                      {message.content ||
                        (loading &&
                         index === messages.length - 1
                          ? <span className="typing">
                              <i /><i /><i />
                            </span>
                          : "")}
                    </div>

                    {message.role === "assistant" &&
                     message.content && (
                      <button
                        className="copy-btn"
                        onClick={() =>
                          copyText(message.content)
                        }
                      >
                        ⧉ Copy
                      </button>
                    )}
                  </div>
                </article>
              ))}

              <div ref={endRef} />
            </div>

          )}

        </div>

        {/* INPUT AREA */}

        <div className="input-section">

          <div className="status-line">
            <span className="online-dot" />
            {status}
          </div>

          <div className="input-box">

            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Message SHADOW AI... বাংলায় লিখুন"
              rows={2}
              disabled={loading}
              onKeyDown={e => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <div className="input-bottom">
              <span className="input-hint">
                ↵ Send · Shift + ↵ New line
              </span>

              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={loading || !prompt.trim()}
              >
                {loading ? "…" : "↑"}
              </button>
            </div>

          </div>

          <p className="disclaimer">
            SHADOW AI can make mistakes. Verify important information.
          </p>

        </div>

      </section>

      {/* ANIMATIONS + RESPONSIVE DESIGN */}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
        }

        button, textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        .app {
          --cyan: #7df9ff;
          --border: rgba(125,249,255,.13);
          --muted: #9299a8;
          display: flex;
          width: 100%;
          height: 100dvh;
          overflow: hidden;
          background: #090b10;
          color: #f4f7fb;
        }

        .app.light {
          background: #f5f7fa;
          color: #151922;
          --border: rgba(0,0,0,.1);
          --muted: #737b89;
        }

        .sidebar {
          width: 270px;
          min-width: 270px;
          background: #0d1118;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 20px 14px;
          z-index: 20;
        }

        .light .sidebar {
          background: #fff;
        }

        .side-header, .brand, .topbar,
        .top-left, .top-actions {
          display: flex;
          align-items: center;
        }

        .side-header {
          justify-content: space-between;
          margin-bottom: 32px;
        }

        .brand {
          gap: 11px;
        }

        .brand-icon, .hero-letter {
          display: grid;
          place-items: center;
          color: #001115;
          font-weight: 900;
          background: linear-gradient(135deg,#7df9ff,#16a5c4);
          box-shadow: 0 0 25px #7df9ff44;
        }

        .brand-icon {
          width: 43px;
          height: 43px;
          border-radius: 13px;
          font-size: 23px;
        }

        .brand b {
          letter-spacing: 2px;
          font-size: 16px;
        }

        .brand b span, .mobile-brand span {
          color: var(--cyan);
        }

        .brand small {
          display: block;
          font-size: 9px;
          letter-spacing: 1.5px;
          color: var(--muted);
          margin-top: 4px;
        }

        .new-chat {
          padding: 14px;
          border: 1px solid var(--border);
          background: rgba(125,249,255,.06);
          color: inherit;
          border-radius: 12px;
          text-align: left;
          transition: .2s;
        }

        .new-chat:hover, .suggestion:hover {
          border-color: var(--cyan);
          background: rgba(125,249,255,.1);
        }

        .new-chat span {
          color: var(--cyan);
          margin-right: 9px;
        }

        .history-title {
          font-size: 10px;
          letter-spacing: 1.5px;
          color: var(--muted);
          margin: 30px 8px 12px;
        }

        .history {
          flex: 1;
          overflow-y: auto;
        }

        .history-item {
          width: 100%;
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 12px 10px;
          border: 0;
          border-radius: 9px;
          color: inherit;
          background: transparent;
          text-align: left;
          font-size: 12px;
        }

        .history-item.selected,
        .history-item:hover {
          background: rgba(125,249,255,.08);
        }

        .history-item > span:first-child {
          color: var(--cyan);
        }

        .history-name {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .side-bottom {
          border-top: 1px solid var(--border);
          padding-top: 15px;
        }

        .model-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: rgba(125,249,255,.05);
          border-radius: 10px;
        }

        .online-dot {
          width: 8px;
          height: 8px;
          display: inline-block;
          flex-shrink: 0;
          background: #39e99a;
          border-radius: 50%;
          box-shadow: 0 0 9px #39e99a;
        }

        .model-card b {
          font-size: 12px;
        }

        .model-card small {
          display: block;
          font-size: 9px;
          color: var(--muted);
          margin-top: 4px;
        }

        .side-setting {
          width: 100%;
          margin-top: 12px;
          background: transparent;
          border: 0;
          color: inherit;
          padding: 12px;
          text-align: left;
        }

        .copyright {
          font-size: 9px;
          color: var(--muted);
          padding: 12px;
        }

        .main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .topbar {
          height: 66px;
          min-height: 66px;
          justify-content: space-between;
          padding: 0 25px;
          border-bottom: 1px solid var(--border);
        }

        .top-left, .top-actions {
          gap: 13px;
        }

        .mobile-brand {
          font-weight: 800;
          letter-spacing: 1.5px;
          display: none;
        }

        .model-tag, .local-tag {
          font-size: 10px;
          padding: 7px 10px;
          border: 1px solid var(--border);
          border-radius: 20px;
          color: var(--muted);
        }

        .local-tag {
          color: #39e99a;
        }

        .local-tag i {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #39e99a;
          border-radius: 50%;
          margin-right: 6px;
        }

        .icon-btn {
          width: 36px;
          height: 36px;
          background: transparent;
          border: 1px solid var(--border);
          color: inherit;
          border-radius: 10px;
          font-size: 17px;
        }

        .icon-btn:hover {
          color: var(--cyan);
          border-color: var(--cyan);
        }

        .menu-btn, .close-side {
          display: none;
        }

        .chat-area {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          position: relative;
        }

        .welcome {
          min-height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 20px;
          text-align: center;
        }

        .hero-logo {
          width: 95px;
          height: 95px;
          display: grid;
          place-items: center;
          position: relative;
          margin-bottom: 25px;
        }

        .hero-ring {
          position: absolute;
          inset: 0;
          border: 1px solid var(--cyan);
          border-radius: 28px;
          box-shadow: 0 0 35px #7df9ff22;
          animation: pulse 3s infinite;
        }

        .hero-letter {
          width: 67px;
          height: 67px;
          border-radius: 20px;
          font-size: 36px;
        }

        .animated-title {
          font-size: clamp(25px,4vw,37px);
          font-weight: 800;
          letter-spacing: -1px;
          animation: appear .7s ease;
        }

        .animated-title span {
          color: var(--cyan);
          text-shadow: 0 0 25px #7df9ff55;
        }

        .welcome-sub {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.7;
          max-width: 390px;
        }

        .suggestions {
          display: grid;
          grid-template-columns: repeat(2,minmax(0,1fr));
          gap: 11px;
          width: min(100%,570px);
          margin-top: 27px;
        }

        .suggestion {
          background: rgba(125,249,255,.035);
          color: inherit;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 15px;
          text-align: left;
          font-size: 12px;
          line-height: 1.5;
          transition: .2s;
        }

        .suggestion span {
          display: block;
          color: var(--cyan);
          font-size: 18px;
          margin-bottom: 8px;
        }

        .welcome-note {
          font-size: 10px;
          color: var(--muted);
          margin-top: 27px;
        }

        .messages {
          width: min(100%,850px);
          margin: auto;
          padding: 30px 25px 45px;
        }

        .message {
          display: flex;
          gap: 14px;
          margin-bottom: 30px;
          animation: appear .3s ease;
        }

        .avatar {
          width: 34px;
          height: 34px;
          min-width: 34px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          font-size: 13px;
          font-weight: bold;
          background: rgba(125,249,255,.12);
          color: var(--cyan);
        }

        .user .avatar {
          background: #252b37;
          color: white;
        }

        .message-content {
          min-width: 0;
          flex: 1;
        }

        .message-name {
          font-size: 12px;
          font-weight: 700;
          margin: 8px 0 10px;
        }

        .message-text {
          font-size: 14px;
          line-height: 1.85;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .copy-btn {
          margin-top: 12px;
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 7px;
          color: var(--muted);
          background: transparent;
          font-size: 10px;
        }

        .typing {
          display: inline-flex;
          gap: 5px;
          padding: 8px 0;
        }

        .typing i {
          width: 6px;
          height: 6px;
          background: var(--cyan);
          border-radius: 50%;
          animation: bounce .7s infinite alternate;
        }

        .typing i:nth-child(2) {
          animation-delay: .2s;
        }

        .typing i:nth-child(3) {
          animation-delay: .4s;
        }

        .input-section {
          width: min(100%,850px);
          margin: 0 auto;
          padding: 12px 25px 18px;
        }

        .status-line {
          font-size: 10px;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 10px;
        }

        .input-box {
          border: 1px solid rgba(125,249,255,.3);
          border-radius: 17px;
          padding: 13px 14px 10px;
          background: #111721;
          box-shadow: 0 0 30px #7df9ff08;
          transition: .2s;
        }

        .light .input-box {
          background: #fff;
        }

        .input-box:focus-within {
          border-color: var(--cyan);
          box-shadow: 0 0 20px #7df9ff15;
        }

        .input-box textarea {
          width: 100%;
          resize: none;
          border: 0;
          outline: none;
          background: transparent;
          color: inherit;
          font-size: 14px;
          line-height: 1.6;
          min-height: 48px;
          max-height: 150px;
        }

        .input-box textarea::placeholder {
          color: #8993a3;
        }

        .input-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .input-hint {
          color: var(--muted);
          font-size: 9px;
        }

        .send-btn {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 11px;
          background: var(--cyan);
          color: #001114;
          font-size: 24px;
          font-weight: bold;
          transition: .2s;
        }

        .send-btn:disabled {
          opacity: .35;
          cursor: not-allowed;
        }

        .send-btn:not(:disabled):hover {
          transform: scale(1.08);
          box-shadow: 0 0 20px #7df9ff66;
        }

        .disclaimer {
          text-align: center;
          color: var(--muted);
          font-size: 9px;
          margin: 10px 0 0;
        }

        .overlay {
          display: none;
        }

        @keyframes pulse {
          0%,100% {
            transform: rotate(0) scale(1);
            opacity: .7;
          }
          50% {
            transform: rotate(90deg) scale(1.12);
            opacity: 1;
          }
        }

        @keyframes bounce {
          to {
            transform: translateY(-5px);
            opacity: .4;
          }
        }

        @keyframes appear {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media(max-width:750px) {
          .sidebar {
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            width: 280px;
            transform: translateX(-105%);
            transition: transform .25s ease;
            box-shadow: none;
          }

          .sidebar.open {
            transform: translateX(0);
            box-shadow: 20px 0 60px #0008;
          }

          .overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: #0009;
            z-index: 19;
          }

          .menu-btn, .close-side {
            display: inline-grid;
            place-items: center;
          }

          .mobile-brand {
            display: block;
            font-size: 15px;
          }

          .topbar {
            height: 58px;
            min-height: 58px;
            padding: 0 13px;
          }

          .top-left, .top-actions {
            gap: 8px;
          }

          .model-tag {
            font-size: 9px;
            padding: 6px;
          }

          .input-section {
            padding: 10px 12px 14px;
          }

          .messages {
            padding: 22px 14px 35px;
          }

          .welcome {
            padding: 20px 15px;
          }

          .suggestions {
            grid-template-columns: 1fr;
            max-width: 400px;
          }

          .suggestion {
            padding: 12px;
          }

          .hero-logo {
            width: 78px;
            height: 78px;
          }

          .hero-letter {
            width: 55px;
            height: 55px;
          }

          .message {
            gap: 10px;
          }

          .message-text {
            font-size: 13px;
          }
        }

        @media(max-width:360px) {
          .local-tag {
            display: none;
          }

          .model-tag {
            display: none;
          }
        }
      `}</style>

    </main>
  );
}
