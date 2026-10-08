import { basename, dirname } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { Client } from "basic-ftp";
import errs from "./error.js";

/**
 * Load an FTP PAC file using get-uri's cache/stream contract.
 * Keep basic-ftp's default transfer-host protection and own the stream lifecycle:
 * the library ends its destination even when the final FTP response is an error.
 * @param {URL} url
 * @param {import("get-uri").ProtocolsOptions["ftp"]} [options]
 * @returns {Promise<PassThrough & { lastModified?: Date }>}
 */
export const getFtpUri = async (url, options = {}) => {
	const { cache, ...accessOptions } = options;
	const filepath = decodeURIComponent(url.pathname);
	if (!filepath) throw new errs.ValidationError("No FTP pathname");
	const client = new Client();
	let lastModified;

	try {
		await client.access({
			host: url.hostname,
			port: Number.parseInt(url.port, 10) || 21,
			user: url.username ? decodeURIComponent(url.username) : undefined,
			password: url.password ? decodeURIComponent(url.password) : undefined,
			...accessOptions,
		});
		try {
			lastModified = await client.lastMod(filepath);
		} catch (error) {
			if (error.code === 550) {
				throw Object.assign(new errs.ItemNotFoundError(undefined, error), { code: "ENOTFOUND" });
			}
		}
		if (!lastModified) {
			const entries = await client.list(dirname(filepath));
			lastModified = entries.find((entry) => entry.name === basename(filepath))?.modifiedAt;
		}
		if (!lastModified) {
			throw Object.assign(new errs.ItemNotFoundError(), { code: "ENOTFOUND" });
		}
		if (cache?.lastModified && +cache.lastModified === +lastModified) {
			throw Object.assign(new errs.CacheError("FTP file has not changed"), { code: "ENOTMODIFIED" });
		}
	} catch (error) {
		client.close();
		throw error;
	}

	/** @type {PassThrough & { lastModified?: Date }} */
	const stream = new PassThrough();
	stream.lastModified = lastModified;
	const destination = new Writable({
		write(chunk, encoding, callback) {
			stream.write(chunk, encoding, callback);
		},
	});
	// Retain this listener after basic-ftp removes its own destination listener.
	destination.on("error", (error) => stream.destroy(error));
	stream.once("close", () => {
		client.close();
		destination.destroy();
	});

	const transfer = async () => {
		try {
			await client.downloadTo(destination, filepath);
			if (!stream.destroyed) stream.end();
		} catch (error) {
			stream.destroy(error);
		} finally {
			client.close();
			destination.destroy();
		}
	};
	// Return the stream before a fast transfer failure can emit its error event.
	setImmediate(() => {
		if (!stream.destroyed) void transfer();
	});
	return stream;
};
