import React, { useState, useRef, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "src/components/ui/sheet";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { IconRobot } from "@tabler/icons-react";
import { Send, Loader2, Trash2 } from "lucide-react";
import { AiMessage } from "./AiMessage";
import { AiChatMessage } from "src/api/backend/models";
import { sendAiChat } from "src/api/backend/ai";
import { cn } from "src/lib/utils";

export function AiChat() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll should trigger on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: AiChatMessage = { role: "user", content: input };
        setMessages((prev: AiChatMessage[]) => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            // Filter history to exclude failed/loading states if any, 
            // but here we just pass the valid history
            const history = messages;
            console.log("Sending chat request:", { message: userMsg.content, historyLength: history.length });

            const response = await sendAiChat(userMsg.content, history);
            console.log("Received chat response:", response);
            setMessages((prev: AiChatMessage[]) => [...prev, { role: "assistant", content: response.content }]);
        } catch (err: any) {
            console.error("Chat error:", err);
            setMessages((prev: AiChatMessage[]) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <div
                    className={cn(
                        "group flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-purple-500/10 hover:text-purple-400 cursor-pointer text-purple-400 transition-colors duration-200",
                        open ? "bg-purple-500/10 text-purple-400" : "transparent"
                    )}
                >
                    <IconRobot className="mr-2 h-4 w-4" />
                    <span><T id="ai.title" /></span>
                </div>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full" side="right">
                <SheetHeader className="flex flex-row justify-between items-center sm:text-left text-left">
                    <SheetTitle className="flex items-center gap-2">
                        <IconRobot className="h-5 w-5" />
                        <T id="ai.title" />
                    </SheetTitle>
                    <Button variant="ghost" size="icon" onClick={() => setMessages([])} title="Clear Chat">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto my-4 p-2 space-y-4 border rounded-md bg-slate-50 dark:bg-slate-900/50" ref={scrollRef}>
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
                            <IconRobot className="h-12 w-12 mb-4 opacity-20" />
                            <p>How can I help you manage your proxy hosts today?</p>
                        </div>
                    )}
                    {messages.map((m: AiChatMessage, i: number) => (
                        <AiMessage key={i} message={m} />
                    ))}
                    {loading && (
                        <div className="flex w-full mt-2 space-x-3 max-w-md">
                            <div className="flex flex-col p-3 rounded-lg text-sm bg-gray-200 dark:bg-gray-700/50 rounded-bl-none">
                                <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 mt-auto">
                    <Input
                        value={input}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask AI to list hosts, check logs..."
                        disabled={loading}
                        autoFocus
                    />
                    <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon">
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
