import { IconRobot } from "@tabler/icons-react";
import { Loader2, Send, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { sendAiChat } from "src/api/backend/ai";
import type { AiChatMessage } from "src/api/backend/models";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "src/components/ui/sheet";
import { intl, T } from "src/locale";
import { AI_ROLE } from "src/types/enums";
import { AiMessage } from "./AiMessage";

type ChatMessage = AiChatMessage & { id: string };

interface AiChatProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AiChat({ open, onOpenChange }: AiChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const clearChatLabel = intl.formatMessage({ id: "ai.chat.clear" });
	const sendMessageLabel = intl.formatMessage({ id: "ai.chat.send" });

	// biome-ignore lint/correctness/useExhaustiveDependencies: Scroll should trigger on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages, loading]);

	const handleSend = async () => {
		if (!input.trim() || loading) return;

		const userMsg: ChatMessage = {
			role: AI_ROLE.USER,
			content: input,
			id: Math.random().toString(36).substring(7),
		};
		setMessages((prev) => [...prev, userMsg]);
		setInput("");
		setLoading(true);

		try {
			// Filter history to exclude failed/loading states if any,
			// but here we just pass the valid history (stripped of internal IDs)
			const history = messages.map(({ id, ...rest }) => rest);

			const response = await sendAiChat(userMsg.content, history);

			setMessages((prev) => [
				...prev,
				{ role: AI_ROLE.ASSISTANT, content: response.content, id: Math.random().toString(36).substring(7) },
			]);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setMessages((prev) => [
				...prev,
				{ role: AI_ROLE.ASSISTANT, content: `Error: ${msg}`, id: Math.random().toString(36).substring(7) },
			]);
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
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full" side="right">
				<SheetHeader className="flex flex-row justify-between items-center sm:text-left text-left">
					<SheetTitle className="flex items-center gap-2">
						<IconRobot className="h-5 w-5" />
						<T id="ai.title" />
					</SheetTitle>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setMessages([])}
						aria-label={clearChatLabel}
						title={clearChatLabel}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</SheetHeader>
				<SheetDescription className="sr-only">
					<T id="ai.chat.description" />
				</SheetDescription>

				<div
					className="flex-1 overflow-y-auto my-4 p-2 space-y-4 border rounded-md bg-slate-50 dark:bg-slate-900/50"
					ref={scrollRef}
				>
					{messages.length === 0 && (
						<div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-4">
							<IconRobot className="h-12 w-12 mb-4 opacity-20" />
							<p>
								<T id="ai.chat.welcome" />
							</p>
						</div>
					)}
					{messages.map((m) => (
						<AiMessage key={m.id} message={m} />
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
						placeholder={intl.formatMessage({ id: "ai.chat.placeholder" })}
						disabled={loading}
						autoFocus
					/>
					<Button
						onClick={handleSend}
						disabled={loading || !input.trim()}
						size="icon"
						aria-label={sendMessageLabel}
					>
						<Send className="h-4 w-4" />
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
