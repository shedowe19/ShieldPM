import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels: Record<string, string> = {
	"user.security": "Sicherheit",
	advanced: "Erweitert",
	"proxy-host.maintenance-mode": "Wartung",
	"host.note": "Notizen",
	"proxy-host.git-sync": "Git-Synchronisierung",
};
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => labels[id] || id,
	intl: { formatMessage: ({ id }: { id: string }) => labels[id] || id },
}));
vi.mock("src/components", () => ({ GitSyncTab: () => null }));
vi.mock("src/components/Form/LocationsFields", () => ({ LocationsFields: () => null }));
vi.mock("./ProxyHostAdvancedTab", () => ({ default: () => null }));
vi.mock("./ProxyHostDetailsTab", () => ({ default: () => null }));
vi.mock("./ProxyHostMaintenanceTab", () => ({ default: () => null }));
vi.mock("./ProxyHostNotesTab", () => ({ default: () => null }));
vi.mock("./ProxyHostSecurityTab", () => ({ default: () => null }));
vi.mock("./ProxyHostSslTab", () => ({ default: () => null }));
vi.mock("./ProxyHostUpstreamPoolTab", () => ({ default: () => null }));
vi.mock("./ProxyHostCacheTab", () => ({ default: () => null }));
vi.mock("./ProxyHostWasmTab", () => ({ default: () => null }));

import ProxyHostFormTabs from "./ProxyHostFormTabs";

afterEach(cleanup);
describe("real Radix host navigation", () => {
	it.each(["http", "path"])("gives every %s host tab a visible or localized accessible name", (forwardScheme) => {
		render(
			<Formik initialValues={{ forwardScheme }} onSubmit={() => {}}>
				<ProxyHostFormTabs hostId={null} locations={[]} />
			</Formik>,
		);
		for (const name of ["Sicherheit", "Erweitert", "Wartung", "Notizen"])
			expect(screen.getByRole("tab", { name })).toBeInTheDocument();
		if (forwardScheme === "path")
			expect(screen.getByRole("tab", { name: "Git-Synchronisierung" })).toBeInTheDocument();
		else expect(screen.queryByRole("tab", { name: "Git-Synchronisierung" })).not.toBeInTheDocument();
		for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveAccessibleName();
		const security = screen.getByRole("tab", { name: "Sicherheit" });
		fireEvent.mouseDown(security, { button: 0, ctrlKey: false });
		expect(security).toHaveAttribute("aria-selected", "true");
	});
});
