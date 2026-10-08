import { EventEmitter, once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function listen(server, host = "127.0.0.1") {
	server.listen(0, host);
	await once(server, "listening");
	return server.address().port;
}

export async function readText(stream) {
	let value = "";
	for await (const chunk of stream) value += chunk.toString();
	return value;
}

/** Real, local-only FTP control/data endpoints; each fixture serves one client at a time. */
export async function startLocalFtp(options = {}) {
	const state = {
		body: 'function FindProxyForURL() { return "DIRECT"; }\n',
		modified: "20261005010203",
		mdtmCode: 213,
		listing: "mlsd",
		transferCode: 0,
		finalTransferCode: 226,
		stallTransfer: false,
		...options,
	};
	const commands = [];
	const controlSockets = new Set();
	const dataSockets = new Set();
	const dataEvents = new EventEmitter();
	let dataSocket;
	let dataConnections = 0;
	const track = (socket, collection) => {
		collection.add(socket);
		socket.on("close", () => collection.delete(socket));
		socket.on("error", () => {});
	};
	const dataServer = createServer((socket) => {
		track(socket, dataSockets);
		dataSocket = socket;
		dataConnections += 1;
		dataEvents.emit("connected", socket);
	});
	const dataPort = await listen(dataServer, state.dataHost || "127.0.0.1");
	const controlServer = createServer((socket) => {
		track(socket, controlSockets);
		socket.setEncoding("utf8");
		const reply = (text) => {
			if (!socket.destroyed) socket.write(`${text}\r\n`);
		};
		reply("220 Local FTP fixture");
		const transfer = async (body) => {
			if (state.transferCode) {
				reply(`${state.transferCode} Fixture transfer rejected`);
				dataSocket?.destroy();
				return;
			}
			if (!dataSocket || dataSocket.destroyed) {
				[dataSocket] = await once(dataEvents, "connected", { signal: AbortSignal.timeout(1_000) });
			}
			reply("150 Opening data connection");
			if (state.stallTransfer) {
				dataSocket.write(body);
				return;
			}
			await new Promise((resolve) => dataSocket.end(body, resolve));
			reply(`${state.finalTransferCode} Transfer complete`);
		};
		const listing = () => {
			if (state.listing === "mlsd-malformed") return `${"=".repeat(65_536)}\r\n`;
			if (state.listing === "unix-malformed") {
				return `-rw-r--r-- 1 ${"a ".repeat(32_768)}!\r\n-rw-r--r-- 1 owner group 42 Oct 5 2026 fixture file.pac\r\n`;
			}
			return `type=file;size=${Buffer.byteLength(state.body)};modify=${state.modified}; fixture file.pac\r\n`;
		};
		const handle = async (line) => {
			commands.push(line);
			const command = line.split(" ", 1)[0];
			switch (command) {
				case "USER":
					reply("331 Password required");
					break;
				case "PASS":
					reply("230 Logged in");
					break;
				case "FEAT":
					reply("211-Features\r\n MLST type*;size*;modify*;\r\n211 End");
					break;
				case "MDTM":
					reply(state.mdtmCode === 213 ? `213 ${state.modified}` : `${state.mdtmCode} No MDTM metadata`);
					break;
				case "EPSV":
					reply("500 EPSV unavailable");
					break;
				case "PASV": {
					const host = state.pasvHost || state.dataHost || "127.0.0.1";
					reply(
						state.pasvMalformed
							? `227 ${"1".repeat(60_000)}`
							: `227 Passive (${host.replaceAll(".", ",")},${dataPort >> 8},${dataPort & 255})`,
					);
					break;
				}
				case "MLSD":
				case "LIST":
					await transfer(listing());
					break;
				case "RETR":
					await transfer(state.body);
					break;
				case "QUIT":
					socket.end("221 Bye\r\n");
					break;
				default:
					reply("200 OK");
			}
		};
		let pending = "";
		let queue = Promise.resolve();
		socket.on("data", (chunk) => {
			pending += chunk;
			let boundary = pending.indexOf("\r\n");
			while (boundary !== -1) {
				const line = pending.slice(0, boundary);
				pending = pending.slice(boundary + 2);
				queue = queue.then(() => handle(line)).catch(() => socket.destroy());
				boundary = pending.indexOf("\r\n");
			}
		});
	});
	const controlPort = await listen(controlServer);
	return {
		state,
		commands,
		url: `ftp://fixture%20user:fixture%20password@127.0.0.1:${controlPort}/folder/fixture%20file.pac`,
		get dataConnections() {
			return dataConnections;
		},
		async waitForClosed() {
			const deadline = Date.now() + 2_000;
			while (controlSockets.size || dataSockets.size) {
				if (Date.now() >= deadline) throw new Error("FTP fixture connections remained open");
				await delay(10);
			}
		},
		async close() {
			for (const socket of [...controlSockets, ...dataSockets]) socket.destroy();
			await Promise.all(
				[controlServer, dataServer].map((server) => new Promise((resolve) => server.close(resolve))),
			);
		},
	};
}
