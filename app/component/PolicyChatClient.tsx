"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar, { type ChatSummary, type CurrentUser } from "./sidebar";
import StreamingMessage from "./StreamingMessage";

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: { document: string; section: string; page: number }[];
};

export default function PolicyChatClient({
  initialUser,
  initialChatId,
}: {
  initialUser: CurrentUser;
  initialChatId?: string;
}) {
  const [user] = useState<CurrentUser | null>(initialUser);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // When true, the next scroll (triggered by the messages effect below)
  // should jump instantly to the bottom — used when a whole chat's history
  // just loaded. Streaming a live answer instead scrolls smoothly, since
  // that's a token-by-token trickle, not a full history swap.
  const instantScrollNextRef = useRef(false);

  function scrollToBottom(smooth: boolean) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  useEffect(() => {
    // Wait a tick so the newly-rendered messages have their real height
    // before we measure scrollHeight — otherwise this can undershoot.
    requestAnimationFrame(() => {
      scrollToBottom(!instantScrollNextRef.current);
      instantScrollNextRef.current = false;
    });
  }, [messages]);

  async function loadChats() {
    const res = await fetch("/api/chats");
    const data = await res.json();
    setChats(data.chats ?? []);
  }

  useEffect(() => {
    loadChats();
  }, []);

  async function loadChatMessages(id: string) {
    const res = await fetch(`/api/chats/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    instantScrollNextRef.current = true;
    setMessages(
      (data.chat?.messages ?? []).map((m: { role: string; content: string; citations: unknown }) => ({
        role: m.role,
        content: m.content,
        citations: m.citations ?? undefined,
      }))
    );
  }

  // Load the chat named in the URL (if any) on mount, e.g. when arriving via
  // /chat/[id] from a link elsewhere in the app rather than clicking a chat
  // in this page's own sidebar.
  useEffect(() => {
    if (!initialChatId) return;
    loadChatMessages(initialChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChatId]);

  // Keep the browser's back/forward buttons working. We update the URL with
  // the History API directly (not next/navigation's router) so switching
  // chats never triggers Next.js's route resolution — that would unmount
  // and remount this whole page, including the sidebar, causing a visible
  // flash. This listener is what makes back/forward still do something
  // sensible despite that.
  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/^\/chat\/([^/]+)\/?$/);
      if (match) {
        setActiveChatId(match[1]);
        loadChatMessages(match[1]);
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function handleSelectChat(id: string) {
    setActiveChatId(id);
    if (window.matchMedia("(max-width: 639px)").matches) {
      setSidebarOpen(false);
    }
    window.history.pushState(null, "", `/chat/${id}`);
    await loadChatMessages(id);
  }

  function handleNewChat() {
    setActiveChatId(null);
    setMessages([]);
    if (window.matchMedia("(max-width: 639px)").matches) {
      setSidebarOpen(false);
    }
    window.history.pushState(null, "", "/chat");
  }

  async function handleDeleteChat(id: string) {
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (!res.ok) return;

    await loadChats();

    if (id === activeChatId) {
      setActiveChatId(null);
      setMessages([]);
      window.history.pushState(null, "", "/");
    }
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
        window.history.replaceState(null, "", `/chat/${returnedSessionId}`);
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
    <div className="fixed inset-0 h-dvh bg-[#F7F5F0] text-[#1B2430] flex overflow-hidden">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        isOpen={sidebarOpen}
        user={user}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />

      <main className="flex-1 flex flex-col h-dvh min-w-0 min-h-0">
        <header className="shrink-0 px-4 sm:px-10 py-4 sm:py-6 border-b border-[#1B2430]/10 bg-[#F7F5F0]">
          <p className="text-[10px] sm:text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
            Ask the register
          </p>
          <h2 className="mt-1 text-base sm:text-xl font-serif truncate">
            Every answer traces back to a clause
          </h2>
        </header>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-10 py-6 sm:py-8 space-y-4 sm:space-y-6">
          {messages.length === 0 && (
            <div className="max-w-md">
              <p className="text-[#1B2430]/60 leading-relaxed text-sm sm:text-base">
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
                      ? "max-w-[85%] sm:max-w-lg bg-[#1B2430] text-[#FDFCF9] px-4 sm:px-5 py-2.5 sm:py-3 rounded-sm text-sm leading-relaxed"
                      : "max-w-[90%] sm:max-w-2xl bg-white border border-[#1B2430]/10 px-4 sm:px-5 py-3 sm:py-4 rounded-sm text-sm leading-relaxed whitespace-pre-wrap"
                  }
                >
                  {msg.role === "assistant" ? (
                    isLive && !msg.content ? (
                      <ThinkingDots />
                    ) : msg.content || isLive ? (
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

        <div className="shrink-0 px-4 sm:px-10 py-3 sm:py-6 border-t border-[#1B2430]/10 bg-[#FDFCF9]"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-end gap-2 sm:gap-3 max-w-3xl">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about a policy…"
              rows={1}
              className="flex-1 resize-none border border-[#1B2430]/15 bg-white rounded-sm px-3 sm:px-4 py-2.5 sm:py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8A7A5C]/40"
            />
            <button
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="bg-[#1B2430] text-[#FDFCF9] text-sm font-medium px-4 sm:px-5 py-2.5 sm:py-3 rounded-sm hover:bg-[#2A3648] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              Ask
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Thinking">
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#1B2430]/40 animate-bounce"
        style={{ animationDelay: "0ms", animationDuration: "1s" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#1B2430]/40 animate-bounce"
        style={{ animationDelay: "150ms", animationDuration: "1s" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#1B2430]/40 animate-bounce"
        style={{ animationDelay: "300ms", animationDuration: "1s" }}
      />
    </span>
  );
}