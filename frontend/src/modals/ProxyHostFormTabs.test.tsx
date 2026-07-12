import { cleanup, render, screen } from "@testing-library/react";
import { Formik } from "formik";
import type { ProxyLocation } from "src/api/backend";
import { FORWARD_SCHEME } from "src/types/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProxyHostFormTabs from "./ProxyHostFormTabs";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

const mocks = vi.hoisted(() => ({
	gitSyncTab: vi.fn(),
	locationsFields: vi.fn(),
}));

vi.mock("src/components", () => ({
	GitSyncTab: (props: unknown) => {
		mocks.gitSyncTab(props);
		return <div data-testid="git-sync-tab" />;
	},
}));

vi.mock("src/components/Form/LocationsFields", () => ({
	LocationsFields: (props: unknown) => {
		mocks.locationsFields(props);
		return <div data-testid="locations-fields" />;
	},
}));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("./ProxyHostAdvancedTab", () => ({ default: () => <div data-testid="advanced-tab" /> }));
vi.mock("./ProxyHostDetailsTab", () => ({ default: () => <div data-testid="details-tab" /> }));
vi.mock("./ProxyHostMaintenanceTab", () => ({ default: () => <div data-testid="maintenance-tab" /> }));
vi.mock("./ProxyHostNotesTab", () => ({ default: () => <div data-testid="notes-tab" /> }));
vi.mock("./ProxyHostSecurityTab", () => ({ default: () => <div data-testid="security-tab" /> }));
vi.mock("./ProxyHostSslTab", () => ({ default: () => <div data-testid="ssl-tab" /> }));

const locations = [{ path: "/api" }] as ProxyLocation[];

const renderTabs = (forwardScheme: ProxyHostFormValues["forwardScheme"]) =>
	render(
		<Formik<ProxyHostFormValues> initialValues={{ forwardScheme }} onSubmit={() => undefined}>
			<ProxyHostFormTabs hostId={42} locations={locations} />
		</Formik>,
	);

describe("ProxyHostFormTabs", () => {
	afterEach(cleanup);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps the Git sync tab available for path-backed Proxy Hosts", () => {
		renderTabs(FORWARD_SCHEME.PATH);

		expect(screen.getByText("column.details")).toBeInTheDocument();
		expect(screen.getByTestId("details-tab")).toBeInTheDocument();
		expect(screen.getByTestId("locations-fields")).toBeInTheDocument();
		expect(screen.getByTestId("ssl-tab")).toBeInTheDocument();
		expect(screen.getByTestId("security-tab")).toBeInTheDocument();
		expect(screen.getByTestId("advanced-tab")).toBeInTheDocument();
		expect(screen.getByTestId("maintenance-tab")).toBeInTheDocument();
		expect(screen.getByTestId("notes-tab")).toBeInTheDocument();
		expect(screen.getByTestId("git-sync-tab")).toBeInTheDocument();
		expect(mocks.locationsFields.mock.calls[0]?.[0]).toMatchObject({ initialValues: locations });
		expect(mocks.gitSyncTab.mock.calls[0]?.[0]).toMatchObject({ hostId: 42 });
	});

	it("hides the Git sync tab for non-path Proxy Hosts", () => {
		renderTabs(FORWARD_SCHEME.HTTP);

		expect(screen.queryByTestId("git-sync-tab")).not.toBeInTheDocument();
		expect(mocks.gitSyncTab).not.toHaveBeenCalled();
	});
});
