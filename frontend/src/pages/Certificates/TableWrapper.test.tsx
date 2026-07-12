import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useCertificates: vi.fn(),
}));

vi.mock("src/api/backend", () => ({
	deleteCertificate: vi.fn(),
	downloadCertificate: vi.fn(),
	downloadRootCa: vi.fn(),
}));

vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("src/components/LoadingPage", () => ({
	LoadingPage: () => null,
}));

vi.mock("src/hooks/useCertificates", () => ({
	useCertificates: mocks.useCertificates,
}));

vi.mock("src/notifications", () => ({
	showError: vi.fn(),
	showObjectSuccess: vi.fn(),
}));

vi.mock("./lazy", () => ({
	showCustomCertificateModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showHelpModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
	showInternalCertificateModal: vi.fn(),
	showRenewCertificateModal: vi.fn(),
}));

vi.mock("./Table", () => ({ default: () => null }));

describe("Certificates TableWrapper", () => {
	beforeEach(async () => {
		mocks.useCertificates.mockReturnValue({
			data: [],
			isError: false,
			isFetching: false,
			isLoading: false,
		});
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await changeLocale("en");
	});

	it("gives the help control a localized accessible name", async () => {
		const { default: TableWrapper } = await import("./TableWrapper");

		render(<TableWrapper />);

		const helpButton = screen.getByRole("button", { name: "Hilfe" });
		expect(helpButton).toHaveAttribute("aria-label", "Hilfe");
	});
});
