import fs from "node:fs";
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const renderEngine = new Liquid();

const readTemplate = (name) => fs.readFileSync(backendSourcePath("templates", name), "utf8");
const renderTemplate = (name, context) => renderEngine.parseAndRender(readTemplate(name), context);
const listenerLines = (config) => config.split("\n").filter((line) => line.trimStart().startsWith("listen "));

const env = {
	DISABLE_H3_QUIC: "false",
	DISABLE_HTTP: "false",
	DISABLE_IPV6: "false",
	HTTP3_ALT_SVC_PORT: "443",
	HTTPS_PORT: "443",
	HTTP_PORT: "80",
	IPV4_BINDING: "0.0.0.0",
	IPV6_BINDING: "[::]",
	LISTEN_PROXY_PROTOCOL: "false",
};

describe("TCP listener resilience", () => {
	it("renders shared TCP default listeners while retaining QUIC reuseport", async () => {
		const config = await renderTemplate("default.conf", { env, meta: {}, value: "444" });
		const lines = listenerLines(config).filter((line) => line.includes("default_server"));
		const tcp = lines.filter((line) => !line.includes(" quic"));
		const quic = lines.filter((line) => line.includes(" quic"));

		expect(tcp).toHaveLength(4);
		for (const line of tcp) {
			expect(line).not.toContain("reuseport");
			expect(line).toContain("deferred");
			expect(line).toContain("so_keepalive=on");
		}
		expect(quic).toHaveLength(2);
		for (const line of quic) expect(line).toContain("reuseport");
	});

	it("renders shared TCP stream listeners while preserving UDP reuseport", async () => {
		const config = await renderTemplate("stream.conf", {
			certificate_id: 0,
			enabled: true,
			env,
			forwarding_host: "127.0.0.1",
			forwarding_port: "8443",
			incoming_port: "8443",
			tcp_forwarding: true,
			udp_forwarding: true,
		});
		const lines = listenerLines(config);
		const tcp = lines.filter((line) => !line.includes(" udp "));
		const udp = lines.filter((line) => line.includes(" udp "));

		expect(tcp).toHaveLength(2);
		for (const line of tcp) {
			expect(line).not.toContain("reuseport");
			expect(line).toContain("deferred");
			expect(line).toContain("so_keepalive=on");
		}
		expect(udp).toHaveLength(2);
		for (const line of udp) expect(line).toContain("reuseport");
	});
});
