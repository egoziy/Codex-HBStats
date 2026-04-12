'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };

type Viewer = { id: string; name: string; role: string } | null;

export default function AiChat() {
  const [viewer, setViewer] = useState<Viewer>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch current user
  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => setViewer(d.user || null))
      .catch(() => setViewer(null));
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Don't render for unauthenticated users
  if (!viewer) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      if (res.ok && data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: data.error || 'שגיאה בעיבוד השאלה.' },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: 'שגיאת רשת. נסה שוב.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 left-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-800 to-slate-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        title="עוזר סטטיסטיקות"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 left-5 z-[60] flex h-[500px] w-[380px] max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-l from-red-800 to-slate-900 px-4 py-3 text-white">
            <span className="text-sm font-bold">עוזר סטטיסטיקות</span>
            <button onClick={() => setIsOpen(false)} className="rounded p-1 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="mt-8 text-center text-sm text-stone-400">
                שאל אותי על כדורגל ישראלי — שחקנים, משחקים, טבלאות ועוד
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-red-800 text-white'
                      : 'bg-stone-100 text-stone-800'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-2 text-stone-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">חושב...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-stone-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="שאל שאלה..."
                rows={1}
                maxLength={500}
                disabled={isLoading}
                className="flex-1 resize-none rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-red-800 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-800 text-white transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
