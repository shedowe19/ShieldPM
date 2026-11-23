import { IconRobot } from "@tabler/icons-react";
import { Loader2, Send, ShieldAlert, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { sendAiChat } from "src/api/backend/ai";
import type { AiChatMessage, AiPendingTool } from "src/api/backend/models";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "src/components/ui/sheet";
import { intl, T } from "src/locale";
import { AI_ROLE } from "src/types/enums";
import { AiMessage } from "./AiMessage";

type ChatMessage = AiChatMessage & { id: string };

interface PendingConfirmation {
	message: string;
	history: AiChatMessage[];
	tools: AiPendingTool[];
}

interface AiChatProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const newId = () => Math.random().toString(36).substring(7);

const describeTarget = (tool: AiPendingTool): string => {
	if (tool.target) return tool.target;
	const args = tool.args || {};
	if (Array.isArray(args.domain_names) && args.domain_names.length > 0) return args.domain_names.join(", ");
	for (const key of ["name", "email", "common_name", "nickname", "id", "host_id", "proxy_host_id"]) {
		const value = args[key];
		if (value !== undefined && value !== null && value !== "") return String(value);
	}
	return "—";
};

export function AiChat({ open, onOpenChange }: AiChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const conversation = useRef(0);
	const clearChatLabel = intl.formatMessage({ id: "ai.chat.clear" });
	const sendMessageLabel = intl.formatMessage({ id: "ai.chat.send" });

	// biome-ignore lint/correctness/useExhaustiveDependencies: Scroll should trigger on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages, loading, confirmation]);

	useEffect(() => {
		if (!open) setConfirmation(null);
	}, [open]);

	const appendAssistant = (content: string) => {
		setMessages((prev) => [...prev, { role: AI_ROLE.ASSISTANT, content, id: newId() }]);
	};

	const runRequest = async (
		message: string,
		history: AiChatMessage[],
		options?: { confirm: boolean; pendingTools: AiPendingTool[] },
	) => {
		const generation = conversation.current;
		setLoading(true);
		try {
			const response = options ? await sendAiChat(message, history, options) : await sendAiChat(message, history);
			if (generation !== conversation.current) return;

			if (response.requiresConfirmation && response.pendingTools?.length) {
				setConfirmation({ message, history, tools: response.pendingTools });
				return;
			}
			appendAssistant(response.content);
		} catch (err) {
			if (generation !== conversation.current) return;
			const msg = err instanceof Error ? err.message : String(err);
			appendAssistant(`Error: ${msg}`);
		} finally {
			if (generation === conversation.current) setLoading(false);
		}
	};

	const handleSend = async () => {
		if (!input.trim() || loading) return;

		const userMsg: ChatMessage = {
			role: AI_ROLE.USER,
			content: input,
			id: newId(),
		};
		// History is captured before the new message; a confirmed plan reuses it.
		const history = messages.map(({ id, ...rest }) => rest);
		setMessages((prev) => [...prev, userMsg]);
		setInput("");
		await runRequest(userMsg.content, history);
	};

	const handleConfirm = async () => {
		if (!confirmation || loading) return;
		const pending = confirmation;
		setConfirmation(null);
		await runRequest(pending.message, pending.history, {
			confirm: true,
			pendingTools: pending.tools,
		});
	};

	const handleCancel = () => {
		if (!confirmation) return;
		setConfirmation(null);
		appendAssistant("Action cancelled. No changes were made.");
	};

	const handleKeyDown = async (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			await handleSend();
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
						onClick={() => {
							conversation.current += 1;
							setMessages([]);
							setConfirmation(null);
							setLoading(false);
						}}
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

			<Dialog
				open={confirmation !== null}
				onOpenChange={(nextOpen: boolean) => {
					if (!nextOpen) handleCancel();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<ShieldAlert className="h-5 w-5 text-amber-500" />
							Confirm AI actions
						</DialogTitle>
						<DialogDescription>
							The AI wants to change ShieldPM state. Review the exact tool calls before they run.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 max-h-[50vh] overflow-y-auto">
						{confirmation?.tools.map((tool, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: plan entries are positional
								key={`${tool.name}-${index}`}
								className="rounded-md border p-3 text-sm space-y-1"
							>
								<div className="font-medium">{tool.name}</div>
								<div className="text-muted-foreground">Target: {describeTarget(tool)}</div>
								<pre className="text-xs overflow-x-auto bg-muted p-2 rounded">
									{JSON.stringify(tool.args, null, 2)}
								</pre>
							</div>
						))}
					</div>
					<DialogFooter className="gap-2">
						<Button variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleConfirm}>
							Confirm actions
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Sheet>
	);
}
