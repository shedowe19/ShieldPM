import { cleanup, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateExpiryWidget } from "./CertificateExpiryWidget";

const { mockCertificatesData } = vi.hoisted(() => ({
	mockCertificatesData: vi.fn(),
}));

// Mock dependencies
const mockCertificates = [
	{
		id: 1,
		niceName: "Expiring Soon",
		domainNames: ["expiring.com"],
		expiresOn: dayjs().add(5, "day").toISOString(),
	},
	{
		id: 2,
		niceName: "Expired Cert",
		domainNames: ["expired.com"],
		expiresOn: dayjs().subtract(1, "day").toISOString(),
	},
	{
		id: 3,
		niceName: "Valid Long Term",
		domainNames: ["valid.com"],
		expiresOn: dayjs().add(60, "day").toISOString(),
	},
];

// Mock T component from src/locale
vi.mock("src/locale", () => ({
	T: ({ id, data }: { id: string; data?: { days?: number | string } }) => {
		if (id === "dashboard.certificates-expiring") return "Certificates Expiring Soon";
		if (id === "dashboard.expired") return "Expired";
		if (id === "dashboard.days-left") return `${data?.days} Days Left`;
		if (id === "dashboard.no-expiring-certificates") return "No certificates expiring soon";
		return id;
	},
}));

vi.mock("src/components", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("src/hooks", () => ({
	useCertificates: () => ({ data: mockCertificatesData() }),
}));

describe("CertificateExpiryWidget", () => {
	beforeEach(() => {
		mockCertificatesData.mockReturnValue(mockCertificates);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders expiring and expired certificates", () => {
		render(
			<MemoryRouter>
				<CertificateExpiryWidget />
			</MemoryRouter>,
		);

		expect(screen.getByText("Certificates Expiring Soon")).toBeInTheDocument();
		expect(screen.getByText("Expiring Soon")).toBeInTheDocument();
		expect(screen.getByText(/Days Left/)).toBeInTheDocument();
		expect(screen.getByText("Expired Cert")).toBeInTheDocument();
		expect(screen.getByText("Expired")).toBeInTheDocument();
		expect(screen.queryByText("Valid Long Term")).not.toBeInTheDocument();

		const links = screen.getAllByRole("link");
		expect(links.length).toBeGreaterThan(0);
		expect(links[0]).toHaveAttribute("href", "/certificates");
	});

	it("renders empty state when no certificates are expiring", () => {
		mockCertificatesData.mockReturnValue([
			{
				id: 3,
				niceName: "Valid Long Term",
				domainNames: ["valid.com"],
				expiresOn: dayjs().add(60, "day").toISOString(),
			},
		]);

		render(
			<MemoryRouter>
				<CertificateExpiryWidget />
			</MemoryRouter>,
		);

		expect(screen.getByText("Certificates Expiring Soon")).toBeInTheDocument();
		expect(screen.getByText("No certificates expiring soon")).toBeInTheDocument();
		expect(screen.queryByText("Valid Long Term")).not.toBeInTheDocument();
	});
});
