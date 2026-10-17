import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../models/access_list_auth.js", () => ({ default: {} }));
vi.mock("../../models/access_list_client.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/now_helper.js", () => ({ default: () => "now" }));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));

import service from "../../internal/access-list.js";
import { accessListFilename, accessListFiles } from "../../lib/access-list-files.js";

describe("atomic access-list files", () => {
	let directory;
	let filename;
	const hash = `$2b$12$${"A".repeat(53)}`;
	const certificate = fs.readFileSync(new URL("../fixtures/access-list-ca.pem", import.meta.url), "utf8");
	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-access-test-"));
		filename = path.join(directory, "1");
		vi.spyOn(service, "getFilename").mockReturnValue(filename);
		await fs.promises.writeFile(filename, "previous:hash\n");
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	it("publishes the complete credential set in a private file", async () => {
		await service.build({ id: 1, name: "Test", items: [{ username: "new", password: hash }] });
		expect(await fs.promises.readFile(filename, "utf8")).toBe(`new:${hash}\n`);
		expect((await fs.promises.stat(filename)).mode & 0o777).toBe(0o600);
		expect(await fs.promises.readdir(directory)).toEqual(["1"]);
	});
	it("retains the previous credentials and removes staging files if replacement fails", async () => {
		vi.spyOn(fs.promises, "rename").mockRejectedValue(new Error("disk unavailable"));
		await expect(
			service.build({ id: 1, name: "Test", items: [{ username: "new", password: hash }] }),
		).rejects.toThrow("disk unavailable");
		expect(await fs.promises.readFile(filename, "utf8")).toBe("previous:hash\n");
		expect(await fs.promises.readdir(directory)).toEqual(["1"]);
	});
	it.each([
		["one certificate", certificate],
		["multiple certificates", `${certificate}\n${certificate}`],
		["CRLF and surrounding whitespace", ` \t\r\n${certificate.replaceAll("\n", "\r\n")}\r\n\t `],
	])("validates and publishes a complete PEM bundle: %s", async (_label, pem) => {
		const artifacts = await service.build(
			{ id: 1, name: "CA", items: [], mtls_enabled: true, mtls_certificate: pem },
			{ immutable: true },
		);
		expect(await fs.promises.readFile(artifacts.ca, "utf8")).toBe(pem);
		expect(await fs.promises.readFile(filename, "utf8")).toBe("previous:hash\n");
	});
	it.each([
		"",
		" \t\r\n",
		"-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----",
		`junk${certificate}`,
		`${certificate}junk`,
		`${certificate}junk${certificate}`,
		`${certificate}-----BEGIN CERTIFICATE-----\n`,
		`-----BEGIN CERTIFICATE-----\n${certificate}-----END CERTIFICATE-----`,
		certificate.replace("-----END CERTIFICATE-----", "-----END PRIVATE KEY-----"),
		null,
		123,
		{},
	])("rejects malformed PEM bundles before writing authorization files (%#)", async (pem) => {
		const write = vi.spyOn(fs.promises, "writeFile");
		await expect(
			service.build(
				{ id: 1, name: "CA", items: [], mtls_enabled: true, mtls_certificate: pem },
				{ immutable: true },
			),
		).rejects.toMatchObject({ status: 400 });
		expect(write).not.toHaveBeenCalled();
		expect(await fs.promises.readdir(directory)).toEqual(["1"]);
	});
	it.each([false, true])(
		"rejects repeated BEGIN prefixes within a bounded time (END present: %s)",
		async (withEnd) => {
			const pem = "-----BEGIN CERTIFICATE-----\n".repeat(20_000) + (withEnd ? "-----END CERTIFICATE-----" : "");
			const write = vi.spyOn(fs.promises, "writeFile");
			const started = performance.now();
			await expect(
				service.build(
					{ id: 1, name: "CA", items: [], mtls_enabled: true, mtls_certificate: pem },
					{ immutable: true },
				),
			).rejects.toMatchObject({ status: 400 });
			expect(performance.now() - started).toBeLessThan(1_000);
			expect(write).not.toHaveBeenCalled();
		},
	);
	it("rejects bundles exceeding one MiB before parsing or publication", async () => {
		const write = vi.spyOn(fs.promises, "writeFile");
		await expect(
			service.build(
				{
					id: 1,
					name: "CA",
					items: [],
					mtls_enabled: true,
					mtls_certificate: `${certificate}${" ".repeat(1024 * 1024)}`,
				},
				{ immutable: true },
			),
		).rejects.toMatchObject({ status: 400 });
		expect(write).not.toHaveBeenCalled();
	});
	it.each([
		"../../outside",
		"/tmp/outside",
		"1/../../outside",
		"1\\outside",
		-1,
		0,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		true,
		null,
		{},
	])("rejects an invalid authorization file ID before file operations: %j", async (id) => {
		vi.restoreAllMocks();
		const write = vi.spyOn(fs.promises, "writeFile");
		await expect(service.build({ id, name: "Invalid", items: [] }, { immutable: true })).rejects.toMatchObject({
			status: 400,
		});
		expect(write).not.toHaveBeenCalled();
		expect(await fs.promises.readFile(filename, "utf8")).toBe("previous:hash\n");
	});
	it("canonicalizes numeric IDs beneath the fixed authorization directory", () => {
		vi.restoreAllMocks();
		vi.stubEnv("DATA_PATH", "");
		expect(service.getFilename({ id: 42 })).toBe("/data/access/42");
		expect(service.getFilename({ id: "42" })).toBe("/data/access/42");
	});
	it("shares the configured writable root between publication, Nginx paths and revision capture", async () => {
		vi.restoreAllMocks();
		vi.stubEnv("DATA_PATH", directory);
		const root = path.join(directory, "access");
		await fs.promises.mkdir(root);
		expect(service.getFilename({ id: 1 })).toBe(path.join(root, "1"));
		expect(accessListFilename(1)).toBe(path.join(root, "1"));
		expect(accessListFiles({ id: 1 }).auth).toBe(path.join(root, "1"));
		expect(accessListFiles({ id: 1, meta: { authorization_revision: "../../outside" } }).auth).toBe(
			path.join(root, "1"),
		);
		const previousVersion = "a".repeat(64);
		expect(accessListFiles({ id: 1, meta: { authorization_revision: previousVersion } }).auth).toBe(
			path.join(root, `1.${previousVersion}`),
		);
		const artifacts = await service.build(
			{ id: 1, name: "Root", items: [{ username: "user", password: hash }] },
			{ immutable: true },
		);
		expect(path.dirname(artifacts.auth)).toBe(root);
		expect(await fs.promises.readFile(artifacts.auth, "utf8")).toBe(`user:${hash}\n`);
		expect(accessListFiles({ id: 1, meta: { authorization_revision: artifacts.revision } })).toEqual({
			auth: artifacts.auth,
			ca: artifacts.ca,
		});
	});
	it("uses independent immutable version IDs while keeping bcrypt cost 13 authentication hashes", async () => {
		const first = await service.build(
			{ id: 1, name: "Private", items: [{ username: "user", password: "synthetic-password" }] },
			{ immutable: true },
		);
		const contents = await fs.promises.readFile(first.auth, "utf8");
		const password = contents.slice("user:".length).trimEnd();
		expect(bcrypt.getRounds(password)).toBe(13);
		expect(await bcrypt.compare("synthetic-password", password)).toBe(true);
		expect(contents).not.toContain("synthetic-password");
		const second = await service.build(
			{ id: 1, name: "Private", items: [{ username: "user", password }] },
			{ immutable: true },
		);
		expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
		expect(second.revision).toMatch(/^[a-f0-9]{64}$/);
		expect(second.revision).not.toBe(first.revision);
		expect(await fs.promises.readFile(first.auth, "utf8")).toBe(contents);
		expect(await fs.promises.readFile(second.auth, "utf8")).toBe(contents);
		expect((await fs.promises.stat(first.auth)).mode & 0o777).toBe(0o600);
		expect((await fs.promises.stat(second.auth)).mode & 0o777).toBe(0o600);
	});
});
