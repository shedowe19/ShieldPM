// Independently validate a real native UDP capture produced by shieldpm-nginx's
// traffic-flow-http3.mjs. This does not manufacture network measurements.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { LiveFlowBuffer } from "../../backend/lib/traffic-flow-live.js";

const filename = process.argv[2];
assert.ok(filename, "Pass the validated native HTTP/3 UDP capture JSON path");
assert.ok(
	(await fs.stat(filename)).size <= 16 * 1024 * 1024,
	"Capture size is bounded",
);
const rows = JSON.parse(await fs.readFile(filename, "utf8"));
assert.ok(Array.isArray(rows));
const requests = new Map();
for (const row of rows) {
	if (row.protocol !== "HTTP/3.0" || row.supported !== true) continue;
	assert.equal(row.client_sent_semantics, "quic_stream_unique_acked");
	assert.equal(row.client_received_semantics, "quic_stream_consumed");
	const key = `${row.generation}/${row.request_id}`;
	if (!requests.has(key)) requests.set(key, []);
	requests.get(key).push(row);
}
let measured = 0;
let activeDownloads = 0;
let activeUploads = 0;
for (const samples of requests.values()) {
	const buffer = new LiveFlowBuffer();
	let previous;
	for (const row of samples.sort((a, b) => a.monotonic_ms - b.monotonic_ms)) {
		if (
			previous &&
			(row.monotonic_ms <= previous.monotonic_ms ||
				row.time_ms <= previous.time_ms)
		)
			continue;
		buffer.ingest(row, row.time_ms);
		const hosts = [
			{ id: row.host, clients: [], targets: [], truncated: false },
		];
		buffer.apply(hosts, row.time_ms);
		const rate = hosts[0].client_rate;
		if (rate) {
			assert.ok(previous, "A real earlier native baseline is required");
			const elapsed = row.monotonic_ms - previous.monotonic_ms;
			assert.equal(
				rate.download_bytes_per_second,
				((row.client_sent - previous.client_sent) * 1000) / elapsed,
			);
			assert.equal(
				rate.upload_bytes_per_second,
				((row.client_received - previous.client_received) * 1000) / elapsed,
			);
			assert.deepEqual(rate.download_semantics, ["quic_stream_unique_acked"]);
			assert.deepEqual(rate.upload_semantics, ["quic_stream_consumed"]);
			assert.match(hosts[0].clients[0].label, /\/(24|48)$/);
			measured++;
			if (!row.final && rate.download_bytes_per_second > 0) activeDownloads++;
			if (!row.final && rate.upload_bytes_per_second > 0) activeUploads++;
		}
		previous = row;
	}
}
assert.ok(
	activeDownloads > 0,
	"Native acknowledged download progress exists before final",
);
assert.ok(
	activeUploads > 0,
	"Native consumed upload progress exists before final",
);
console.log(
	JSON.stringify({
		result: "PASS",
		native_requests: requests.size,
		exact_intervals: measured,
		active_download_intervals: activeDownloads,
		active_upload_intervals: activeUploads,
		masked: true,
	}),
);
