import { Field, type FieldProps } from "formik";
import { AccessField, DomainNamesField } from "src/components";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { TabsContent } from "src/components/ui/tabs";
import { intl, T } from "src/locale";
import { PROXY_HOST_TAB } from "src/types/enums";
import ProxyHostForwardingFields from "./ProxyHostForwardingFields";
import ProxyHostIconSettings from "./ProxyHostIconSettings";
import ProxyHostOptions from "./ProxyHostOptions";
import ProxyHostPhpSettings from "./ProxyHostPhpSettings";
import ProxyHostTerminalFields from "./ProxyHostTerminalFields";

const ProxyHostDetailsTab = () => (
	<TabsContent value={PROXY_HOST_TAB.DETAILS} className="mt-0 space-y-4">
		<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
		<ProxyHostForwardingFields />
		<ProxyHostTerminalFields />
		<ProxyHostIconSettings />
		<ProxyHostPhpSettings />
		<div className="row">
			<div className="col-md-12">
				<Field name="bandwidthLimit">
					{({ field, form }: FieldProps) => (
						<div className="mb-3 space-y-2">
							<Label htmlFor="bandwidthLimit">
								<T id="proxy-host.bandwidth-limit" />
							</Label>
							<Input
								id="bandwidthLimit"
								placeholder={intl.formatMessage({ id: "form.placeholder.unlimited" })}
								className={
									form.errors.bandwidthLimit && form.touched.bandwidthLimit
										? "border-destructive"
										: ""
								}
								{...field}
							/>
							{form.errors.bandwidthLimit && form.touched.bandwidthLimit && (
								<p className="text-sm font-medium text-destructive">
									{form.errors.bandwidthLimit as string}
								</p>
							)}
						</div>
					)}
				</Field>
			</div>
			<div className="col-md-12">
				<Field name="forwardQuery">
					{({ field, form }: FieldProps) => (
						<div className="mb-3 space-y-2">
							<Label htmlFor="forwardQuery">
								<T id="proxy-host.forward-query" />
							</Label>
							<Input
								id="forwardQuery"
								placeholder="e.g. api_key=123"
								className={
									form.errors.forwardQuery && form.touched.forwardQuery ? "border-destructive" : ""
								}
								{...field}
							/>
							{form.errors.forwardQuery && form.touched.forwardQuery && (
								<p className="text-sm font-medium text-destructive">
									{form.errors.forwardQuery as string}
								</p>
							)}
						</div>
					)}
				</Field>
			</div>
		</div>
		<AccessField />
		<ProxyHostOptions />
	</TabsContent>
);

export default ProxyHostDetailsTab;
