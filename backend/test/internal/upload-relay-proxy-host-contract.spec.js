import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn().mockResolvedValue() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: vi.fn().mockReturnValue("host-token") }));

import internalNginx from "../../internal/nginx.js";

const host = (overrides = {}) => ({
	access_list: { clients: [], items: [{}], pass_auth: false },
	access_list_id: 1,
	advanced_config: "",
	certificate_id: 0,
	domain_names: ["uploads.example.test"],
	enabled: true,
	forward_host: "10.0.17.4",
	forward_port: 8080,
	forward_scheme: "http",
	id: 74,
	meta: {},
	upload_relay_chunk_size: 80 * 1024 * 1024,
	upload_relay_enabled: true,
	upload_relay_path: "/_shieldpm-upload",
	...overrides,
});

const readJson = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));

describe("Proxy Host upload relay contract", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(fs.promises, "writeFile").mockResolvedValue();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it("routes only an opted-in public upload path to the original upstream without buffering the chunk", async () => {
		await internalNginx.generateConfig("proxy_host", host());
		const rendered = fs.promises.writeFile.mock.calls.at(-1)[1];
		expect(rendered).toContain("location = /_shieldpm-upload");
		expect(rendered).toContain("location ^~ /_shieldpm-upload/");
		expect(rendered).toContain("client_max_body_size 83886080;");
		expect(rendered).toContain("proxy_request_buffering off;");
		expect(rendered).toContain("proxy_read_timeout 10m;");
		expect(rendered).toContain("proxy_send_timeout 10m;");
		const exactRelayLocation = rendered.slice(
			rendered.indexOf("location = /_shieldpm-upload"),
			rendered.indexOf("location ^~ /_shieldpm-upload/"),
		);
		const prefixedRelayLocation = rendered.slice(
			rendered.indexOf("location ^~ /_shieldpm-upload/"),
			rendered.indexOf("# --- Turbo-Loader Interception ---"),
		);
		expect(exactRelayLocation).toContain('proxy_set_header Authorization "";');
		expect(exactRelayLocation).toContain("modsecurity_rules 'SecRequestBodyLimit 83886080';");
		expect(exactRelayLocation).toContain("modsecurity_rules 'SecRequestBodyNoFilesLimit 83886080';");
		expect(prefixedRelayLocation).toContain('proxy_set_header Authorization "";');
		expect(prefixedRelayLocation).toContain("modsecurity_rules 'SecRequestBodyLimit 83886080';");
		expect(rendered).not.toContain("modsecurity off;");
		expect(rendered).toContain("proxy_pass http://10.0.17.4:8080$request_uri;");
		expect(rendered).not.toContain("/nginx/proxy-hosts/74/upload-relay");
	});

	it("preserves the Nextcloud WebDAV request target and Destination header without a configured target path", async () => {
		await internalNginx.generateConfig(
			"proxy_host",
			host({ forward_host: "10.0.17.80", forward_port: 443, forward_scheme: "https" }),
		);
		const rendered = fs.promises.writeFile.mock.calls.at(-1)[1];
		const nextcloudUploadLocation = rendered.slice(
			rendered.indexOf("location ^~ /remote.php/dav/uploads/"),
			rendered.indexOf("location = /_shieldpm-upload"),
		);
		expect(nextcloudUploadLocation).toContain("client_max_body_size 104857600;");
		expect(nextcloudUploadLocation).toContain("modsecurity_rules 'SecRequestBodyLimit 104857600';");
		expect(nextcloudUploadLocation).toContain("modsecurity_rules 'SecRequestBodyNoFilesLimit 104857600';");
		expect(nextcloudUploadLocation).toContain("proxy_request_buffering off;");
		expect(nextcloudUploadLocation).toContain("proxy_pass https://10.0.17.80:443$request_uri;");
		expect(nextcloudUploadLocation).toContain('proxy_set_header Authorization "";');
	});

	it("honors pass_auth=false in every relay location for an IP-only Access List", async () => {
		await internalNginx.generateConfig(
			"proxy_host",
			host({
				access_list: {
					clients: [{ address: "10.0.0.0/8", directive: "allow" }],
					items: [],
					pass_auth: false,
				},
			}),
		);
		const rendered = fs.promises.writeFile.mock.calls.at(-1)[1];
		const exactRelayLocation = rendered.slice(
			rendered.indexOf("location = /_shieldpm-upload"),
			rendered.indexOf("location ^~ /_shieldpm-upload/"),
		);
		const prefixedRelayLocation = rendered.slice(
			rendered.indexOf("location ^~ /_shieldpm-upload/"),
			rendered.indexOf("# --- Turbo-Loader Interception ---"),
		);
		expect(exactRelayLocation).toContain('proxy_set_header Authorization "";');
		expect(prefixedRelayLocation).toContain('proxy_set_header Authorization "";');
	});

	it("passes public upload paths through Anubis before the private upstream", async () => {
		await internalNginx.generateConfig("proxy_host", host({ anubis_enabled: true }));
		const rendered = fs.promises.writeFile.mock.calls.at(-1)[1];
		const publicServer = rendered.slice(0, rendered.indexOf("# --- Backend Server (Internal) ---"));
		const internalServer = rendered.slice(rendered.indexOf("# --- Backend Server (Internal) ---"));
		expect(publicServer).toContain("location = /_shieldpm-upload");
		expect(publicServer).toContain("location ^~ /_shieldpm-upload/");
		expect(publicServer).toContain("location ^~ /remote.php/dav/uploads/");
		expect(publicServer).toContain("client_max_body_size 83886080;");
		expect(publicServer).toContain("proxy_buffering off;");
		expect(publicServer).toContain("proxy_request_buffering off;");
		expect(publicServer).toContain("proxy_read_timeout 10m;");
		expect(publicServer).toContain("proxy_send_timeout 10m;");
		expect(publicServer).toContain('proxy_set_header Authorization "";');
		expect(publicServer).toContain("proxy_set_header X-ShieldPM-Host $host;");
		expect(publicServer).toContain("proxy_pass http://unix:/run/shieldpm/anubis.sock;");
		expect(publicServer).not.toContain("proxy_pass http://10.0.17.4:8080$request_uri;");
		expect(internalServer).toContain("proxy_pass http://10.0.17.4:8080$request_uri;");
		expect(publicServer).not.toContain("/nginx/proxy-hosts/74/upload-relay");
	});

	it("exposes the full per-host relay configuration through the Proxy Host API contracts", () => {
		const component = readJson("../../schema/components/proxy-host-object.json");
		const create = readJson("../../schema/paths/nginx/proxy-hosts/post.json");
		const update = readJson("../../schema/paths/nginx/proxy-hosts/hostID/put.json");
		for (const field of [
			"upload_relay_enabled",
			"upload_relay_path",
			"upload_relay_target_path",
			"upload_relay_chunk_size",
			"upload_relay_max_file_size",
			"upload_relay_max_pending_bytes",
			"upload_relay_cleanup_hours",
		]) {
			expect(component.properties[field]).toBeTruthy();
			expect(create.requestBody.content["application/json"].schema.properties[field]).toBeTruthy();
			expect(update.requestBody.content["application/json"].schema.properties[field]).toBeTruthy();
		}
	});
});
