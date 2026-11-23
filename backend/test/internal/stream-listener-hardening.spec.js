import { describe, expect, it } from "vitest";
import utils from "../../lib/utils.js";

const render = (env) =>
	utils.getRenderEngine().renderFile("stream.conf", {
		env: {
			IPV4_BINDING: "0.0.0.0",
			IPV6_BINDING: "[::]",
			DISABLE_IPV6: "false",
			...env,
		},
		enabled: true,
		tcp_forwarding: true,
		udp_forwarding: true,
		incoming_port: 12345,
		forwarding_host: "target.example.test",
		forwarding_port: 9000,
		certificate: null,
	});

describe("stream listener binding", () => {
	it("keeps the explicit public IPv4/IPv6 bind by default", async () => {
		const rendered = await render({});
		expect(rendered).toContain("listen 0.0.0.0:12345 deferred");
		expect(rendered).toContain("listen [::]:12345 deferred");
		expect(rendered).toContain("listen 0.0.0.0:12345 udp reuseport");
	});

	it("can pin every stream listener to loopback", async () => {
		const rendered = await render({ STREAM_LISTEN_LOCALHOST: "true" });
		expect(rendered).toContain("listen 127.0.0.1:12345 deferred");
		expect(rendered).toContain("listen 127.0.0.1:12345 udp reuseport");
		expect(rendered).not.toContain("listen 0.0.0.0:12345");
		expect(rendered).not.toContain("listen [::]:12345");
	});
});
