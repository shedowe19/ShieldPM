import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import langDe from "src/locale/lang/de.json";
import langEn from "src/locale/lang/en.json";
import { AUDIT_LOG_ACTION, AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { describe, expect, it } from "vitest";
import { getAuditLogObjectTypeMessageId, isKnownAuditLogObjectType } from "./audit-log-object-types";

const readSources = (directory: string): string[] =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return readSources(path);
		return entry.name.endsWith(".js") ? [readFileSync(path, "utf8")] : [];
	});

describe("Audit object type labels", () => {
	it("covers every literal backend audit emitter without initializing backend services", () => {
		const sources = ["../backend/internal", "../backend/routes"].flatMap((path) => readSources(resolve(path)));
		const calls = sources.flatMap((source) =>
			Array.from(
				source.matchAll(
					/\binternalAuditLog\.add\([^,]+,\s*\{\s*(?:action:\s*([^,\n]+)|action)\s*,\s*object_type:\s*"([^"]+)"/g,
				),
			),
		);
		const callCount = sources.reduce(
			(count, source) => count + [...source.matchAll(/\binternalAuditLog\.add\(/g)].length,
			0,
		);
		expect(callCount).toBeGreaterThan(0);
		expect(calls).toHaveLength(callCount);
		for (const [, expression, objectType] of calls) {
			expect(isKnownAuditLogObjectType(objectType), `Backend object type ${objectType}`).toBe(true);
			if (expression) {
				// A literal or a conditional with two literal branches stays statically exhaustive.
				expect(expression).toMatch(/^(?:"[^"]+"|[\w.]+\s*\?\s*"[^"]+"\s*:\s*"[^"]+")$/);
				for (const [, action] of expression.matchAll(/"([^"]+)"/g))
					expect(Object.values(AUDIT_LOG_ACTION), `Backend action ${action}`).toContain(action);
			} else {
				// The backup wrapper forwards its action; validate every wrapper call below.
				expect(objectType).toBe("setting");
			}
		}
		const wrappers = sources.filter((source) => /\binternalAuditLog\.add\([^,]+,\s*\{\s*action\s*,/.test(source));
		for (const source of wrappers) {
			expect(source).toMatch(
				/const audit = \(access, action, operation, id, details = \{\}\) =>\s*internalAuditLog\.add/,
			);
			const invocations = [...source.matchAll(/\baudit\([^;\n]*?,\s*"([^"]+)",\s*"[^"]+"/g)];
			expect(invocations.length).toBeGreaterThan(0);
			expect(invocations).toHaveLength([...source.matchAll(/\baudit\(/g)].length);
			for (const [, action] of invocations)
				expect(Object.values(AUDIT_LOG_ACTION), `Backend wrapper action ${action}`).toContain(action);
		}
	});

	it.each(Object.values(AUDIT_LOG_OBJECT_TYPE))("has a DE and EN resource label for %s", (objectType) => {
		const id = getAuditLogObjectTypeMessageId(objectType);
		expect(id).not.toBe("audit-log.event");
		for (const messages of [langDe, langEn]) {
			expect((messages as Record<string, string>)[id]).toBeTruthy();
		}
	});

	it.each(Object.values(AUDIT_LOG_ACTION))("has a DE and EN action label for %s", (action) => {
		for (const messages of [langDe, langEn]) {
			expect((messages as Record<string, string>)[`object.event.${action}`]).toBeTruthy();
		}
	});

	it.each([null, undefined, "", " ", "future-resource", "__proto__", "constructor", "toString"])(
		"uses the generic label for an unrecognized type %s",
		(objectType) => {
			expect(isKnownAuditLogObjectType(objectType)).toBe(false);
			expect(getAuditLogObjectTypeMessageId(objectType)).toBe("audit-log.event");
		},
	);
});
