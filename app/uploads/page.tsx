"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { ChatSummary, CurrentUser } from "../component/sidebar";

type DocRow = {
  id: string;
  name: string;
  status: "UPLOADING" | "READY" | "ERROR";
  chunkCount: number;
  cloudinaryUrl: string;
  uploadedBy: string;
  createdAt: string;
};

export default function UploadsPage() {
  const router = useRouter();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  async function loadDocs() {
    const res = await fetch("/api/documents");
    const data = await res.json();
    setDocs(data.documents ?? []);
  }

  async function loadSidebarData() {
    const [chatsRes, meRes] = await Promise.all([
      fetch("/api/chats"),
      fetch("/api/auth/me"),
    ]);
    const chatsData = await chatsRes.json();
    const meData = await meRes.json();
    setChats(chatsData.chats ?? []);
    setUser(meData.user ?? null);
  }

  useEffect(() => {
    loadDocs();
    loadSidebarData();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
      }
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
      loadDocs();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this policy document and its indexed content?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    loadDocs();
  }

  async function handleNewChat() {
    const res = await fetch("/api/chats", { method: "POST" });
    const data = await res.json();
    if (data?.id) router.push(`/chat/${data.id}`);
  }

  function handleSelectChat(id: string) {
    router.push(`/chat/${id}`);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        chats={chats}
        activeChatId={null}
        isOpen={sidebarOpen}
        user={user}
        onToggle={() => setSidebarOpen((v) => !v)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />

      <div className="flex-1 min-h-screen bg-[#F7F5F0] px-10 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
              Policy Index
            </p>
            <h1 className="mt-1 text-2xl font-serif text-[#1B2430]">Uploaded documents</h1>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="doc-upload"
            />
            <label
              htmlFor="doc-upload"
              className="cursor-pointer bg-[#1B2430] text-[#FDFCF9] text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-[#2A3648] transition-colors"
            >
              {isUploading ? "Uploading…" : "Upload policy PDF"}
            </label>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-sm px-4 py-2">
            {error}
          </p>
        )}

        <div className="bg-white border border-[#1B2430]/10 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F5F0] text-[#1B2430]/60 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Document</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Sections</th>
                <th className="text-left px-4 py-3">Uploaded by</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
  {docs.map((d) => (
    <tr key={d.id} className="border-t border-[#1B2430]/10">
      <td className="px-4 py-3">
        <a
          href={`/api/documents/${d.id}/download`}
          target="_blank"
          rel="noreferrer"
          className="text-[#1B2430] hover:underline font-medium"
        >
          {d.name}
        </a>
      </td>
      <td className="px-4 py-3">
        <span
          className={
            d.status === "READY"
              ? "text-xs px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700"
              : d.status === "ERROR"
              ? "text-xs px-2 py-0.5 rounded-sm bg-red-50 text-red-600"
              : "text-xs px-2 py-0.5 rounded-sm bg-[#8A7A5C]/15 text-[#8A7A5C]"
          }
        >
          {d.status}
        </span>
      </td>
      <td className="px-4 py-3 text-[#1B2430]/70">{d.chunkCount}</td>
      <td className="px-4 py-3 text-[#1B2430]/70">{d.uploadedBy}</td>
      <td className="px-4 py-3 text-[#1B2430]/50">
        {new Date(d.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => handleDelete(d.id)}
          className="text-xs text-red-600 hover:underline"
        >
          Remove
        </button>
      </td>
    </tr>
  ))}
  {docs.length === 0 && (
    <tr>
      <td colSpan={6} className="px-4 py-6 text-center text-[#1B2430]/40">
        No policies uploaded yet.
      </td>
    </tr>
  )}
</tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[#1B2430]/40">
          Files are stored on Cloudinary and their text is chunked, embedded, and indexed
          into the policy database for search.
        </p>
      </div>
    </div>
  );
}