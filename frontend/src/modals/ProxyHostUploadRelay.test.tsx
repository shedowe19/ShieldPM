import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Form, Formik, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostUploadRelay from "./ProxyHostUploadRelay";

vi.mock("src/components/ui/alert", () => ({
	Alert: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertDescription: ({ children }: PropsWithChildren) => <div>{children}</div>,
	AlertTitle: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("src/components/ui/input", () => ({
	Input: (props: ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("src/components/ui/label", () => ({
	Label: ({ children, htmlFor }: PropsWithChildren<ComponentProps<"label">>) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));
vi.mock("src/components/ui/switch", () => ({
	Switch: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<button
			aria-checked={checked}
			aria-label={id}
			onClick={() => onCheckedChange?.(!checked)}
			role="switch"
			type="button"
		/>
	),
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => <>{id}</> }));

const FormState = () => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="form-state">{JSON.stringify(values)}</output>;
};

const formState = () => JSON.parse(screen.getByTestId("form-state").textContent || "{}") as ProxyHostFormValues;

describe("ProxyHostUploadRelay", () => {
	afterEach(cleanup);

	it("defaults to an 80 MiB resumable endpoint and uses the original request target after opt-in", () => {
		render(
			<Formik
				initialValues={{
					uploadRelayChunkSize: 80 * 1024 * 1024,
					uploadRelayCleanupHours: 24,
					uploadRelayEnabled: false,
					uploadRelayMaxFileSize: 10 * 1024 * 1024 * 1024,
					uploadRelayMaxPendingBytes: 20 * 1024 * 1024 * 1024,
					uploadRelayPath: "/_shieldpm-upload",
					uploadRelayTargetPath: "/api/import",
				}}
				onSubmit={vi.fn()}
			>
				<Form>
					<ProxyHostUploadRelay />
					<FormState />
				</Form>
			</Formik>,
		);

		expect(screen.getByText("proxy-host.upload-relay.title")).toBeInTheDocument();
		expect(screen.getByRole("switch", { name: "uploadRelayEnabled" })).toHaveAttribute("aria-checked", "false");
		expect(screen.queryByLabelText("proxy-host.upload-relay.target-path")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("switch", { name: "uploadRelayEnabled" }));

		expect(screen.getByLabelText("proxy-host.upload-relay.path")).toHaveValue("/_shieldpm-upload");
		expect(screen.queryByLabelText("proxy-host.upload-relay.target-path")).not.toBeInTheDocument();
		expect(screen.getByLabelText("proxy-host.upload-relay.chunk-size")).toHaveValue(80 * 1024 * 1024);
		expect(screen.queryByLabelText("proxy-host.upload-relay.max-file-size")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("proxy-host.upload-relay.max-pending-bytes")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("proxy-host.upload-relay.cleanup-hours")).not.toBeInTheDocument();
		expect(formState()).toMatchObject({ uploadRelayEnabled: true });
	});
});
