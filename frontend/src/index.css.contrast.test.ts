import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function block(selector: string): string {
	const start = css.indexOf(selector);
	if (start === -1) throw new Error(`Missing ${selector} block`);
	const open = css.indexOf("{", start);
	const close = css.indexOf("}", open);
	return css.slice(open + 1, close);
}

function token(source: string, name: string): [number, number, number] {
	const match = source.match(new RegExp(`${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
	if (!match) throw new Error(`Missing ${name}`);
	return [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100];
}

function luminance(name: string, source: string): number {
	const [hue, saturation, lightness] = token(source, name);
	const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = lightness - c / 2;
	const [r, g, b] =
		hue < 60
			? [c, x, 0]
			: hue < 120
				? [x, c, 0]
				: hue < 180
					? [0, c, x]
					: hue < 240
						? [0, x, c]
						: hue < 300
							? [x, 0, c]
							: [c, 0, x];
	const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
	return 0.2126 * linear(r + m) + 0.7152 * linear(g + m) + 0.0722 * linear(b + m);
}

function contrast(foreground: string, background: string, source: string): number {
	const a = luminance(foreground, source);
	const b = luminance(background, source);
	const [lighter, darker] = a > b ? [a, b] : [b, a];
	return (lighter + 0.05) / (darker + 0.05);
}

describe("destructive colour tokens", () => {
	it.each([
		["light", ":root {", ":root"],
		["dark", ".dark {", ".dark"],
	])("keep destructive text at WCAG AA contrast in %s mode", (_label, selector) => {
		const source = block(selector);
		expect(contrast("--destructive-text", "--background", source)).toBeGreaterThanOrEqual(4.5);
	});

	it.each([
		["light", ":root {"],
		["dark", ".dark {"],
	])("keep destructive fill labels readable in %s mode", (_label, selector) => {
		const source = block(selector);
		expect(contrast("--destructive-foreground", "--destructive", source)).toBeGreaterThanOrEqual(4.5);
	});

	it("does not reuse the fill token for destructive text", () => {
		expect(css).toContain("--destructive-text:");
		expect(css).toMatch(/\.text-destructive\s*\{\s*color:\s*hsl\(var\(--destructive-text\)\);/);
	});
});
