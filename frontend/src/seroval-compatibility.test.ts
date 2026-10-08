import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireFromTest = createRequire(import.meta.url);
const requireFromReactDevtools = createRequire(requireFromTest.resolve("@tanstack/react-query-devtools"));
const requireFromQueryDevtools = createRequire(requireFromReactDevtools.resolve("@tanstack/query-devtools"));
const requireFromSolid = createRequire(requireFromQueryDevtools.resolve("solid-js/web"));
const requireFromPlugins = createRequire(requireFromSolid.resolve("seroval-plugins/web"));
const seroval = requireFromSolid("seroval");

// The security resolution overrides Solid's ~1.5.4 range; exercise its actual consumers.
describe("Seroval compatibility through Query Devtools and Solid", () => {
	it("retains Solid's serializer exports and ordinary value round-trips", () => {
		expect(typeof seroval.Serializer).toBe("function");
		expect(typeof seroval.getCrossReferenceHeader).toBe("function");
		expect(typeof seroval.Feature.AggregateError).toBe("number");
		expect(typeof seroval.Feature.BigIntTypedArray).toBe("number");
		const value = { enabled: true, host: "shieldpm.example", counts: new Map([["proxy", 2]]) };
		expect(seroval.deserialize(seroval.serialize(value))).toEqual(value);
		const solidWeb = requireFromQueryDevtools("solid-js/web");
		expect(solidWeb.renderToString(() => "seroval-ready")).toBe("seroval-ready");
	});

	it("shares Seroval with Solid's web plugins and round-trips a URL through JSON", () => {
		expect(requireFromPlugins.resolve("seroval")).toBe(requireFromSolid.resolve("seroval"));
		const { URLPlugin } = requireFromPlugins("seroval-plugins/web");
		const options = { plugins: [URLPlugin] };
		const value = new URL("https://shieldpm.example/status");
		const restored = seroval.fromJSON(seroval.toJSON(value, options), options);
		expect(restored).toBeInstanceOf(URL);
		expect(restored.href).toBe(value.href);
	});
});
