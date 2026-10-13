import CodeEditor, { type TextareaCodeEditorProps } from "@uiw/react-textarea-code-editor/nohighlight";
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

export default function ConfiguredCodeEditor({ rehypePlugins = editorPlugins, ...props }: TextareaCodeEditorProps) {
	return <CodeEditor rehypePlugins={rehypePlugins} {...props} />;
}
