import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FlowRateComponents, flowLineWidth, rateDescription } from "./TrafficFlowRate";

describe("traffic flow common rate scale", () => {
	afterEach(cleanup);
	it("maps equal rates equally and caps the documented scale", () => {
		expect(flowLineWidth(0)).toBe(2);
		expect(flowLineWidth(null)).toBe(2);
		expect(flowLineWidth(1024)).toBe(3);
		expect(flowLineWidth(65536)).toBeGreaterThan(flowLineWidth(1024));
		expect(flowLineWidth(16777216)).toBe(16);
		expect(flowLineWidth(1e12)).toBe(16);
	});
	it("keeps exact measured decimals and both interval bounds separate from smoothing", () => {
		const details = rateDescription({
			uploadBytesPerSecond: 123.456,
			downloadBytesPerSecond: 0,
			bytesPerSecond: 123.456,
			smoothedBytesPerSecond: 999,
			windowStart: "start",
			windowEnd: "end",
			samples: 2,
		});
		expect(details).toContain("Upload: 123.456 B/s");
		expect(details).toContain("Download: 0 B/s");
		expect(details).toContain("Smoothed display: 999 B/s");
		expect(details).toContain("start to end");
		expect(rateDescription(null, true)).toContain("incomplete");
	});
	it("labels HTTP/3 acknowledged bytes separately from consumed bytes and mixed groups", () => {
		const details = rateDescription({
			uploadBytesPerSecond: 1,
			downloadBytesPerSecond: 2,
			bytesPerSecond: 3,
			smoothedBytesPerSecond: 3,
			windowStart: "start",
			windowEnd: "end",
			samples: 1,
			uploadSemantics: ["quic_stream_consumed"],
			downloadSemantics: ["quic_stream_unique_acked"],
		});
		expect(details).toContain("acknowledged by the peer");
		expect(details).toContain("consumed QUIC stream bytes");
		expect(rateDescription(null, true, true)).toContain("incompatible byte accounting");
	});
	it("expands measured accounting components with distinct exact quality descriptions", () => {
		const base = {
			uploadBytesPerSecond: 1,
			downloadBytesPerSecond: 2,
			bytesPerSecond: 3,
			smoothedBytesPerSecond: 3,
			windowStart: "start",
			windowEnd: "end",
			samples: 1,
		};
		render(
			<FlowRateComponents
				components={[
					{
						...base,
						id: "http_request_received:http_transport_accepted",
						uploadSemantics: ["http_request_received"],
						downloadSemantics: ["http_transport_accepted"],
					},
					{
						...base,
						id: "quic_stream_consumed:quic_stream_unique_acked",
						uploadSemantics: ["quic_stream_consumed"],
						downloadSemantics: ["quic_stream_unique_acked"],
					},
				]}
			/>,
		);
		fireEvent.click(screen.getByText("Measured groups by byte accounting"));
		expect(screen.getByTitle(/HTTP bytes accepted by Nginx transport/)).toBeVisible();
		expect(screen.getByTitle(/acknowledged by the peer/)).toBeVisible();
	});
});
