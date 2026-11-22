import CodeEditor, { type TextareaCodeEditorProps } from "@uiw/react-textarea-code-editor/nohighlight";
import type { KeyboardEvent } from "react";
import { refractor } from "refractor/core";
import css from "refractor/css";
import javascript from "refractor/javascript";
import json from "refractor/json";
import nginx from "refractor/nginx";
import php from "refractor/php";
import rehypePrismGenerator from "rehype-prism-plus/generator";

refractor.register(json);
refractor.register(nginx);
refractor.register(php);
refractor.register(css);
refractor.register(javascript);

const rehypePrism = rehypePrismGenerator(refractor);
const editorPlugins: TextareaCodeEditorProps["rehypePlugins"] = [[rehypePrism, { ignoreMissing: true }]];

export default function ConfiguredCodeEditor({
	rehypePlugins = editorPlugins,
	onKeyDown,
	...props
}: TextareaCodeEditorProps) {
	/**
	 * The underlying editor captures Tab/Shift+Tab and inserts indentation. `false`
	 * makes it skip that shortcut, so the browser handles the key instead.
	 * - Escape leaves the editor instead of trapping keyboard focus.
	 * - Ctrl/Meta+Tab is passed through to the browser/OS.
	 */
	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		onKeyDown?.(event);
		if (event.defaultPrevented) return false;
		if (event.key === "Escape") {
			event.preventDefault();
			event.currentTarget.blur();
			return false;
		}
		if (event.key === "Tab" && (event.ctrlKey || event.metaKey)) return false;
		return undefined;
	};

	return (
		<div
			data-testid="code-editor-frame"
			className="rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset"
		>
			<CodeEditor rehypePlugins={rehypePlugins} onKeyDown={handleKeyDown} {...props} />
		</div>
	);
}
