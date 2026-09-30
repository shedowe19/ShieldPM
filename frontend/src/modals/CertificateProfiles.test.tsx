import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { PropsWithChildren } from "react";
import { CertificateProfileField } from "src/components/Form/CertificateProfileField";
import { SSLOptionsFields } from "src/components/Form/SSLOptionsFields";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ show: vi.fn(), createCertificate: vi.fn() }));
const defaultProfile = vi.hoisted(() => ({
	data: { profile: "standard" } as { profile: "standard" | "shortlived" } | undefined,
	isPending: false,
	isFetching: false,
	error: null as Error | null,
}));

vi.mock("src/hooks/useAcmeProfile", () => ({ useAcmeProfile: () => defaultProfile }));

vi.mock("ez-modal-react", () => ({
	default: { create: <T,>(Component: T) => Component, show: mocks.show },
}));
vi.mock("src/api/backend", () => ({ createCertificate: mocks.createCertificate, testHttpCertificate: vi.fn() }));
vi.mock("src/components", () => ({
	DomainNamesField: () => {
		const { setFieldValue } = useFormikContext();
		return (
			<button type="button" onClick={() => setFieldValue("domainNames", ["example.test"])}>
				Add domain
			</button>
		);
	},
	DNSProviderFields: () => {
		const { setFieldValue } = useFormikContext();
		return (
			<button
				type="button"
				onClick={() => {
					setFieldValue("meta.dnsProvider", "cloudflare");
					setFieldValue("meta.dnsProviderCredentials", "synthetic-test-token");
				}}
			>
				Set DNS credentials
			</button>
		);
	},
}));
vi.mock("src/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
	}: PropsWithChildren<{ value: string; onValueChange: (value: string) => void; disabled?: boolean }>) => (
		<select
			aria-label="Certificate profile"
			value={value}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			<option value="">Use global default</option>
			<option value="standard">Standard</option>
			<option value="shortlived">Short-lived</option>
		</select>
	),
	SelectContent: () => null,
	SelectItem: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));

const FormState = () => {
	const { values } = useFormikContext();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

beforeEach(() => {
	defaultProfile.data = { profile: "standard" };
	defaultProfile.isPending = false;
	defaultProfile.isFetching = false;
	defaultProfile.error = null;
});

describe("certificate profiles", () => {
	it("defaults to standard without discarding other certificate metadata", async () => {
		render(
			<Formik initialValues={{ meta: { dnsChallenge: true } }} onSubmit={vi.fn()}>
				<Form>
					<CertificateProfileField />
					<FormState />
				</Form>
			</Formik>,
		);
		await waitFor(() => {
			expect(JSON.parse(screen.getByTestId("form-state").textContent || "{}").meta).toEqual({
				dnsChallenge: true,
				letsencryptProfile: "standard",
			});
		});
		expect(screen.getByRole("combobox")).toHaveValue("standard");
		expect(screen.getByText("certificates.profile.standard-description")).toBeInTheDocument();
	});

	it("applies the loaded global short-lived default while preserving other metadata", async () => {
		defaultProfile.data = { profile: "shortlived" };
		render(
			<Formik initialValues={{ meta: { dnsChallenge: true } }} onSubmit={vi.fn()}>
				<Form>
					<CertificateProfileField />
					<FormState />
				</Form>
			</Formik>,
		);
		await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("shortlived"));
		expect(JSON.parse(screen.getByTestId("form-state").textContent || "{}").meta).toEqual({
			dnsChallenge: true,
			letsencryptProfile: "shortlived",
		});
	});

	it("does not replace a user choice when the global default arrives later", async () => {
		defaultProfile.data = undefined;
		defaultProfile.isPending = true;
		defaultProfile.isFetching = true;
		const form = () => (
			<Formik initialValues={{ meta: {} }} onSubmit={vi.fn()}>
				<Form>
					<CertificateProfileField />
					<FormState />
				</Form>
			</Formik>
		);
		const { rerender } = render(form());
		expect(screen.getByRole("combobox")).toHaveValue("");
		expect(screen.getByText("certificates.profile.default-loading")).toBeInTheDocument();
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "standard" } });
		defaultProfile.data = { profile: "shortlived" };
		defaultProfile.isPending = false;
		defaultProfile.isFetching = false;
		rerender(form());
		await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("standard"));
		expect(JSON.parse(screen.getByTestId("form-state").textContent || "{}").meta.letsencryptProfile).toBe(
			"standard",
		);
	});

	it.each(["pending", "failed"])(
		"leaves the profile unset during a %s default lookup so the server resolves it",
		async (state) => {
			defaultProfile.data = undefined;
			defaultProfile.isPending = state === "pending";
			defaultProfile.isFetching = state === "pending";
			defaultProfile.error = state === "failed" ? new Error("Unavailable") : null;
			const submit = vi.fn();
			render(
				<Formik initialValues={{ meta: {} }} onSubmit={submit}>
					<Form>
						<CertificateProfileField />
						<button type="submit">Issue certificate</button>
					</Form>
				</Formik>,
			);
			if (state === "failed") {
				expect(screen.getByRole("alert")).toHaveTextContent("certificates.profile.default-error");
			}
			fireEvent.click(screen.getByRole("button", { name: "Issue certificate" }));
			await waitFor(() => expect(submit).toHaveBeenCalledOnce());
			expect(submit.mock.calls[0][0]).toEqual({ meta: {} });
		},
	);

	it("keeps an explicit per-certificate profile when the global default differs", () => {
		defaultProfile.data = { profile: "shortlived" };
		render(
			<Formik initialValues={{ meta: { letsencryptProfile: "standard" } }} onSubmit={vi.fn()}>
				<Form>
					<CertificateProfileField />
				</Form>
			</Formik>,
		);
		expect(screen.getByRole("combobox")).toHaveValue("standard");
	});

	it("does not copy a stale cached default into a new certificate after its refresh fails", () => {
		defaultProfile.data = { profile: "standard" };
		defaultProfile.error = new Error("Refresh failed");
		render(
			<Formik initialValues={{ meta: {} }} onSubmit={vi.fn()}>
				<Form>
					<CertificateProfileField />
					<FormState />
				</Form>
			</Formik>,
		);
		expect(screen.getByRole("combobox")).toHaveValue("");
		expect(JSON.parse(screen.getByTestId("form-state").textContent || "{}").meta).toEqual({});
		expect(screen.getByRole("alert")).toHaveTextContent("certificates.profile.default-error");
	});

	it.each(["HTTP", "DNS"])("submits a selected short-lived profile for standalone %s issuance", async (challenge) => {
		const remove = vi.fn();
		mocks.createCertificate.mockResolvedValue({ id: 1 });
		if (challenge === "HTTP") {
			const { showHTTPCertificateModal } = await import("./HTTPCertificateModal");
			showHTTPCertificateModal();
		} else {
			const { showDNSCertificateModal } = await import("./DNSCertificateModal");
			showDNSCertificateModal();
		}
		const Modal = mocks.show.mock.calls[0][0];
		render(
			<QueryClientProvider client={new QueryClient()}>
				<Modal visible remove={remove} />
			</QueryClientProvider>,
		);

		expect(screen.getByRole("combobox")).toHaveValue("standard");
		fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "shortlived" } });
		if (challenge === "DNS") {
			fireEvent.click(screen.getByRole("button", { name: "Set DNS credentials" }));
		}
		expect(screen.getByText("certificates.profile.shortlived-description")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		await waitFor(() => expect(mocks.createCertificate).toHaveBeenCalledOnce());
		expect(mocks.createCertificate.mock.calls[0][0]).toMatchObject({
			provider: "letsencrypt",
			domainNames: ["example.test"],
			meta: {
				letsencryptProfile: "shortlived",
				...(challenge === "DNS"
					? { dnsChallenge: true, dnsProvider: "cloudflare", dnsProviderCredentials: "synthetic-test-token" }
					: {}),
			},
		});
		expect(remove).toHaveBeenCalledOnce();
	});

	it.each(["HTTP", "DNS"])("uses the global short-lived default for standalone %s issuance", async (challenge) => {
		defaultProfile.data = { profile: "shortlived" };
		mocks.createCertificate.mockResolvedValue({ id: 1 });
		if (challenge === "HTTP") {
			const { showHTTPCertificateModal } = await import("./HTTPCertificateModal");
			showHTTPCertificateModal();
		} else {
			const { showDNSCertificateModal } = await import("./DNSCertificateModal");
			showDNSCertificateModal();
		}
		const Modal = mocks.show.mock.calls[0][0];
		render(
			<QueryClientProvider client={new QueryClient()}>
				<Modal visible remove={vi.fn()} />
			</QueryClientProvider>,
		);
		await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("shortlived"));
		fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
		if (challenge === "DNS") {
			fireEvent.click(screen.getByRole("button", { name: "Set DNS credentials" }));
		}
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.createCertificate).toHaveBeenCalledOnce());
		expect(mocks.createCertificate.mock.calls[0][0].meta.letsencryptProfile).toBe("shortlived");
	});

	it("preserves the profile when switching inline host issuance between HTTP and DNS challenges", async () => {
		const submit = vi.fn();
		render(
			<Formik initialValues={{ certificateId: "new", meta: {} }} onSubmit={submit}>
				<Form>
					<SSLOptionsFields />
					<button type="submit">Issue certificate</button>
				</Form>
			</Formik>,
		);
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "shortlived" } });
		fireEvent.click(screen.getByRole("switch", { name: "domains.use-dns" }));
		fireEvent.click(screen.getByRole("button", { name: "Set DNS credentials" }));
		fireEvent.click(screen.getByRole("switch", { name: "domains.use-dns" }));
		fireEvent.click(screen.getByRole("button", { name: "Issue certificate" }));

		await waitFor(() => expect(submit).toHaveBeenCalledOnce());
		expect(submit.mock.calls[0][0]).toEqual({
			certificateId: "new",
			meta: {
				letsencryptProfile: "shortlived",
				dnsChallenge: false,
				dnsProvider: undefined,
				dnsProviderCredentials: undefined,
				propagationSeconds: undefined,
			},
		});
	});

	it.each([0, 42])("does not offer a profile switch for the existing certificate selection %s", (certificateId) => {
		render(
			<Formik initialValues={{ certificateId, meta: {} }} onSubmit={vi.fn()}>
				<Form>
					<SSLOptionsFields />
				</Form>
			</Formik>,
		);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});
});
