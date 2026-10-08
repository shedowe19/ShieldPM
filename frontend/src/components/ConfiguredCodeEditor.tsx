import CodeEditor, { type TextareaCodeEditorProps } from "@uiw/react-textarea-code-editor/nohighlight";
import css from "refractor/lang/css.js";
import javascript from "refractor/lang/javascript.js";
import json from "refractor/lang/json.js";
import nginx from "refractor/lang/nginx.js";
import php from "refractor/lang/php.js";
import { refractor } from "refractor/lib/core.js";
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
