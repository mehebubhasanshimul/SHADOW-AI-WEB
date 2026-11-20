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
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [activeId, setActiveId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("LOCAL AI READY");
  const [theme, setTheme] = useState("dark");
  const [sidebar, setSidebar] = useState(false);

  const engine = useRef<any>(null);
  const busy = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatList = chats ?? [];
  const activeChat = chatList.find(c => c.id === activeId);
  const messages = activeChat?.messages ?? [];

  // Load saved chats and theme
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shadow-ai-chats");
      const savedTheme = localStorage.getItem("shadow-ai-theme");

      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }

      if (saved) {
        const parsed = JSON.parse(saved);

        if (
          Array.isArray(parsed) &&
          parsed.every(
            (c: any) =>
              typeof c.id === "string" &&
              typeof c.title === "string" &&
              Array.isArray(c.messages)
          )
        ) {
          setChats(parsed);
          setActiveId(parsed[0]?.id ?? "");
          if (parsed.length) return;
        }
      }
    } catch (error) {
      console.warn("Chat history could not be loaded:", error);
    }

    const first: Chat = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: []
    };

    setChats([first]);
    setActiveId(first.id);
  }, []);

  // Save chats only after initial loading
  useEffect(() => {
    if (chats === null) return;

    try {
      localStorage.setItem(
        "shadow-ai-chats",
        JSON.stringify(chats)
      );
    } catch (error) {
      console.warn("Chat storage is full or unavailable:", error);
      setStatus("STORAGE WARNING");
    }
  }, [chats]);

  // Save theme
  useEffect(() => {
    try {
      localStorage.setItem("shadow-ai-theme", theme);
    } catch {
      // Theme still works for the current session.
    }
  }, [theme]);

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [messages, loading]);

  function updateChat(
    id: string,
    callback: (chat: Chat) => Chat
  ) {
    setChats(previous => {
      if (!previous) return previous;

      return previous.map(chat =>
        chat.id === id ? callback(chat) : chat
      );
    });
  }

  function newChat() {
    if (busy.current) return;

    const chat: Chat = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "New Chat",
      messages: []
    };

    setChats(previous => [chat, ...(previous ?? [])]);
    setActiveId(chat.id);
    setPrompt("");
    setSidebar(false);
    setStatus("LOCAL AI READY");
  }

  function deleteChat(id: string) {
    if (busy.current) return;

    const remaining = chatList.filter(c => c.id !== id);

    if (remaining.length === 0) {
      const fresh: Chat = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: []
      };

      setChats([fresh]);
      setActiveId(fresh.id);
    } else {
      setChats(remaining);

      if (activeId === id) {
        setActiveId(remaining[0].id);
      }
    }
  }

  async function loadEngine() {
    if (engine.current) return engine.current;

    setStatus("LOADING AI ENGINE...");

    const { pipeline, env } = await import(
      "@huggingface/transformers"
    );

    // Browser-based model cache
    env.useBrowserCache = true;

    setStatus("DOWNLOADING QWEN AI MODEL...");

    const generator = await pipeline(
      "text-generation",
      MODEL_ID,
      {
        device: "wasm",
        dtype: "q4",
        progress_callback: (progress: any) => {
          if (progress?.status === "progress_total") {
            setStatus(
              `DOWNLOADING MODEL ${Math.round(progress.progress || 0)}%`
            );
          } else if (progress?.status === "progress") {
            const percent = Math.round(progress.progress || 0);
            setStatus(`DOWNLOADING MODEL ${percent}%`);
          } else if (progress?.status === "done") {
            setStatus("PREPARING AI MODEL...");
          }
        }
      }
    );

    engine.current = generator;
    return generator;
  }

  async function sendMessage(text = prompt) {
    const question = text.trim();

    if (!question || busy.current || !activeId || chats === null) {
      return;
    }

    const chatId = activeId;
    const oldChat = chats.find(c => c.id === chatId);

    if (!oldChat) return;

    busy.current = true;
    setLoading(true);
    setPrompt("");

    const previousMessages = oldChat.messages.filter(
      m => m.content.trim()
    );

    const userMessage: Message = {
      role: "user",
      content: question
    };

    const assistantMessage: Message = {
      role: "assistant",
      content: ""
    };

    const conversation = [
      ...previousMessages,
      userMessage,
      assistantMessage
    ];

    updateChat(chatId, chat => ({
      ...chat,
      title:
        chat.messages.length === 0
          ? question.slice(0, 45)
          : chat.title,
      messages: conversation
    }));

    try {
      const generator = await loadEngine();

      setStatus("SHADOW AI IS THINKING...");

      const { TextStreamer } = await import(
        "@huggingface/transformers"
      );

      const history = [
        {
          role: "system" as const,
          content:
            "You are SHADOW AI, a helpful multilingual AI assistant. " +
            "Answer in the same language as the user. " +
            "Support Bengali and English. " +
            "Give clear, useful and accurate answers. " +
            "For coding questions, provide readable code."
        },
        ...previousMessages.slice(-8).map(m => ({
          role: m.role,
          content: m.content
        })),
        {
          role: "user" as const,
          content: question
        }
      ];

      let answer = "";

      const streamer = new TextStreamer(
        generator.tokenizer,
        {
          skip_prompt: true,
          callback_function: (token: string) => {
            answer += token;

            updateChat(chatId, chat => {
              const updated = [...chat.messages];
              const last = updated.length - 1;

              if (
                last >= 0 &&
                updated[last].role === "assistant"
              ) {
                updated[last] = {
                  role: "assistant",
                  content: answer
                };
              }

              return {
                ...chat,
                messages: updated
              };
            });
          }
        }
      );

      const result = await generator(history, {
        max_new_tokens: 180,
        do_sample: true,
        temperature: 0.7,
        top_p: 0.9,
        repetition_penalty: 1.1,
        streamer
      });

      // Use the returned result if streaming produced no text.
      if (!answer.trim()) {
        const generated = result?.[0]?.generated_text;

        if (Array.isArray(generated)) {
          const last = generated[generated.length - 1];
          answer =
            typeof last?.content === "string"
              ? last.content
              : "";
        } else if (typeof generated === "string") {
          answer = generated;
        }
      }

      if (!answer.trim()) {
        throw new Error("The model returned an empty response.");
      }

      updateChat(chatId, chat => {
        const updated = [...chat.messages];
        const last = updated.length - 1;

        if (updated[last]?.role === "assistant") {
          updated[last] = {
            role: "assistant",
            content: answer.trim()
          };
        }

        return {
          ...chat,
          messages: updated
        };
      });

      setStatus("LOCAL AI READY");

    } catch (error: any) {
      console.error("SHADOW AI ERROR:", error);

      const reason =
        error?.message || "Unknown AI engine error";

      updateChat(chatId, chat => {
        const updated = [...chat.messages];
        const last = updated.length - 1;

        if (updated[last]?.role === "assistant") {
          updated[last] = {
            role: "assistant",
            content:
              "SHADOW AI could not complete this response.\n\n" +
              "Error: " + reason +
              "\n\nTry these steps:\n" +
              "1. Check your internet connection.\n" +
              "2. Refresh the website.\n" +
              "3. Check available device memory and storage.\n" +
              "4. Clear this website's cached data if the model cache is corrupted.\n" +
              "5. Try again using a supported browser."
          };
        }

        return {
          ...chat,
          messages: updated
        };
      });

      // Reset failed model so the next request can reload it.
      engine.current = null;
      setStatus("AI ENGINE ERROR");

    } finally {
      busy.current = false;
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("COPIED TO CLIPBOARD");
      setTimeout(() => {
        setStatus("LOCAL AI READY");
      }, 1800);
    } catch {
      setStatus("COPY NOT AVAILABLE");
    }
  }

  function toggleTheme() {
    setTheme(previous =>
      previous === "dark" ? "light" : "dark"
    );
  }

  return (
    <main className={`app ${theme}`}>

      {/* Mobile overlay */}
      {sidebar && (
        <button
          className="overlay"
          aria-label="Close sidebar"
          onClick={() => setSidebar(false)}
        />
      )}

      {/* Sidebar */}
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
            aria-label="Close menu"
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
          {chatList.map(chat => (
            <div
              key={chat.id}
              className={`history-item ${
                activeId === chat.id ? "selected" : ""
              }`}
            >
              <button
                className="history-select"
                onClick={() => {
                  if (!busy.current) {
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

              <button
                className="delete-chat"
                onClick={() => deleteChat(chat.id)}
                disabled={loading}
                aria-label="Delete conversation"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="side-bottom">
          <div className="model-card">
            <span className="online-dot" />
            <div>
              <b>Qwen 2.5 · 0.5B</b>
              <small>WASM CPU ENGINE · Q4</small>
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

      {/* Main area */}
      <section className="main">

        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-btn menu-btn"
              onClick={() => setSidebar(true)}
              aria-label="Open menu"
            >
              ☰
            </button>

            <div className="mobile-brand">
              SHADOW <span>AI</span>
            </div>

            <span className="model-tag">
              Qwen 2.5 · 0.5B
            </span>
          </div>

          <div className="top-actions">
            <span className="local-tag">
              <i /> LOCAL AI
            </span>

            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label="Change theme"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>

            <button
              className="icon-btn"
              onClick={newChat}
              disabled={loading}
              aria-label="New chat"
            >
              ＋
            </button>
          </div>
        </header>

        <div className="chat-area">

          {!activeChat ? (
            <div className="welcome">
              <div className="loading-ring" />
              Loading conversations...
            </div>
          ) : messages.length === 0 ? (

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
                {SUGGESTIONS.map((item, index) => (
                  <button
                    key={index}
                    className="suggestion"
                    onClick={() => sendMessage(item)}
                    disabled={loading}
                  >
                    <span>
                      {["✦", "⌘", "◈", "⚡"][index]}
                    </span>
                    {item}
                  </button>
                ))}
              </div>

              <div className="welcome-note">
                NO API KEY · NO AI BACKEND · CPU / WASM
              </div>
            </div>

          ) : (

            <div className="messages">
              {messages.map((message, index) => (
                <article
                  key={`${activeId}-${index}`}
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
                        onClick={() => copyText(message.content)}
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

        {/* Composer */}
        <div className="input-section">

          <div className="status-line">
            <span className="online-dot" />
            {status}
          </div>

          <div className="input-box">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Message SHADOW AI... বাংলায় লিখুন"
              rows={2}
              disabled={loading || chats === null}
              onKeyDown={e => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <div className="input-bottom">
              <span className="input-hint">
                Enter · Send | Shift + Enter · New line
              </span>

              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={
                  loading ||
                  !prompt.trim() ||
                  chats === null
                }
                aria-label="Send message"
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

      {/* Theme and animations */}
      <style jsx global>{`
        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
          font-family: Arial, sans-serif;
        }

        button, textarea { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: .5; }

        .app {
          --cyan: #7df9ff;
          --border: rgba(125,249,255,.14);
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
          --border: rgba(0,0,0,.12);
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

        .light .sidebar { background: #fff; }

        .side-header, .brand, .topbar,
        .top-left, .top-actions {
          display: flex;
          align-items: center;
        }

        .side-header {
          justify-content: space-between;
          margin-bottom: 32px;
        }

        .brand { gap: 11px; }

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

        .new-chat span { color: var(--cyan); margin-right: 9px; }

        .history-title {
          font-size: 10px;
          letter-spacing: 1.5px;
          color: var(--muted);
          margin: 30px 8px 12px;
        }

        .history { flex: 1; overflow-y: auto; }

        .history-item {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 4px;
          border-radius: 9px;
        }

        .history-item.selected,
        .history-item:hover {
          background: rgba(125,249,255,.08);
        }

        .history-select {
          flex: 1;
          min-width: 0;
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 12px 10px;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          font-size: 12px;
        }

        .history-select > span:first-child { color: var(--cyan); }

        .history-name {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .delete-chat {
          border: 0;
          background: transparent;
          color: var(--muted);
          padding: 8px;
          font-size: 17px;
        }

        .delete-chat:hover { color: #ff6b83; }

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

        .model-card b { font-size: 12px; }

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

        .top-left, .top-actions { gap: 13px; }

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

        .local-tag { color: #39e99a; }
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

        .menu-btn, .close-side { display: none; }

        .chat-area {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
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
          animation: shadowPulse 3s infinite;
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
          animation: shadowAppear .7s ease;
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
          animation: shadowAppear .3s ease;
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

        .message-content { min-width: 0; flex: 1; }

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
          animation: shadowBounce .7s infinite alternate;
        }

        .typing i:nth-child(2) { animation-delay: .2s; }
        .typing i:nth-child(3) { animation-delay: .4s; }

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

        .light .input-box { background: #fff; }

        .input-box:focus-within {
          border-color: var(--cyan);
          box-shadow: 0 0 20px #7df9ff15;
        }

        .input-box textarea {
          width: 100%;
          resize: vertical;
          border: 0;
          outline: none;
          background: transparent;
          color: inherit;
          font-size: 14px;
          line-height: 1.6;
          min-height: 48px;
          max-height: 150px;
        }

        .input-box textarea::placeholder { color: #8993a3; }

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

        .overlay { display: none; }

        .loading-ring {
          width: 28px;
          height: 28px;
          border: 3px solid var(--border);
          border-top-color: var(--cyan);
          border-radius: 50%;
          animation: shadowSpin .8s linear infinite;
          margin-bottom: 15px;
        }

        @keyframes shadowSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes shadowPulse {
          0%,100% { transform: rotate(0) scale(1); opacity: .7; }
          50% { transform: rotate(90deg) scale(1.12); opacity: 1; }
        }

        @keyframes shadowBounce {
          to { transform: translateY(-5px); opacity: .4; }
        }

        @keyframes shadowAppear {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
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
            border: 0;
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

          .top-left, .top-actions { gap: 8px; }

          .model-tag {
            font-size: 9px;
            padding: 6px;
          }

          .input-section { padding: 10px 12px 14px; }

          .messages { padding: 22px 14px 35px; }

          .welcome { padding: 20px 15px; }

          .suggestions {
            grid-template-columns: 1fr;
            max-width: 400px;
          }

          .suggestion { padding: 12px; }

          .hero-logo {
            width: 78px;
            height: 78px;
          }

          .hero-letter {
            width: 55px;
            height: 55px;
          }

          .message { gap: 10px; }
          .message-text { font-size: 13px; }
        }

        @media(max-width:360px) {
          .local-tag, .model-tag { display: none; }
        }

        @media(prefers-reduced-motion:reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </main>
  );
}
