"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  onDeleteChat?: (id: string) => void | Promise<void>;
};

export default function Sidebar({
  chats,
  activeChatId,
  isOpen,
  user,
  onToggle,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}: SidebarProps) {
  const router = useRouter();
  const hasCheckedInitialMobileState = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Force the sidebar closed by default on mobile viewports, regardless of
  // whatever initial value the parent passed in for `isOpen`.
  useEffect(() => {
    if (hasCheckedInitialMobileState.current) return;
    hasCheckedInitialMobileState.current = true;

    const isMobileViewport = window.matchMedia("(max-width: 639px)").matches;
    if (isMobileViewport && isOpen) {
      onToggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleDeleteClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!onDeleteChat) return;
    if (!confirm("Delete this chat? This can't be undone.")) return;

    setDeletingId(id);
    try {
      await onDeleteChat(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Collapsed state: toggle button floats top-right on every breakpoint */}
      {!isOpen && (
        <button
          onClick={onToggle}
          aria-label="Open sidebar"
          className="fixed top-3 right-3 z-40 w-10 h-10 flex items-center justify-center rounded-sm bg-[#FDFCF9] border border-[#1B2430]/15 text-[#1B2430]/70 shadow-sm hover:bg-[#1B2430]/5 hover:text-[#1B2430] transition-colors"
        >
          <MenuIcon />
        </button>
      )}

      {isOpen && (
        <>
          {/* Backdrop, mobile only — tapping it closes the sidebar */}
          <div
            onClick={onToggle}
            className="sm:hidden fixed inset-0 z-40 bg-black/30"
            aria-hidden="true"
          />

          <aside
            className="
              fixed inset-y-0 left-0 z-50 w-[85%] max-w-80
              sm:sticky sm:top-0 sm:z-auto sm:w-80 sm:max-w-none
              h-dvh sm:h-screen shrink-0 border-r border-[#1B2430]/10 bg-[#FDFCF9] flex flex-col
            "
          >
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

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
              {chats.length === 0 && (
                <p className="text-sm text-[#1B2430]/50 leading-relaxed">
                  No conversations yet. Ask a question to get started.
                </p>
              )}

              {chats.map((c) => (
                <div
                  key={c.id}
                  className={
                    "group relative flex items-center rounded-sm transition-colors " +
                    (c.id === activeChatId
                      ? "bg-[#1B2430]/8"
                      : "hover:bg-[#1B2430]/5")
                  }
                >
                  <button
                    onClick={() => onSelectChat(c.id)}
                    className={
                      "flex-1 min-w-0 text-left px-3 py-2.5 text-sm truncate " +
                      (c.id === activeChatId
                        ? "text-[#1B2430] font-medium"
                        : "text-[#1B2430]/70")
                    }
                  >
                    {c.title}
                  </button>

                  {onDeleteChat && (
                    <button
                      onClick={(e) => handleDeleteClick(e, c.id)}
                      disabled={deletingId === c.id}
                      aria-label={`Delete chat: ${c.title}`}
                      className={
                        "shrink-0 mr-1 w-7 h-7 flex items-center justify-center rounded-sm transition-colors " +
                        (deletingId === c.id
                          ? "text-[#1B2430]/30"
                          : "text-[#1B2430]/40 hover:bg-[#1B2430]/10 hover:text-red-600")
                      }
                    >
                      {deletingId === c.id ? <SpinnerIcon /> : <TrashIcon />}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-[#1B2430]/10 space-y-2" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
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
        </>
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

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4.5M6.5 7.5v3.5M9.5 7.5v3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="animate-spin">
      <path
        d="M14 8A6 6 0 1 1 8 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}