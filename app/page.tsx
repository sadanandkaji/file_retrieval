"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: { document: string; section: string; page: number }[];
};

type UploadedDoc = {
  name: string;
  chunks: number;
  status: "uploading" | "ready" | "error";
};

export default function PolicyChatPage() {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocs((prev) => [...prev, { name: file.name, chunks: 0, status: "uploading" }]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      const data = await res.json();

      setDocs((prev) =>
        prev.map((d) =>
          d.name === file.name ? { ...d, chunks: data.chunks ?? 0, status: "ready" } : d
        )
      );
    } catch {
      setDocs((prev) =>
        prev.map((d) => (d.name === file.name ? { ...d, status: "error" } : d))
      );
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
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
        body: JSON.stringify({ question }),
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Parse SSE lines: "data: {...}"
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
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
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1B2430] flex">
      {/* Sidebar — document ledger */}
      <aside className="w-80 shrink-0 border-r border-[#1B2430]/10 bg-[#FDFCF9] flex flex-col">
        <div className="px-6 pt-8 pb-6 border-b border-[#1B2430]/10">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
            Policy Index
          </p>
          <h1 className="mt-1 text-2xl font-serif text-[#1B2430]">Document Register</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {docs.length === 0 && (
            <p className="text-sm text-[#1B2430]/50 leading-relaxed">
              No policies indexed yet. Add a PDF to begin.
            </p>
          )}

          {docs.map((doc) => (
            <div
              key={doc.name}
              className="border border-[#1B2430]/10 bg-white px-4 py-3 rounded-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{doc.name}</p>
                <StatusDot status={doc.status} />
              </div>
              <p className="mt-1 text-xs text-[#1B2430]/50">
                {doc.status === "uploading" && "Indexing…"}
                {doc.status === "ready" && `${doc.chunks} sections indexed`}
                {doc.status === "error" && "Failed to index"}
              </p>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-[#1B2430]/10">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className="block w-full text-center cursor-pointer bg-[#1B2430] text-[#FDFCF9] text-sm font-medium py-3 rounded-sm hover:bg-[#2A3648] transition-colors"
          >
            Add policy PDF
          </label>
        </div>
      </aside>

      {/* Main — chat */}
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
                the documents you've added — nothing is inferred beyond what's written.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  msg.role === "user"
                    ? "max-w-lg bg-[#1B2430] text-[#FDFCF9] px-5 py-3 rounded-sm text-sm leading-relaxed"
                    : "max-w-2xl bg-white border border-[#1B2430]/10 px-5 py-4 rounded-sm text-sm leading-relaxed whitespace-pre-wrap"
                }
              >
                {msg.content || (msg.role === "assistant" && isSending && i === messages.length - 1 ? (
                  <span className="text-[#1B2430]/40">Reading the register…</span>
                ) : (
                  msg.content
                ))}
              </div>
            </div>
          ))}
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

function StatusDot({ status }: { status: UploadedDoc["status"] }) {
  const color =
    status === "ready" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-[#8A7A5C]";
  return <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${color}`} />;
}