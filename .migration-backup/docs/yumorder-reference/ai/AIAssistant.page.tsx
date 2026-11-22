import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Sparkles, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIAssistant() {
  const { t, i18n } = useTranslation();
  const initialGreeting = (): Message[] => [{ role: "assistant", content: t("ai.greeting") }];
  const [messages, setMessages] = useState<Message[]>(initialGreeting);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const { toast } = useToast();

  const suggestions = (t("ai.suggestions", { returnObjects: true }) as string[]) || [];

  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].role === "assistant" ? initialGreeting() : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const history = messages.length === 1 && messages[0].role === "assistant" ? [] : messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-order-assistant", {
        body: { message: userMsg.content, language: i18n.language, history },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message || t("ai.noProcess") },
      ]);

      if (data.cartItems && data.cartItems.length > 0) {
        for (const item of data.cartItems) {
          addItem({
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity || 1,
            restaurantId: item.restaurant_id,
            restaurantName: item.restaurant_name,
            imageUrl: item.image_url,
          });
        }
        toast({
          title: t("ai.added"),
          description: t("ai.addedCount", { count: data.cartItems.length }),
        });
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("ai.errorMsg") }]);
    }

    setLoading(false);
  };

  const showSuggestions = messages.length === 1 && !loading;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Card className="flex h-[75vh] flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-primary" />
            {t("ai.title")}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages(initialGreeting())}
            disabled={loading || messages.length <= 1}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("ai.clear")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-0">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {showSuggestions && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="flex items-center gap-1.5 rounded-full border-2 border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Sparkles className="h-3 w-3" />
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                    {t("ai.thinking")}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
            >
              <Input
                placeholder={t("ai.placeholder")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                maxLength={500}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
