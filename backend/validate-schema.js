#!/usr/bin/env node

import SwaggerParser from "@apidevtools/swagger-parser";
import { getCompiledSchema } from "./schema/index.js";

getCompiledSchema().then(async (swaggerJSON) => {
	try {
		const api = await SwaggerParser.validate(swaggerJSON);
		process.stdout.write(`API name: ${api.info.title}, Version: ${api.info.version}\n`);
		process.stdout.write("❯ Schema is valid\n");
	} catch (e) {
		console.error(e);
		process.stdout.write(`❯ ${e.message}\n\n`);
		process.exit(1);
	}
});
