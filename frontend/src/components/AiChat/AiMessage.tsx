import { AiChatMessage } from "src/api/backend/models";
import { cn } from "src/lib/utils";
// @ts-ignore
import ReactMarkdown from "react-markdown";

interface AiMessageProps {
    message: AiChatMessage;
}

export function AiMessage({ message }: AiMessageProps) {
    const isUser = message.role === "user";

    return (
        <div className={cn("flex w-full mt-2 space-x-3 max-w-md", isUser ? "ml-auto justify-end" : "")}>
            <div className={cn(
                "flex flex-col p-3 rounded-lg text-sm",
                isUser ? "bg-blue-600 text-white rounded-br-none" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none"
            )}>
                <div className="prose dark:prose-invert text-sm max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
