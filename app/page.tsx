"use client";

import { useState, useEffect, useRef } from "react";
import { CreateMLCEngine } from "@mlc-ai/web-llm";

const MODELS = [
  {
    id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    name: "Qwen 2.5 Coder",
    desc: "Coding AI"
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2",
    desc: "Chat & Bangla"
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    name: "Phi 3.5 Mini",
    desc: "General AI"
  }
];

export default function Home() {
  const [model, setModel] = useState(MODELS[1].id);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("READY");
  const [loading, setLoading] = useState(false);
  const engine = useRef<any>(null);
  const activeModel = useRef("");

  async function runAI() {
    if (!prompt.trim() || loading) return;

    if (!("gpu" in navigator)) {
      setOutput("Your browser does not support WebGPU. Please use a supported Chrome or Edge browser.");
      return;
    }

    setLoading(true);
    setOutput("");

    try {
      if (!engine.current || activeModel.current !== model) {
        engine.current = null;
        activeModel.current = "";

        setStatus("SHADOW AI model loading... First time will download ~1GB");

        engine.current = await CreateMLCEngine(model, {
          initProgressCallback: (progress) => {
            setStatus(progress.text || "Loading AI model...");
          }
        });

        activeModel.current = model;
      }

      setStatus("SHADOW AI IS THINKING...");

      const messages = [
        {
          role: "system",
          content: "You are SHADOW AI, a helpful assistant. Answer in the language used by the user. Support Bangla and English."
        },
        {
          role: "user",
          content: prompt
        }
      ];

      const reply = await engine.current.chat.completions.create({
        messages,
        temperature: 0.7,
        stream: true
      });

      let answer = "";

      for await (const chunk of reply) {
        answer += chunk.choices?.[0]?.delta?.content || "";
        setOutput(answer);
      }

      setStatus("READY");
    } catch (error: any) {
      console.error(error);
      setOutput("Error: " + (error?.message || "Unable to start AI. Check WebGPU support and available device memory."));
      setStatus("ERROR");
      engine.current = null;
      activeModel.current = "";
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (engine.current) {
        engine.current.unload().catch(() => {});
      }
    };
  }, []);

  return (
    <main className="container">
      <header className="header">
        <img
          src="https://i.ibb.co.com/DHPxHj4P/received-1704362177761420.jpg"
          alt="SHADOW AI"
          className="logo"
        />
        <div>
          <h1>SHADOW <span>AI</span></h1>
          <p>LOCAL INTELLIGENCE SYSTEM</p>
        </div>
      </header>

      <section className="panel">
        <div className="label">SELECT AI MODEL</div>

        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            engine.current = null;
            activeModel.current = "";
            setOutput("");
          }}
          disabled={loading}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.desc}
            </option>
          ))}
        </select>

        <div className="label">YOUR MESSAGE</div>

        <textarea
          placeholder="Ask anything... বাংলায় অথবা English এ লিখুন"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
        />

        <button onClick={runAI} disabled={loading || !prompt.trim()}>
          {loading ? "PROCESSING..." : "⚡ RUN SHADOW AI"}
        </button>

        <div className="status">
          <span className={loading ? "dot active" : "dot"} />
          {status}
        </div>
      </section>

      <section className="output">
        <div className="output-title">◈ AI RESPONSE</div>
        <div className="response">
          {output || "SHADOW AI is ready. Enter your message to begin."}
        </div>
      </section>

      <footer>
        SHADOW AI © 2026 | POWERED BY WEBLLM
        <p>100% Browser-Based AI • No API Key</p>
      </footer>
    </main>
  );
      }
