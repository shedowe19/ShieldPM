import { cleanup, render, screen } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MonitorSummary } from "./MonitorStatus";

describe("Monitor summary", () => {
	beforeEach(async () => changeLocale("de"));
	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("distinguishes an unchecked monitor from a failed TLS verification without marking an outage", () => {
		const initial = { hostId: 7, state: "unknown" as const, checkedAt: null, responseMs: null };
		const { rerender } = render(<MonitorSummary status={initial} loading={false} error={false} />);
		expect(screen.getByText("Wartet auf erste Prüfung")).toBeInTheDocument();

		rerender(
			<MonitorSummary
				status={{
					...initial,
					checkedAt: "2026-09-23T12:00:00Z",
					message: "TLS certificate could not be verified",
				}}
				loading={false}
				error={false}
			/>,
		);
		const badge = screen.getByText("Nicht prüfbar").closest("div");
		expect(badge).toHaveClass("bg-secondary");
		expect(badge).not.toHaveClass("bg-destructive");
		expect(badge?.parentElement).toHaveAttribute(
			"title",
			"TLS-Zertifikat nicht verifizierbar. Unter Host-Überwachung eine CA hinterlegen oder die Zertifikatsprüfung bewusst überspringen.",
		);
	});
});
