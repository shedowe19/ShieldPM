import type { TextareaCodeEditorProps } from "@uiw/react-textarea-code-editor";
import { lazy, Suspense } from "react";

const CodeEditor = lazy(() => import("@uiw/react-textarea-code-editor"));

export function LazyCodeEditor({ minHeight = 160, ...props }: TextareaCodeEditorProps) {
	return (
		<Suspense fallback={<div aria-hidden className="animate-pulse rounded-md bg-muted/50" style={{ minHeight }} />}>
			<CodeEditor minHeight={minHeight} {...props} />
		</Suspense>
	);
}
