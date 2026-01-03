import { AiChatMessage } from "src/api/backend/models";
import { cn } from "src/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AiMessageProps {
    message: AiChatMessage;
}

export function AiMessage({ message }: AiMessageProps) {
    const isUser = message.role === "user";

    return (
        <div className={cn("flex w-full mt-2 space-x-3 max-w-md", isUser ? "ml-auto justify-end" : "")}>
            <div className={cn(
                "flex flex-col p-3 rounded-lg text-sm",
                isUser ? "bg-blue-600 text-white rounded-br-none" : "bg-gray-200 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 rounded-bl-none"
            )}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            code: ({ node, inline, className, children, ...props }: any) => {
                                return inline ? (
                                    <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs" {...props}>
                                        {children}
                                    </code>
                                ) : (
                                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            ul: ({ children }) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="ml-2">{children}</li>,
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}

