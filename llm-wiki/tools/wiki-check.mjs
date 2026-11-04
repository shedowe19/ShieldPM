#!/usr/bin/env node
/**
 * Selbstprüfung für das ShieldPM-LLM-Wiki.
 *
 * Prüft: relative Links inkl. Anker (case-sensitiv), Index-Erreichbarkeit,
 * Kernseiten, Seitenstruktur, Wikilinks, Dateinamen, AGENTS-Marker,
 * Schema-Metadaten, Secret-Muster, Public-Redaktion, Raw-Manifest und die
 * Pfadfilter von docker.yml.
 *
 * Aufruf: node llm-wiki/tools/wiki-check.mjs [repo-root]
 * Exit: 0 = PASS, 1 = FAIL. Schreibt nichts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(here, "../.."));
const wikiRoot = path.join(root, "llm-wiki");
const pagesDir = path.join(wikiRoot, "wiki");
const refDir = path.join(pagesDir, "reference");
const rawDir = path.join(wikiRoot, "raw");
const failures = [];
const notes = [];
const fail = (message) => failures.push(message);
const note = (message) => notes.push(message);

const guarded = (fn, fallback) => {
	try {
		return fn();
	} catch (error) {
		fail(`reading failed: ${error.message}`);
		return fallback;
	}
};

const walk = (dir) => {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? walk(full) : [full];
	});
};

const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");

if (!fs.existsSync(wikiRoot)) {
	console.log("FAIL");
	console.log(` - missing wiki root: ${path.relative(root, wikiRoot)}`);
	process.exit(1);
}

// Remove HTML comments first, then fenced blocks (``` / ~~~, any length, also
// after "> ") and inline code. One line per input line keeps line numbers stable.
const stripCode = (text) => {
	const withoutComments = text.replace(/<!--[\s\S]*?-->/g, "");
	const out = [];
	let inFence = false;
	let fenceChar = "";
	let fenceLen = 0;
	for (const rawLine of withoutComments.split("\n")) {
		const line = rawLine.replace(/^(\s*>\s*)+/, "");
		const trimmed = line.trimStart();
		if (!inFence) {
			const open = trimmed.match(/^(`{3,}|~{3,})/);
			if (open) {
				inFence = true;
				fenceChar = open[1][0];
				fenceLen = open[1].length;
				out.push("");
				continue;
			}
			out.push(line.replace(/`+[^`]*`+/g, " "));
		} else if (trimmed.startsWith(fenceChar.repeat(fenceLen)) && new RegExp(`^\\${fenceChar}{${fenceLen},}\\s*$`).test(trimmed)) {
			inFence = false;
			out.push("");
		} else {
			out.push("");
		}
	}
	return out.join("\n");
};

const exactExists = (abs) => {
	if (!fs.existsSync(abs)) return { ok: false, reason: "missing" };
	const relative = path.relative(root, abs);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: true };
	let current = root;
	for (const segment of relative.split(path.sep)) {
		if (!segment) continue;
		let entries;
		try {
			entries = fs.readdirSync(current);
		} catch {
			return { ok: false, reason: "missing" };
		}
		if (!entries.includes(segment)) {
			const lower = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
			return { ok: false, reason: lower ? "case" : "missing" };
		}
		current = path.join(current, segment);
	}
	return { ok: true };
};

const slugify = (heading) =>
	heading
		.trim()
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.trim()
		.replace(/\s+/g, "-");

const anchorsCache = new Map();
const anchorsOf = (file) => {
	if (anchorsCache.has(file)) return anchorsCache.get(file);
	const anchors = new Set();
	const seen = new Map();
	for (const line of stripCode(read(file)).split("\n")) {
		const match = line.match(/^#{1,6}\s+(.+)$/);
		if (!match) continue;
		const base = slugify(match[1]);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		anchors.add(count === 0 ? base : `${base}-${count}`);
	}
	anchorsCache.set(file, anchors);
	return anchors;
};

const inlineLinkRe = /\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
const refDefRe = /^\s*\[([^\]]+)\]:\s*(\S+)/gm;
const htmlHrefRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;

const collectLinks = (file) => {
	const text = stripCode(read(file));
	const links = [];
	const definitions = new Set();
	let match;
	while ((match = refDefRe.exec(text))) {
		definitions.add(match[1].trim().toLowerCase());
		links.push(match[2]);
	}
	while ((match = inlineLinkRe.exec(text))) links.push(match[1].replace(/^<|>$/g, ""));
	while ((match = htmlHrefRe.exec(text))) links.push(match[1]);
	while ((match = /<img\s+[^>]*src=["']([^"']+)["']/gi.exec(text))) links.push(match[1]);
	for (const usage of text.matchAll(/\[[^\]]*\]\[([^\]]*)\]/g)) {
		let id = usage[1].trim().toLowerCase();
		if (!id) {
			const label = usage[0].match(/^\[([^\]]*)\]/)?.[1]?.trim().toLowerCase() ?? "";
			id = label;
		}
		if (!definitions.has(id)) links.push(`__undefined_reference__/${id}`);
	}
	return links;
};

const resolveLink = (file, target) => {
	if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;
	let clean;
	try {
		clean = decodeURIComponent(target.split("?")[0]);
	} catch {
		return { invalid: target };
	}
	const [filePart, fragment] = clean.split("#");
	if (!filePart) {
		return fragment ? { abs: file, fragment, samePage: true } : null;
	}
	return { abs: path.resolve(path.dirname(file), filePart), fragment };
};

const allMarkdown = walk(wikiRoot).filter((file) => file.toLowerCase().endsWith(".md"));
const linkChecked = allMarkdown.filter(
	(file) => !file.startsWith(rawDir + path.sep) || file === path.join(rawDir, "README.md"),
);
const wikiPages = walk(pagesDir).filter((file) => file.toLowerCase().endsWith(".md"));
const curated = wikiPages.filter((page) => !page.startsWith(refDir + path.sep));

// 1. Links and anchors
for (const file of linkChecked) {
	for (const target of collectLinks(file)) {
		const resolved = resolveLink(file, target);
		if (!resolved) continue;
		if (resolved.invalid) {
			fail(`invalid link target in ${path.relative(root, file)} -> ${resolved.invalid}`);
			continue;
		}
		const result = exactExists(resolved.abs);
		if (!result.ok) {
			fail(
				`${result.reason === "case" ? "case-mismatched" : "broken"} link in ${path.relative(root, file)} -> ${target}`,
			);
			continue;
		}
		if (resolved.fragment && resolved.abs.toLowerCase().endsWith(".md")) {
			const anchors = guarded(() => anchorsOf(resolved.abs), new Set());
			if (!anchors.has(resolved.fragment)) {
				fail(`unknown anchor in ${path.relative(root, file)} -> ${target}`);
			}
		}
	}
}

// 2. Index reachability
const indexFile = path.join(pagesDir, "index.md");
if (!fs.existsSync(indexFile)) {
	fail("missing core page: index.md");
} else {
	const indexed = new Set(
		collectLinks(indexFile)
			.map((link) => resolveLink(indexFile, link)?.abs)
			.filter(Boolean)
			.map((abs) => path.resolve(abs)),
	);
	for (const page of curated) {
		if (page === indexFile) continue;
		if (!indexed.has(path.resolve(page))) fail(`not linked from index.md: ${path.relative(pagesDir, page)}`);
	}
	const refIndex = path.join(refDir, "index.md");
	if (!fs.existsSync(refIndex)) {
		fail("missing reference/index.md");
	} else if (!indexed.has(path.resolve(refIndex))) {
		fail("reference/index.md is not linked from index.md");
	} else {
		const refIndexed = new Set(
			collectLinks(refIndex)
				.map((link) => resolveLink(refIndex, link)?.abs)
				.filter(Boolean)
				.map((abs) => path.resolve(abs)),
		);
		for (const page of wikiPages.filter((candidate) => candidate.startsWith(refDir + path.sep))) {
			if (page === refIndex) continue;
			if (!refIndexed.has(path.resolve(page))) {
				fail(`not linked from reference/index.md: ${path.relative(refDir, page)}`);
			}
		}
	}
}

// 3. Core pages (present and non-empty)
for (const core of ["index", "overview", "current-project-state", "tasks", "log", "changelog"]) {
	const file = path.join(pagesDir, `${core}.md`);
	if (!fs.existsSync(file)) fail(`missing core page: ${core}.md`);
	else if (guarded(() => stripCode(read(file)).trim().length, 0) < 40) fail(`core page is empty: ${core}.md`);
}

// 4. Curated page structure: contiguous metadata block after the title
const exempt = new Set(["index.md", "tasks.md", "log.md", "changelog.md", "decisions/adr-template.md"]);
for (const page of curated) {
	const rel = path.relative(pagesDir, page).replaceAll("\\", "/");
	if (exempt.has(rel)) continue;
	const text = guarded(() => stripCode(read(page)), "");
	const lines = text.split("\n").filter((line, index, all) => !(index === 0 && line.trim() === ""));
	if (!/^# .+$/.test(lines[0] ?? "")) fail(`no title: ${rel}`);
	const firstSection = lines.findIndex((line, index) => index > 0 && /^## /.test(line));
	const head = firstSection === -1 ? lines.slice(1) : lines.slice(1, firstSection);
	const meta = head.filter((line) => line.trim().length > 0);
	const expected = [/^Status: (active|draft|superseded|deprecated)$/, /^Last verified: \d{4}-\d{2}-\d{2}$/, /^Confidence: (high|medium|low)$/];
	for (const pattern of expected) {
		const hits = meta.filter((line) => pattern.test(line));
		if (hits.length !== 1) fail(`metadata ${pattern.source} appears ${hits.length}x before first section: ${rel}`);
	}
	const statusLines = text.split("\n").filter((line) => /^Status:/.test(line));
	if (statusLines.length > 1) fail(`duplicate Status lines: ${rel}`);
	if (text.split("\n").filter((line) => /^Last verified:/.test(line)).length !== 1) fail(`duplicate/missing Last verified: ${rel}`);
	if (text.split("\n").filter((line) => /^Confidence:/.test(line)).length !== 1) fail(`duplicate/missing Confidence: ${rel}`);
	if (!/^## Zweck$/m.test(text)) fail(`no purpose section: ${rel}`);
	if (!/^## Verwandte Seiten$/m.test(text)) fail(`no related pages: ${rel}`);
	else {
		const section = text.split(/^## Verwandte Seiten$/m)[1] ?? "";
		if (!/\[[^\]]+\]\(/.test(section)) fail(`related section has no links: ${rel}`);
	}
}

// 5. AGENTS markers
const agentsFile = path.join(root, "AGENTS.md");
if (!fs.existsSync(agentsFile)) {
	fail("missing AGENTS.md");
} else {
	const agents = guarded(() => read(agentsFile), "");
	const start = (agents.match(/<!-- LLM-WIKI:START -->/g) || []).length;
	const end = (agents.match(/<!-- LLM-WIKI:END -->/g) || []).length;
	if (start !== 1 || end !== 1) fail(`AGENTS markers: start=${start} end=${end}`);
	if (start === 1 && end === 1 && agents.indexOf("LLM-WIKI:START") > agents.indexOf("LLM-WIKI:END")) {
		fail("AGENTS markers are in the wrong order");
	}
}

// 6. Schema metadata (outside code fences)
const schemaFile = path.join(wikiRoot, "README.md");
let visibility = null;
if (!fs.existsSync(schemaFile)) {
	fail("missing llm-wiki/README.md");
} else {
	const schema = guarded(() => stripCode(read(schemaFile)), "");
	visibility = schema.match(/^Visibility: (public|private)$/m)?.[1] ?? null;
	if ((schema.match(/^Visibility:/gm) || []).length > 1) fail("duplicate Visibility line");
	if (!/^Language: (German|English)$/m.test(schema)) fail("Language not persisted");
	if (!visibility) fail("Visibility not persisted");
	if (!/^Schema: \d+$/m.test(schema)) fail("Schema version missing");
	for (const operation of ["### Ingest", "### Query", "### Lint"]) {
		if (!schema.includes(operation)) fail(`schema lacks ${operation.slice(4)} section`);
	}
}

// 7. Wikilinks (outside code)
for (const file of allMarkdown) {
	if (/\[\[[^\]]+\]\]/.test(stripCode(read(file)))) {
		fail(`wikilink syntax in ${path.relative(root, file)}`);
	}
}

// 8. File names
for (const page of wikiPages) {
	const name = path.basename(page);
	if (name !== "README.md" && !/^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(name)) {
		fail(`non-kebab filename: ${path.relative(root, page)}`);
	}
}

// 9. Secrets and 10. redaction over all text assets (not just Markdown)
const toolDir = path.join(wikiRoot, "tools") + path.sep;
const textAssets = walk(wikiRoot).filter(
	(file) => /\.(md|json|html|txt|ya?ml|sh|mjs|cjs|js)$/i.test(file) && !file.startsWith(toolDir),
);
const secretPatterns = [
	["assignment", /(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*["']?(?!\$|<|your-|change|xxx)[^\s"'`]{6,}/i],
	["token", /\btoken\s*[:=]\s*["']?(?!\$|<|your-)[A-Za-z0-9\-_.:]{20,}/i],
	["bearer", /Authorization\s*:\s*Bearer\s+[A-Za-z0-9\-_.]{16,}/i],
	["private-key", /BEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY/],
	["aws-key", /AKIA[0-9A-Z]{16}/],
	["github-token", /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/],
	["slack-token", /xox[baprs]-[A-Za-z0-9-]+/],
	["telegram-token", /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/],
	["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
	["credentialed-url", /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@/]{3,}@/i],
];
for (const file of textAssets) {
	const text = guarded(() => read(file), "");
	for (const [label, pattern] of secretPatterns) {
		for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
			const masked = `***…(${match[0].length} Zeichen)`;
			fail(`secret-like ${label} in ${path.relative(root, file)}: ${masked}`);
		}
	}
}

const reportRedaction = (message) => (visibility === "public" ? fail(message) : note(message));
const isPrivateIpv4 = (octets) => {
	const [a, b] = octets;
	return (
		a === 10 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 169 && b === 254) ||
		(a === 100 && b >= 64 && b <= 127)
	);
};
const isReservedIpv4 = (octets) => {
	const [a, b, c] = octets;
	return (
		a === 127 ||
		a === 0 ||
		(a === 192 && b === 0 && c === 2) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113)
	);
};
const ipv4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
const ipv6 = /\b(?:f[cd][0-9a-f]{2}:|fe80:)[0-9a-f:]*\b/gi;
const email = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const internalName = /\b[a-z0-9-]+\.(?:internal|local|lan|corp|vpn|home\.arpa)\b/gi;
const envPath = /(?:\/workspace\/|\/root\/|\/home\/[^/\s]+\/|\/Users\/[^/\s]+\/|\/mnt\/|\/srv\/|[A-Za-z]:\\Users\\)/g;
for (const file of textAssets) {
	const text = guarded(() => read(file), "");
	for (const match of text.matchAll(ipv4)) {
		const octets = [match[1], match[2], match[3], match[4]].map(Number);
		if (octets.some((octet) => octet > 255)) continue;
		if (isReservedIpv4(octets)) continue;
		if (isPrivateIpv4(octets)) reportRedaction(`private IPv4 in ${path.relative(root, file)}: ${match[0]}`);
		else note(`public IPv4 in ${path.relative(root, file)}: ${match[0]}`);
	}
	for (const match of text.matchAll(ipv6)) {
		reportRedaction(`private IPv6 in ${path.relative(root, file)}: ${match[0]}`);
	}
	for (const match of text.matchAll(email)) {
		if (!/example\.(com|org|net)$/i.test(match[0])) {
			reportRedaction(`email-like in ${path.relative(root, file)}: ${match[0]}`);
		}
	}
	for (const match of text.matchAll(internalName)) {
		reportRedaction(`internal hostname in ${path.relative(root, file)}: ${match[0]}`);
	}
	for (const match of text.matchAll(envPath)) {
		reportRedaction(`build-machine path in ${path.relative(root, file)}: ${match[0]}`);
	}
}

// 11. Raw manifest: every file listed exactly, every listed file exists
const rawManifest = path.join(rawDir, "README.md");
if (fs.existsSync(rawDir)) {
	if (!fs.existsSync(rawManifest)) {
		fail("raw/ exists without README.md manifest");
	} else {
		const manifest = guarded(() => read(rawManifest), "");
		const listed = new Set();
		for (const line of manifest.split("\n")) {
			const cells = line.split("|").map((cell) => cell.trim().replaceAll("`", ""));
			if (cells.length < 3) continue;
			const candidate = cells[1];
			if (!candidate || candidate === "Pfad" || /^-+$/.test(candidate)) continue;
			if (/\s/.test(candidate)) continue;
			listed.add(candidate);
		}
		for (const file of walk(rawDir).filter((entry) => !entry.endsWith("README.md"))) {
			const name = path.basename(file);
			if (!listed.has(name)) fail(`raw file missing from manifest: ${name}`);
		}
		for (const name of listed) {
			if (!fs.existsSync(path.join(rawDir, name))) fail(`manifest lists missing raw file: ${name}`);
		}
	}
}

// 12. docker.yml path filters must exist (glob entries excluded)
const dockerWorkflow = path.join(root, ".github/workflows/docker.yml");
if (fs.existsSync(dockerWorkflow)) {
	const lines = guarded(() => read(dockerWorkflow).split("\n"), []);
	let inPaths = false;
	for (const line of lines) {
		if (/^\s*paths:\s*$/.test(line)) {
			inPaths = true;
			continue;
		}
		if (inPaths && /^\s*[a-zA-Z][\w-]*:\s*/.test(line)) {
			inPaths = false;
			continue;
		}
		if (!inPaths) continue;
		const entry = line.match(/^\s*-\s*"?([^"\n]+)"?\s*$/)?.[1]?.trim();
		if (!entry || entry.includes("*") || entry.startsWith("#")) continue;
		if (!fs.existsSync(path.join(root, entry))) fail(`docker.yml path filter does not exist: ${entry}`);
	}
}

console.log(
	`files: ${allMarkdown.length}, curated: ${curated.length}, reference: ${wikiPages.length - curated.length}, text assets: ${textAssets.length}, visibility: ${visibility ?? "unknown"}`,
);
for (const entry of [...new Set(notes)]) console.log(`NOTE ${entry}`);
if (failures.length) {
	console.log("FAIL");
	for (const failure of [...new Set(failures)]) console.log(` - ${failure}`);
	process.exit(1);
}
console.log("PASS");
