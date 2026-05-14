import { useState, useEffect, useCallback, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/types/database";
import { executeToolCall, trainerTools, SYSTEM_PROMPT } from "./trainer-tools";

interface Props {
  onClose?: () => void;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export function ChatPanel(_props: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data) setMessages(data as ChatMessage[]);
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);

    const userMsg = input.trim();
    setInput("");

    const { data: savedMsg } = await supabase
      .from("chat_messages")
      .insert({ user_id: USER_ID, role: "user", content: userMsg })
      .select()
      .single();

    if (savedMsg) setMessages((prev) => [...prev, savedMsg as ChatMessage]);

    try {
      const conversationHistory: AnthropicMessage[] = [
        ...messages.slice(-20).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: userMsg },
      ];

      let finalResponse = "";
      let continueLoop = true;

      while (continueLoop) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: conversationHistory,
            system: SYSTEM_PROMPT,
            tools: trainerTools,
          }),
        });

        const data = await res.json();

        if (data.stop_reason === "tool_use") {
          const toolUseBlocks = (data.content as AnthropicContentBlock[]).filter(
            (b) => b.type === "tool_use"
          );
          conversationHistory.push({
            role: "assistant",
            content: data.content,
          });

          const toolResults: AnthropicContentBlock[] = [];
          for (const toolBlock of toolUseBlocks) {
            const result = await executeToolCall(
              toolBlock.name!,
              toolBlock.input!,
              USER_ID
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            });
          }

          conversationHistory.push({
            role: "user",
            content: toolResults,
          });
        } else {
          const textContent = (data.content as AnthropicContentBlock[])
            ?.filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n") ?? data.content;

          finalResponse = typeof textContent === "string" ? textContent : String(textContent);
          continueLoop = false;
        }
      }

      const { data: assistantMsg } = await supabase
        .from("chat_messages")
        .insert({ user_id: USER_ID, role: "assistant", content: finalResponse })
        .select()
        .single();

      if (assistantMsg) setMessages((prev) => [...prev, assistantMsg as ChatMessage]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          user_id: USER_ID,
          role: "assistant",
          content: `Fehler: ${errorMsg}`,
          created_at: new Date().toISOString(),
        },
      ]);
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-semibold">AI Trainer</h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Frag deinen Trainer! Er hat Zugriff auf alle deine Daten.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht an deinen Trainer..."
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || sending} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
