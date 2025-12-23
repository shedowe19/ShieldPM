import { IconLock, IconLockOpen2 } from "@tabler/icons-react";
import { Field, useFormikContext } from "formik";
import type { ReactNode } from "react";
import Select, { type ActionMeta, components, type OptionProps } from "react-select";
import type { AccessList } from "src/api/backend";
import { useAccessLists } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";
import { Label } from "src/components/ui/label";
import { Skeleton } from "src/components/ui/skeleton";

interface AccessOption {
	readonly value: number;
	readonly label: string;
	readonly subLabel: string;
	readonly icon: ReactNode;
}

const Option = (props: OptionProps<AccessOption>) => {
	return (
		<components.Option {...props}>
			<div className="flex-1">
				<div className="font-medium flex items-center gap-2">
					{props.data.icon} <strong>{props.data.label}</strong>
				</div>
				<div className="text-muted-foreground mt-1 pl-6">{props.data.subLabel}</div>
			</div>
		</components.Option>
	);
};

interface Props {
	id?: string;
	name?: string;
	label?: string;
}
export function AccessField({ name = "accessListId", label = "access-list", id = "accessListId" }: Props) {
	const { isLoading, isError, error, data } = useAccessLists(["owner", "items", "clients"]);
	const { setFieldValue } = useFormikContext();

	const handleChange = (newValue: any, _actionMeta: ActionMeta<AccessOption>) => {
		setFieldValue(name, newValue?.value);
	};

	const options: AccessOption[] =
		data?.map((item: AccessList) => ({
			value: item.id || 0,
			label: item.name,
			subLabel: intl.formatMessage(
				{ id: "access-list.subtitle" },
				{
					users: item?.items?.length,
					rules: item?.clients?.length,
					date: item?.createdOn ? formatDateTime(item?.createdOn) : "N/A",
				},
			),
			icon: <IconLock size={14} className="text-green-500" />,
		})) || [];

	// Public option
	options?.unshift({
		value: 0,
		label: intl.formatMessage({ id: "access-list.public" }),
		subLabel: intl.formatMessage({ id: "access-list.public.subtitle" }),
		icon: <IconLockOpen2 size={14} className="text-red-500" />,
	});

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="space-y-2 mb-3">
					<Label htmlFor={id}>
						<T id={label} />
					</Label>
					{isLoading ? (
						<Skeleton className="h-10 w-full" />
					) : null}
					{isError ? <div className="text-destructive text-sm font-medium">{`${error}`}</div> : null}
					{!isLoading && !isError ? (
						<Select
							className="react-select-container text-black"
							classNamePrefix="react-select"
							defaultValue={options.find((o) => o.value === field.value) || options[0]}
							options={options}
							components={{ Option }}
							styles={{
								option: (base) => ({
									...base,
									height: "100%",
									backgroundColor: "transparent",
									":hover": { backgroundColor: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" },
								}),
								control: (baseStyles) => ({
									...baseStyles,
									backgroundColor: "hsl(var(--background))",
									borderColor: "hsl(var(--input))",
									color: "hsl(var(--foreground))",
								}),
								menu: (base) => ({
									...base,
									zIndex: 9999,
									backgroundColor: "hsl(var(--background))",
									border: "1px solid hsl(var(--border))",
								}),
								singleValue: (base) => ({
									...base,
									color: "hsl(var(--foreground))",
								}),
							}}
							onChange={handleChange}
						/>
					) : null}
					{form.errors[field.name] && form.touched[field.name] ? (
						<div className="text-destructive text-sm font-medium">
							{form.errors[field.name] as string}
						</div>
					) : null}
				</div>
			)}
		</Field>
	);
}
