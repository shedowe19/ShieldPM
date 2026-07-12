import { IconRobot } from "@tabler/icons-react";
import { createContext, lazy, type PropsWithChildren, Suspense, useContext, useState } from "react";
import { cn } from "src/lib/utils";
import { T } from "src/locale";

interface AiChatLauncherContextValue {
	isOpen: boolean;
	openChat: () => void;
}

const AiChatLauncherContext = createContext<AiChatLauncherContextValue | undefined>(undefined);
const LazyAiChat = lazy(() => import("./AiChat").then(({ AiChat }) => ({ default: AiChat })));

export function AiChatLauncher({ children }: PropsWithChildren) {
	const [isLoaded, setIsLoaded] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const openChat = () => {
		setIsLoaded(true);
		setIsOpen(true);
	};

	return (
		<AiChatLauncherContext.Provider value={{ isOpen, openChat }}>
			{children}
			{isLoaded && (
				<Suspense fallback={null}>
					<LazyAiChat open={isOpen} onOpenChange={setIsOpen} />
				</Suspense>
			)}
		</AiChatLauncherContext.Provider>
	);
}

export function AiChatLauncherTrigger() {
	const context = useContext(AiChatLauncherContext);

	if (!context) return null;

	return (
		<button
			type="button"
			className={cn(
				"group flex w-full items-center rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-purple-400 transition-colors duration-200 hover:bg-purple-500/10 hover:text-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				context.isOpen ? "bg-purple-500/10 text-purple-400" : "transparent",
			)}
			onClick={context.openChat}
			aria-expanded={context.isOpen}
		>
			<IconRobot className="mr-2 h-4 w-4" />
			<span>
				<T id="ai.title" />
			</span>
		</button>
	);
}
