"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "harvey" | "twin";
  content: string;
  createdAt: string;
}

export function StudioChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    try {
      const res = await fetch("/api/chat");
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      if (data.threadId) setThreadId(data.threadId);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          threadId: threadId ?? undefined,
          reply: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInput(text);
        return;
      }
      if (data.threadId) setThreadId(data.threadId);
      setMessages((prev) => {
        const next: ChatMessage[] = [...prev, { id: crypto.randomUUID(), role: "harvey" as const, content: text, createdAt: new Date().toISOString() }];
        if (data.reply) {
          next.push({
            id: data.twinMessageId ?? crypto.randomUUID(),
            role: "twin" as const,
            content: data.reply,
            createdAt: new Date().toISOString(),
          });
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const startSessionFromLastMessage = async () => {
    const lastHarvey = [...messages].reverse().find((m) => m.role === "harvey");
    const promptContext = lastHarvey?.content?.trim() || null;
    if (!promptContext) return;
    setSessionLoading(true);
    try {
      const res = await fetch("/api/session/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptContext }),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/sessions/${data.session_id}`;
      }
    } finally {
      setSessionLoading(false);
    }
  };

  const lastHarveyContent = [...messages].reverse().find((m) => m.role === "harvey")?.content?.trim();

  return (
    <section style={{ marginTop: "1.5rem", border: "1px solid #ccc", borderRadius: 8, overflow: "hidden", maxWidth: 560 }}>
      <div style={{ padding: "0.5rem 0.75rem", background: "#f5f5f5", borderBottom: "1px solid #ccc", fontWeight: 600 }}>
        Chat with Twin
      </div>
      <div
        ref={listRef}
        style={{
          minHeight: 200,
          maxHeight: 320,
          overflowY: "auto",
          padding: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            Send a message to the agent. You can ask for a reply or use &quot;Start session from last message&quot; to run a creative session with your last message as the prompt.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "harvey" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "0.5rem 0.75rem",
              borderRadius: 8,
              background: m.role === "harvey" ? "#e3f2fd" : "#f5f5f5",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.9rem",
            }}
          >
            <span style={{ fontWeight: 600, marginRight: "0.5rem" }}>{m.role === "harvey" ? "You" : "Twin"}:</span>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", color: "#666", fontSize: "0.9rem" }}>
            Twin is typing…
          </div>
        )}
      </div>
      <div style={{ padding: "0.5rem 0.75rem", borderTop: "1px solid #ccc", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Message the agent…"
            disabled={loading}
            style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{ padding: "0.5rem 1rem", borderRadius: 6, background: "#1976d2", color: "white", border: "none", cursor: loading ? "not-allowed" : "pointer" }}
          >
            Send
          </button>
        </div>
        {lastHarveyContent && (
          <Link
            href="/session"
            style={{ fontSize: "0.85rem" }}
          >
            Or go to <strong>Start session</strong> to run a full session (you can pass prompt there).
          </Link>
        )}
        {lastHarveyContent && (
          <button
            type="button"
            onClick={startSessionFromLastMessage}
            disabled={sessionLoading}
            style={{ alignSelf: "flex-start", padding: "0.35rem 0.75rem", fontSize: "0.85rem", borderRadius: 6, background: "#2e7d32", color: "white", border: "none", cursor: sessionLoading ? "not-allowed" : "pointer" }}
          >
            {sessionLoading ? "Starting…" : "Start session from last message"}
          </button>
        )}
      </div>
    </section>
  );
}
