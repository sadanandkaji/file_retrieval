"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar, { type ChatSummary, type CurrentUser } from "./sidebar";
import StreamingMessage from "./StreamingMessage";

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: { document: string; section: string; page: number }[];
};

export default function PolicyChatClient({ initialUser }: { initialUser: CurrentUser }) {
  const [user] = useState<CurrentUser | null>(initialUser);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadChats() {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data.chats ?? []);
  }

  useEffect(() => {
    loadChats();
  }, []);

  async function handleSelectChat(id: string) {
    setActiveChatId(id);
    const res = await fetch(`/api/chats/${id}`);
    const data = await res.json();
    setMessages(
      (data.chat?.messages ?? []).map((m: { role: string; content: string; citations: unknown }) => ({
        role: m.role,
        content: m.content,
        citations: m.citations ?? undefined,
      }))
    );
  }

  function handleNewChat() {
    setActiveChatId(null);
    setMessages([]);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || isSending) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setIsSending(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, chatSessionId: activeChatId }),
      });

      const returnedSessionId = res.headers.get("X-Chat-Session-Id");
      if (returnedSessionId && returnedSessionId !== activeChatId) {
        setActiveChatId(returnedSessionId);
      }

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.replace("data: ", "").trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content ?? "";
            accumulated += delta;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: accumulated };
              return next;
            });
          } catch {
            // partial JSON chunk, skip
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "Something went wrong reaching the policy index. Try again.",
        };
        return next;
      });
    } finally {
      setIsSending(false);
      loadChats();
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1B2430] flex">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        isOpen={sidebarOpen}
        user={user}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />

      <main className="flex-1 flex flex-col">
        <header className="px-10 py-6 border-b border-[#1B2430]/10">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
            Ask the register
          </p>
          <h2 className="mt-1 text-xl font-serif">Every answer traces back to a clause</h2>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 py-8 space-y-6">
          {messages.length === 0 && (
            <div className="max-w-md">
              <p className="text-[#1B2430]/60 leading-relaxed">
                Ask a question about any indexed policy. Answers are grounded strictly in
                the documents you&apos;ve added — nothing is inferred beyond what&apos;s written.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const isLive = msg.role === "assistant" && isLast && isSending;

            return (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    msg.role === "user"
                      ? "max-w-lg bg-[#1B2430] text-[#FDFCF9] px-5 py-3 rounded-sm text-sm leading-relaxed"
                      : "max-w-2xl bg-white border border-[#1B2430]/10 px-5 py-4 rounded-sm text-sm leading-relaxed whitespace-pre-wrap"
                  }
                >
                  {msg.role === "assistant" ? (
                    msg.content || isLive ? (
                      <StreamingMessage fullText={msg.content} isStreaming={isLive} />
                    ) : (
                      <span className="text-[#1B2430]/40">Reading the register…</span>
                    )
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-10 py-6 border-t border-[#1B2430]/10">
          <div className="flex items-end gap-3 max-w-3xl">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="e.g. What is the notice period for termination?"
              rows={1}
              className="flex-1 resize-none border border-[#1B2430]/15 bg-white rounded-sm px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
            />
            <button
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="bg-[#1B2430] text-[#FDFCF9] text-sm font-medium px-5 py-3 rounded-sm hover:bg-[#2A3648] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Ask
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}