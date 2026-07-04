"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
};

type SidebarProps = {
  chats: ChatSummary[];
  activeChatId: string | null;
  isOpen: boolean;
  user: CurrentUser | null;
  onToggle: () => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
};

export default function Sidebar({
  chats,
  activeChatId,
  isOpen,
  user,
  onToggle,
  onSelectChat,
  onNewChat,
}: SidebarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {!isOpen && (
        <div className="w-12 shrink-0 sticky top-0 h-screen border-r border-[#1B2430]/10 bg-[#FDFCF9] flex flex-col items-center pt-6">
          <button
            onClick={onToggle}
            aria-label="Open sidebar"
            className="w-8 h-8 flex items-center justify-center rounded-sm text-[#1B2430]/50 hover:bg-[#1B2430]/5 hover:text-[#1B2430] transition-colors"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      )}

      {isOpen && (
        <aside className="w-80 shrink-0 sticky top-0 h-screen border-r border-[#1B2430]/10 bg-[#FDFCF9] flex flex-col">
          <div className="shrink-0 px-6 pt-8 pb-6 border-b border-[#1B2430]/10 flex items-start justify-between">
            <div>
              <p className="text-[11px] tracking-[0.18em] uppercase text-[#8A7A5C] font-medium">
                Policy Index
              </p>
              <h1 className="mt-1 text-2xl font-serif text-[#1B2430]">Chats</h1>
            </div>
            <button
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="mt-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-sm text-[#1B2430]/40 hover:bg-[#1B2430]/5 hover:text-[#1B2430] transition-colors"
            >
              <ChevronIcon direction="left" />
            </button>
          </div>

          <div className="shrink-0 px-6 pt-4">
            <button
              onClick={onNewChat}
              className="w-full text-center bg-[#1B2430] text-[#FDFCF9] text-sm font-medium py-2.5 rounded-sm hover:bg-[#2A3648] transition-colors"
            >
              + New chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-2">
            {chats.length === 0 && (
              <p className="text-sm text-[#1B2430]/50 leading-relaxed">
                No conversations yet. Ask a question to get started.
              </p>
            )}

            {chats.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className={
                  "w-full text-left px-3 py-2.5 rounded-sm text-sm truncate transition-colors " +
                  (c.id === activeChatId
                    ? "bg-[#1B2430]/8 text-[#1B2430] font-medium"
                    : "text-[#1B2430]/70 hover:bg-[#1B2430]/5")
                }
              >
                {c.title}
              </button>
            ))}
          </div>

          <div className="p-6 border-t border-[#1B2430]/10 space-y-2">
            <Link
              href="/uploads"
              className="block w-full text-center bg-white border border-[#1B2430]/15 text-[#1B2430] text-sm font-medium py-2.5 rounded-sm hover:bg-[#1B2430]/5 transition-colors"
            >
              Manage documents
            </Link>

            {user?.role === "ADMIN" && (
              <Link
                href="/admin/users"
                className="block w-full text-center bg-white border border-[#1B2430]/15 text-[#1B2430] text-sm font-medium py-2.5 rounded-sm hover:bg-[#1B2430]/5 transition-colors"
              >
                Manage users
              </Link>
            )}

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[#1B2430]/50 truncate">{user?.name}</p>
              <button
                onClick={handleLogout}
                className="text-xs text-red-600 hover:underline shrink-0 ml-2"
              >
                Log out
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={direction === "left" ? "" : "rotate-180"}>
      <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}