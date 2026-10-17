import { once } from "node:events";
import Ajv from "ajv/dist/2020.js";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const compile = vi.spyOn(Ajv.prototype, "compile");
const { default: validator } = await import("../../lib/validator/index.js");

let server;
afterEach(async () => {
	if (server) await new Promise((resolve) => server.close(resolve));
	server = undefined;
	compile.mockClear();
});

describe("bounded route schema compilation", () => {
	it("reuses fresh equivalent schemas across actual HTTP requests and preserves coercion", async () => {
		const app = express();
		app.get("/:id", async (req, res) => {
			res.json(
				await validator(
					{
						type: "object",
						required: ["id"],
						additionalProperties: false,
						properties: { id: { $ref: "common#/properties/id" } },
					},
					{ id: req.params.id },
				),
			);
		});
		server = app.listen(0, "127.0.0.1");
		await once(server, "listening");
		const url = `http://127.0.0.1:${server.address().port}`;
		for (let index = 0; index < 100; index++) {
			const response = await fetch(`${url}/7`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ id: 7 });
		}
		expect(compile).toHaveBeenCalledTimes(1);
	});

	it("evicts both application and AJV entries rather than retaining every schema", async () => {
		for (let index = 0; index < 170; index++) {
			await validator({ type: "object", title: `bounded-${index}` }, {});
		}
		const instance = compile.mock.contexts[0];
		// AJV includes its built-in metaschemas and the common definitions.
		expect(instance._cache.size).toBeLessThan(145);
		await expect(validator({ type: "object", title: "bounded-0" }, {})).resolves.toEqual({});
		expect(compile).toHaveBeenCalledTimes(171);
	});

	it("does not reuse old code when a schema object changes and returns a detached payload", async () => {
		const schema = { type: "object", properties: { name: { type: "string", minLength: 1 } } };
		const payload = { name: "ab" };
		expect(await validator(schema, payload)).not.toBe(payload);
		schema.properties.name.minLength = 3;
		await expect(validator(schema, payload)).rejects.toThrow("must NOT have fewer than 3 characters");
	});
});
