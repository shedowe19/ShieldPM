import { Field, useFormikContext } from "formik";
import type { ReactNode } from "react";
import type { ActionMeta, MultiValue } from "react-select";
import CreatableSelect from "react-select/creatable";
import { Label } from "src/components/ui/label";
import { intl, T } from "src/locale";
import { validateDomain, validateDomains } from "src/modules/Validations";

type SelectOption = {
	label: string;
	value: string;
	color?: string;
};

interface Props {
	id?: string;
	maxDomains?: number;
	isWildcardPermitted?: boolean;
	dnsProviderWildcardSupported?: boolean;
	name?: string;
	label?: string;
	onChange?: (domains: string[]) => void;
}
export function DomainNamesField({
	name = "domainNames",
	label = "domain-names",
	id = "domainNames",
	maxDomains,
	isWildcardPermitted = false,
	dnsProviderWildcardSupported = false,
	onChange,
}: Props) {
	const { setFieldValue } = useFormikContext();

	const handleChange = (v: MultiValue<SelectOption>, _actionMeta: ActionMeta<SelectOption>) => {
		const doms = v?.map((i: SelectOption) => {
			return i.value;
		});
		setFieldValue(name, doms);
		onChange?.(doms);
	};

	const helperTexts: ReactNode[] = [];
	if (maxDomains) {
		helperTexts.push(<T id="domain-names.max" data={{ count: maxDomains }} />);
	}
	if (!isWildcardPermitted) {
		helperTexts.push(<T id="domain-names.wildcards-not-permitted" />);
	} else if (!dnsProviderWildcardSupported) {
		helperTexts.push(<T id="domain-names.wildcards-not-supported" />);
	}

	return (
		<Field name={name} validate={validateDomains(isWildcardPermitted && dnsProviderWildcardSupported, maxDomains)}>
			{({ field, form }: any) => (
				<div className="space-y-2 mb-3">
					<Label htmlFor={id}>
						<T id={label} />
					</Label>
					<CreatableSelect
						className="react-select-container"
						classNamePrefix="react-select"
						name={field.name}
						id={id}
						closeMenuOnSelect={true}
						isClearable={false}
						isValidNewOption={validateDomain(isWildcardPermitted && dnsProviderWildcardSupported)}
						isMulti
						placeholder={intl.formatMessage({ id: "domain-names.placeholder" })}
						onChange={handleChange}
						value={field.value?.map((d: string) => ({ label: d, value: d }))}
						styles={{
							control: (baseStyles) => ({
								...baseStyles,
								backgroundColor: "hsl(var(--background))",
								borderColor: "hsl(var(--input))",
								color: "hsl(var(--foreground))",
								minHeight: "2.5rem",
								borderRadius: "calc(var(--radius) - 2px)",
							}),
							menu: (base) => ({
								...base,
								zIndex: 9999,
								backgroundColor: "hsl(var(--popover))",
								color: "hsl(var(--popover-foreground))",
								border: "1px solid hsl(var(--border))",
							}),
							option: (base, state) => ({
								...base,
								backgroundColor: state.isFocused ? "hsl(var(--accent))" : "transparent",
								color: state.isFocused ? "hsl(var(--accent-foreground))" : "hsl(var(--foreground))",
							}),
							singleValue: (base) => ({
								...base,
								color: "hsl(var(--foreground))",
							}),
							multiValue: (base) => ({
								...base,
								backgroundColor: "hsl(var(--secondary))",
							}),
							multiValueLabel: (base) => ({
								...base,
								color: "hsl(var(--secondary-foreground))",
							}),
							multiValueRemove: (base) => ({
								...base,
								color: "hsl(var(--secondary-foreground))",
								':hover': {
									backgroundColor: "hsl(var(--destructive))",
									color: "hsl(var(--destructive-foreground))",
								},
							}),
							input: (base) => ({
								...base,
								color: "hsl(var(--foreground))",
							}),
						}}
					/>
					{form.errors[field.name] && form.touched[field.name] ? (
						<p className="text-sm font-medium text-destructive">{form.errors[field.name]}</p>
					) : helperTexts.length ? (
						helperTexts.map((i, idx) => (
							<p key={idx} className="text-sm text-muted-foreground">
								{i}
							</p>
						))
					) : null}
				</div>
			)}
		</Field>
	);
}
