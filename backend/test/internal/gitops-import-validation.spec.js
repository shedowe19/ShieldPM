import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isDestructiveTestMode: vi.fn().mockReturnValue(false),
	configHas: vi.fn().mockReturnValue(true),
	configGet: vi.fn().mockReturnValue("mock-value"),
	isSqlite: vi.fn().mockReturnValue(true),
	isMysql: vi.fn().mockReturnValue(false),
	isPostgres: vi.fn().mockReturnValue(false),
	getPrivateKey: vi.fn().mockReturnValue("mock-private-key"),
	getPublicKey: vi.fn().mockReturnValue("mock-public-key"),
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("isomorphic-git", () => ({ default: {} }));
vi.mock("isomorphic-git/http/node", () => ({ default: { request: vi.fn() } }));

import internalGitOps from "../../internal/gitops.js";

const temporaryDirectories = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })),
	);
});

const writeSnapshot = async () => {
	const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-snapshot-test-"));
	temporaryDirectories.push(root);
	await fs.promises.mkdir(path.join(root, "proxy-hosts"));
	const artifact = {
		id: 1,
		domain_names: ["proxy.example.com"],
		forward_scheme: "https",
		forward_host: "backend.internal",
		forward_port: 8443,
		enabled: true,
	};
	const content = `${JSON.stringify(artifact, null, 2)}\n`;
	await fs.promises.writeFile(path.join(root, "proxy-hosts", "1.yaml"), content);
	const manifest = {
		version: 2,
		projection: "shieldpm-public-config-v2",
		complete: true,
		files: [
			{
				path: "proxy-hosts/1.yaml",
				kind: "proxy_host",
				id: 1,
				sha256: crypto.createHash("sha256").update(content).digest("hex"),
				size: Buffer.byteLength(content),
			},
		],
		counts: { proxy_host: 1, redirection_host: 0, dead_host: 0, stream: 0 },
	};
	await fs.promises.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	return root;
};

describe("GitOps exact public import projection", () => {
	it("does not expose mutable schemas for secret-bearing subsystems", () => {
		const allowed = internalGitOps.ALLOWED_IMPORT_FIELDS;
		expect(Object.keys(allowed).sort()).toEqual(["DeadHost", "ProxyHost", "RedirectionHost", "Stream"]);
		expect(allowed.User).toBeUndefined();
		expect(allowed.Certificate).toBeUndefined();
		expect(allowed.AccessList).toBeUndefined();
		expect(allowed.DdnsProvider).toBeUndefined();
		expect(allowed.CloudflaredTunnel).toBeUndefined();
		expect(allowed.Setting).toBeUndefined();
	});

	it("rejects unknown models and unknown fields instead of silently dropping them", () => {
		expect(internalGitOps.sanitizeImportData("UnknownModel", { id: 1 })).toBeNull();
		expect(
			internalGitOps.sanitizeImportData("ProxyHost", {
				id: 1,
				domain_names: ["proxy.example.com"],
				forward_scheme: "http",
				forward_host: "backend",
				forward_port: 8080,
				enabled: true,
				injected_field: true,
			}),
		).toBeNull();
	});

	it("rejects ownership, deletion, credentials and redaction markers", () => {
		for (const unsafe of [
			{ owner_user_id: 99 },
			{ is_deleted: false },
			{ terminal_password: "secret" },
			{ forward_host: "[REDACTED]" },
		]) {
			expect(internalGitOps.sanitizeImportData("ProxyHost", { id: 1, ...unsafe })).toBeNull();
		}
	});

	it("accepts an exact safe projection without adding fields", () => {
		const input = {
			id: 1,
			domain_names: ["proxy.example.com"],
			forward_scheme: "https",
			forward_host: "backend.internal",
			forward_port: 8443,
			enabled: true,
		};
		expect(internalGitOps.sanitizeImportData("ProxyHost", input)).toEqual(input);
	});

	it("recursively redacts key-shaped and PEM secret material on export", () => {
		expect(
			internalGitOps.sanitizeForExport({
				name: "safe",
				nested: { api_token: "abc", value: "-----BEGIN PRIVATE KEY-----\nabc" },
			}),
		).toEqual({ name: "safe", nested: { api_token: "[REDACTED]", value: "[REDACTED]" } });
	});
});

describe("GitOps snapshot v2 manifest", () => {
	it("accepts an exact, deterministic public snapshot", async () => {
		const root = await writeSnapshot();
		const snapshot = await internalGitOps._loadSnapshot(root);
		expect(snapshot.artifacts).toHaveLength(1);
		expect(snapshot.artifacts[0].data.forward_host).toBe("backend.internal");
	});

	it("rejects artifact tampering and unlisted files", async () => {
		const tamperedRoot = await writeSnapshot();
		await fs.promises.appendFile(path.join(tamperedRoot, "proxy-hosts", "1.yaml"), " ");
		await expect(internalGitOps._loadSnapshot(tamperedRoot)).rejects.toThrow("integrity check");

		const extraRoot = await writeSnapshot();
		await fs.promises.writeFile(path.join(extraRoot, "proxy-hosts", "2.yaml"), "{}\n");
		await expect(internalGitOps._loadSnapshot(extraRoot)).rejects.toThrow("unlisted or missing");
	});
});
