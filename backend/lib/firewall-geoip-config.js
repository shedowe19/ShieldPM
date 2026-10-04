import { constants } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import errs from "./error.js";

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 8192;
const MAX_DEPTH = 32;
const MAX_GLOB_ENTRIES = 100000;
const MAX_WORD = 1024 * 1024;
const invalid = () => new errs.ValidationError("Invalid or oversized Nginx configuration");

/** Incremental Nginx lexer. Opaque table/Lua bodies do not allocate CIDR or script tokens. */
export class ConfigurationLexer {
	word = "";
	wordStarted = false;
	words = [];
	quote = "";
	escaped = false;
	comment = false;
	variable = false;
	depth = 0;
	skipped = 0;
	lua = false;
	dash = false;
	longOpening = "";
	longClosing = "";
	longTail = "";
	commentOpening = false;
	directiveLength = 0;
	mapDepth = null;
	mapFirst = true;
	mapKind = "";
	mapWords = [];
	mapIgnoreWord = false;
	mapLastChar = "";
	mapRowStarted = false;

	constructor({ mapTable = false } = {}) {
		if (mapTable) this.mapDepth = 0;
	}

	append(char) {
		this.wordStarted = true;
		if (this.mapDepth !== null) {
			this.mapRowStarted = true;
			this.mapLastChar = char;
			if (this.mapFirst) {
				if (this.mapIgnoreWord) return;
				this.word += char;
				if (!this.word.startsWith("~") && !"include".startsWith(this.word)) {
					this.word = "";
					this.mapIgnoreWord = true;
					return;
				}
			} else if (this.mapKind === "include") this.word += char;
			else return;
		} else this.word += char;
		if (this.word.length > MAX_WORD || ++this.directiveLength > 2 * MAX_WORD) throw invalid();
	}

	flush() {
		if (this.mapDepth !== null && this.wordStarted) {
			if (this.mapFirst) {
				this.mapKind = this.word === "include" ? "include" : this.word.startsWith("~") ? "regex" : "";
				if (this.mapKind) this.mapWords.push(this.word);
			} else if (this.mapKind === "include") this.mapWords.push(this.word);
			this.mapFirst = false;
			this.mapIgnoreWord = false;
			this.mapLastChar = "";
			if (this.mapWords.length > 16384) throw invalid();
		} else if (this.wordStarted) this.words.push(this.word);
		this.word = "";
		this.wordStarted = false;
		if (this.words.length > 16384) throw invalid();
	}

	resetMapRow() {
		this.mapFirst = true;
		this.mapKind = "";
		this.mapWords = [];
		this.mapIgnoreWord = false;
		this.mapLastChar = "";
		this.mapRowStarted = false;
		this.word = "";
		this.wordStarted = false;
		this.directiveLength = 0;
	}

	/** Map rows stay opaque except their regex key or include directive. */
	inspectMap() {
		this.mapDepth = this.depth;
		this.resetMapRow();
	}

	skipBlock(lua = false) {
		this.skipped = 1;
		this.lua = lua;
	}

	*feed(chunk) {
		for (const char of chunk) {
			if (this.skipped && this.longClosing) {
				this.longTail = (this.longTail + char).slice(-this.longClosing.length);
				if (this.longTail === this.longClosing) {
					this.longClosing = this.longTail = "";
					this.comment = false;
				}
				continue;
			}
			if (this.skipped && this.lua && this.longOpening) {
				if (char === "=") {
					this.longOpening += char;
					if (this.longOpening.length > 128) throw invalid();
					continue;
				}
				if (char === "[") {
					this.longClosing = `]${this.longOpening.slice(1)}]`;
					this.longOpening = "";
					continue;
				}
				this.longOpening = "";
			}
			if (this.comment) {
				if (this.skipped && this.lua && this.commentOpening && char === "[") this.longOpening = "[";
				this.commentOpening = false;
				if (char === "\n") this.comment = false;
				continue;
			}
			if (this.escaped) {
				if (!this.skipped) {
					// ngx_conf_read_token preserves unknown escapes, including glob quoting.
					if (["\\", '"', "'"].includes(char)) this.append(char);
					else if (char === "n") this.append("\n");
					else if (char === "r") this.append("\r");
					else if (char === "t") this.append("\t");
					else {
						this.append("\\");
						this.append(char);
					}
				}
				this.escaped = false;
				continue;
			}
			if (char === "\\") {
				this.escaped = true;
				continue;
			}
			if (this.quote) {
				if (char === this.quote) this.quote = "";
				else if (!this.skipped) this.append(char);
				continue;
			}
			if ((char === '"' || char === "'") && (this.skipped || !this.wordStarted)) {
				this.quote = char;
				if (!this.skipped) {
					this.wordStarted = true;
					if (this.mapDepth !== null) this.mapRowStarted = true;
				}
				this.dash = false;
				continue;
			}
			if (this.skipped && this.lua) {
				if (char === "-" && this.dash) {
					this.comment = this.commentOpening = true;
					this.dash = false;
					continue;
				}
				this.dash = char === "-";
				if (char === "[") {
					this.longOpening = "[";
					continue;
				}
			} else if (char === "#" && (this.skipped || !this.wordStarted)) {
				if (!this.skipped) this.flush();
				this.comment = true;
				continue;
			}
			if (this.variable) {
				if (!this.skipped) this.append(char);
				if (char === "}") this.variable = false;
				continue;
			}
			if (char === "{" && (this.word.endsWith("$") || this.mapLastChar === "$")) {
				this.variable = true;
				this.append(char);
				continue;
			}
			if (this.skipped) {
				if (char === "{") this.skipped++;
				if (char === "}" && --this.skipped === 0) {
					this.depth--;
					this.lua = this.dash = false;
				}
				continue;
			}
			if (this.mapDepth !== null) {
				if (/\s/.test(char)) this.flush();
				else if (char === ";") {
					this.flush();
					if (this.mapWords.length) yield { words: this.mapWords, boundary: ";", lexer: this };
					this.resetMapRow();
				} else if (char === "}") {
					if (this.mapRowStarted || this.depth !== this.mapDepth || --this.depth < 0) throw invalid();
					this.mapDepth = null;
					yield { words: [], boundary: "}", lexer: this };
					this.resetMapRow();
				} else if (char === "{") throw invalid();
				else this.append(char);
				continue;
			}
			if (/\s/.test(char)) {
				this.flush();
				continue;
			}
			if ("{};".includes(char)) {
				this.flush();
				if (char === "{") this.depth++;
				if (char === "}" && --this.depth < 0) throw invalid();
				yield { words: this.words, boundary: char, lexer: this };
				this.words = [];
				this.directiveLength = 0;
				continue;
			}
			this.append(char);
		}
	}

	finish() {
		if (
			this.depth ||
			this.skipped ||
			this.quote ||
			this.escaped ||
			this.variable ||
			this.longClosing ||
			this.word ||
			this.wordStarted ||
			this.mapRowStarted ||
			this.words.length
		)
			throw invalid();
	}
}

const literal = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const classes = {
	alnum: "A-Za-z0-9",
	alpha: "A-Za-z",
	ascii: "\\x00-\\x7f",
	blank: " \\t",
	cntrl: "\\x00-\\x1f\\x7f",
	digit: "0-9",
	graph: "\\x21-\\x7e",
	lower: "a-z",
	print: "\\x20-\\x7e",
	punct: "\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e",
	space: " \\t\\r\\n\\v\\f",
	upper: "A-Z",
	word: "A-Za-z0-9_",
	xdigit: "A-Fa-f0-9",
};

/** libc glob flags=0: segment wildcards, POSIX classes, and no globstar/brace/extglob expansion. */
const segmentMatcher = (segment) => {
	let pattern = "";
	for (let index = 0; index < segment.length; index++) {
		const char = segment[index];
		if (char === "\\") {
			if (++index === segment.length) throw invalid();
			pattern += literal(segment[index]);
		} else if (char === "*") pattern += "[\\s\\S]*";
		else if (char === "?") pattern += "[\\s\\S]";
		else if (char === "[") {
			let end = index + 1;
			let bracket = "";
			if (segment[end] === "!" || segment[end] === "^") {
				bracket = "^";
				end++;
			}
			if (segment[end] === "]") {
				bracket += "\\]";
				end++;
			}
			for (; end < segment.length && segment[end] !== "]"; end++) {
				if (segment[end] === "[" && [":", ".", "="].includes(segment[end + 1])) {
					const kind = segment[end + 1];
					const closing = segment.indexOf(`${kind}]`, end + 2);
					if (closing === -1) throw invalid();
					const value = segment.slice(end + 2, closing);
					if (kind === ":") {
						if (!Object.hasOwn(classes, value)) throw invalid();
						bracket += classes[value];
					} else {
						if (value.length !== 1) throw invalid();
						bracket += literal(value);
					}
					end = closing + 1;
				} else if (segment[end] === "\\") {
					if (++end === segment.length) throw invalid();
					bracket += `\\${segment[end]}`;
				} else bracket += segment[end] === "[" ? "\\[" : segment[end];
			}
			if (end === segment.length) pattern += "\\[";
			else {
				pattern += `[${bracket}]`;
				index = end;
			}
		} else pattern += literal(char);
	}
	const regex = new RegExp(`^${pattern}$`);
	const dot = segment.startsWith(".") || segment.startsWith("\\.");
	return (name) => (dot || !name.startsWith(".")) && regex.test(name);
};

const directoryNames = async function* (fileSystem, directory) {
	try {
		if (fileSystem.opendir) {
			const handle = await fileSystem.opendir(directory);
			for await (const entry of handle) yield entry.name;
		} else {
			for (const name of await fileSystem.readdir(directory)) yield name;
		}
	} catch (error) {
		if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
	}
};

const includePaths = async (fileSystem, prefix, value, budget) => {
	const pattern = path.isAbsolute(value) ? value : `${prefix}/${value}`;
	if (!/[*?[]/.test(pattern)) return [pattern];
	let candidates = ["/"];
	const appendPath = (directory, name) => `${directory.endsWith("/") ? directory : `${directory}/`}${name}`;
	for (const segment of pattern.split("/").filter(Boolean)) {
		if (!/[*?[]/.test(segment)) {
			if (segment.endsWith("\\")) throw invalid();
			const name = segment.replace(/\\(.)/g, "$1");
			candidates = candidates.map((directory) => appendPath(directory, name));
		} else {
			const match = segmentMatcher(segment);
			const next = [];
			for (const directory of candidates) {
				for await (const name of directoryNames(fileSystem, directory)) {
					if (++budget.globEntries > MAX_GLOB_ENTRIES) throw invalid();
					if (match(name)) next.push(appendPath(directory, name));
					if (next.length > MAX_FILES) throw invalid();
				}
			}
			candidates = next;
		}
	}
	const matches = [];
	for (const candidate of candidates) {
		try {
			// glob() omits nonexistent literal suffixes after wildcard directory components.
			// lstat retains dangling symlink matches, which Nginx will subsequently fail to open.
			await (fileSystem.lstat || fileSystem.stat).call(fileSystem, candidate);
			matches.push(candidate);
		} catch (error) {
			if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
		}
	}
	return matches.sort((first, second) => Buffer.compare(Buffer.from(first), Buffer.from(second)));
};

const configurationChunks = async function* (fileSystem, filename) {
	if (!fileSystem.open) {
		const text = await fileSystem.readFile(filename, "utf8");
		if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw invalid();
		yield text;
		return;
	}
	const beforeOpen = await fileSystem.stat(filename);
	if (!beforeOpen.isFile() || beforeOpen.size > MAX_FILE_BYTES) throw invalid();
	// A substituted FIFO cannot make open itself wait after the regular-file check.
	const handle = await fileSystem.open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
	try {
		const stat = await handle.stat();
		if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw invalid();
		const buffer = Buffer.alloc(64 * 1024);
		const decoder = new StringDecoder("utf8");
		let bytes = 0;
		while (true) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
			if (!bytesRead) break;
			bytes += bytesRead;
			if (bytes > MAX_FILE_BYTES) throw invalid();
			yield decoder.write(buffer.subarray(0, bytesRead));
		}
		yield decoder.end();
	} finally {
		await handle.close();
	}
};

/** Expand each include in its original context; repeated includes remain repeated definitions. */
export const readConfigurationDirectives = async function* (fileSystem, masterConfig) {
	// Preserve symlink/.. traversal until the filesystem resolves it, just as Nginx does.
	const prefix = path.dirname(path.isAbsolute(masterConfig) ? masterConfig : `${process.cwd()}/${masterConfig}`);
	const budget = { files: 0, globEntries: 0 };
	const read = async function* (filename, ancestry, mapTable = false) {
		if (++budget.files > MAX_FILES || ancestry.length >= MAX_DEPTH) throw invalid();
		const canonical = fileSystem.realpath ? await fileSystem.realpath(filename) : path.resolve(filename);
		if (ancestry.includes(canonical)) throw invalid();
		const lexer = new ConfigurationLexer({ mapTable });
		for await (const chunk of configurationChunks(fileSystem, filename)) {
			for (const directive of lexer.feed(chunk)) {
				if (directive.boundary === ";" && directive.words[0] === "include") {
					if (directive.words.length !== 2) throw invalid();
					const paths = await includePaths(fileSystem, prefix, directive.words[1], budget);
					for (const included of paths)
						yield* read(included, [...ancestry, canonical], lexer.mapDepth !== null);
				} else yield directive;
			}
		}
		lexer.finish();
	};
	yield* read(masterConfig, []);
};
