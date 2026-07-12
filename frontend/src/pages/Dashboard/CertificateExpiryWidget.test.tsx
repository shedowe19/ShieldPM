import { cleanup, render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateExpiryWidget } from "./CertificateExpiryWidget";

interface MockCertificate {
	domainNames: string[];
	expiresOn: string;
	id: number;
	niceName: string;
}

const mocks = vi.hoisted(() => ({
	certificates: [] as MockCertificate[],
}));

vi.mock("src/hooks/useCertificates", () => ({
	useCertificates: () => ({ data: mocks.certificates }),
}));

const mockCertificates: MockCertificate[] = [
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

vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("CertificateExpiryWidget", () => {
	beforeEach(() => {
		mocks.certificates = mockCertificates;
	});

	afterEach(() => {
		cleanup();
	});

	it("renders expiring and expired certificates", () => {
		render(
			<MemoryRouter>
				<CertificateExpiryWidget />
			</MemoryRouter>,
		);

		// Check title
		expect(screen.getByText("Certificates Expiring Soon")).toBeInTheDocument();

		// Check expiring certificate
		expect(screen.getByText("Expiring Soon")).toBeInTheDocument();
		expect(screen.getByText(/Days Left/)).toBeInTheDocument();

		// Check expired certificate
		expect(screen.getByText("Expired Cert")).toBeInTheDocument();
		expect(screen.getByText("Expired")).toBeInTheDocument();

		// Check that valid certificate is NOT displayed
		expect(screen.queryByText("Valid Long Term")).not.toBeInTheDocument();

		// Check link to certificates page
		const links = screen.getAllByRole("link");
		expect(links.length).toBeGreaterThan(0);
		expect(links[0]).toHaveAttribute("href", "/certificates");
	});

	it("renders empty state when no certificates are expiring", () => {
		mocks.certificates = [
			{
				id: 3,
				niceName: "Valid Long Term",
				domainNames: ["valid.com"],
				expiresOn: dayjs().add(60, "day").toISOString(),
			},
		];

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
