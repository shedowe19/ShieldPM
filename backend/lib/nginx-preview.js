/** A rendered config can contain OIDC credentials and host-bound terminal tokens. */
export const redactPreviewConfig = (text) =>
	text
		.replace(
			/-----BEGIN (?:[\w ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[\w ]+ )?PRIVATE KEY-----/g,
			"[REDACTED PRIVATE KEY]",
		)
		.replace(
			/(\b(?:client_secret|cookie_secret|private_key|password|api_key|access_token)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s;,}]+)/gi,
			"$1[REDACTED]",
		)
		.replace(/(proxy_set_header\s+X-ShieldPM-Terminal-Token\s+)(?:"[^"]*"|'[^']*'|[^;\s]+)/gi, "$1[REDACTED]")
		.replace(
			/(proxy_set_header\s+(?:Authorization|Proxy-Authorization|X-Api-Key)\s+)(?!\$)(?:"[^"]*"|'[^']*'|[^;\s]+)/gi,
			"$1[REDACTED]",
		);

// Whitespace from nginxbeautifier is cosmetic; compare directives while returning the exact rendered text separately.
const lines = (text) =>
	text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

/** Full line diff. Large configs fall back to a complete delete/add view to bound CPU and memory. */
export const buildPreviewDiff = (current, proposed) => {
	const left = lines(current || "");
	const right = lines(proposed);
	const operations = ["--- current", "+++ proposed"];
	const cells = left.length * right.length;
	if (cells > 4_000_000 || left.length > 3_000 || right.length > 3_000) {
		for (const line of left) operations.push(`-${line}`);
		for (const line of right) operations.push(`+${line}`);
		return operations.join("\n");
	}
	const matrix = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
	for (let i = left.length - 1; i >= 0; i--) {
		for (let j = right.length - 1; j >= 0; j--) {
			matrix[i][j] =
				left[i] === right[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
		}
	}
	let i = 0;
	let j = 0;
	while (i < left.length || j < right.length) {
		if (i < left.length && j < right.length && left[i] === right[j]) {
			operations.push(` ${left[i++]}`);
			j++;
		} else if (j < right.length && (i === left.length || matrix[i][j + 1] >= matrix[i + 1][j])) {
			operations.push(`+${right[j++]}`);
		} else {
			operations.push(`-${left[i++]}`);
		}
	}
	return operations.join("\n");
};
