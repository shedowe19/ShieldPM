#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const parseArguments = (argv) => {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) {
		const argument = argv[index];
		const value = argv[index + 1];
		if (!argument?.startsWith("--") || !value) {
			throw new Error("Usage: check-bundle-budget.cjs --dist <directory> --budget <file>");
		}
		values[argument.slice(2)] = value;
	}
	if (!values.dist || !values.budget) {
		throw new Error("Usage: check-bundle-budget.cjs --dist <directory> --budget <file>");
	}
	return values;
};

const collectAssets = (directory) => {
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...collectAssets(filename));
		else if (entry.isFile()) files.push(filename);
	}
	return files;
};

const gzipSize = (filename) => zlib.gzipSync(fs.readFileSync(filename), { level: zlib.constants.Z_BEST_COMPRESSION }).length;

const measure = (directory) => {
	const assets = collectAssets(directory);
	const javascript = assets.filter((filename) => /\.(?:js|mjs)$/.test(filename));
	const stylesheets = assets.filter((filename) => filename.endsWith(".css"));
	const javascriptSizes = javascript.map(gzipSize);
	return {
		largestJavaScriptBytes: Math.max(0, ...javascriptSizes),
		totalJavaScriptBytes: javascriptSizes.reduce((total, size) => total + size, 0),
		totalStylesheetBytes: stylesheets.map(gzipSize).reduce((total, size) => total + size, 0),
	};
};

const main = () => {
	const { budget: budgetPath, dist } = parseArguments(process.argv.slice(2));
	const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
	const limits = budget.gzip;
	if (!limits || typeof limits !== "object") {
		throw new Error("The bundle budget must define a gzip object.");
	}
	const metrics = measure(dist);
	const failures = Object.entries(metrics).filter(([key, actual]) => {
		const limit = limits[key];
		if (!Number.isSafeInteger(limit) || limit < 0) {
			throw new Error(`The bundle budget for ${key} must be a non-negative integer.`);
		}
		return actual > limit;
	});
	for (const [key, actual] of Object.entries(metrics)) {
		console.log(`${key}=${actual} budget=${limits[key]}`);
	}
	if (failures.length > 0) {
		for (const [key, actual] of failures) {
			console.error(`Bundle budget exceeded: ${key}=${actual} budget=${limits[key]}`);
		}
		process.exitCode = 1;
		return;
	}
	console.log("bundle_budget=PASS");
};

try {
	main();
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
