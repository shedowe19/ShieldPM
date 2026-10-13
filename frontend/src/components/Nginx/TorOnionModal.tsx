import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import type { TorOnion } from "@/api/backend";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useTorOnion } from "@/hooks/useTorOnion";
import { intl, T } from "@/locale";

const formSchema = z.object({
	name: z.string().min(1, intl.formatMessage({ id: "error.required_field" })),
	virtualPort: z.coerce.number().int().min(1).max(65535),
	targetPort: z.coerce.number().int().min(1).max(65535),
});

type FormValues = z.infer<typeof formSchema>;

interface TorOnionModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	service?: TorOnion | null;
}

export function TorOnionModal({ open, onOpenChange, service }: TorOnionModalProps) {
	const { create, update } = useTorOnion();
	const generation = useRef(0);
	const submissionPending = useRef(false);
	const identity = useRef<{ open: boolean; id: number | undefined }>({ open: false, id: undefined });
	useEffect(
		() => () => {
			generation.current += 1;
		},
		[],
	);

	const changeOpen = (nextOpen: boolean) => {
		if (!nextOpen) generation.current += 1;
		onOpenChange(nextOpen);
	};

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
		defaultValues: {
			name: "",
			virtualPort: 80,
			targetPort: 80,
		},
	});

	useEffect(() => {
		if (identity.current.open === open && identity.current.id === service?.id) return;
		identity.current = { open, id: service?.id };
		generation.current += 1;
		if (open) {
			form.reset({
				name: service?.name || "",
				virtualPort: service?.virtualPort || 80,
				targetPort: service?.targetPort || 80,
			});
		}
	}, [open, service, form]);

	const onSubmit = (values: FormValues) => {
		if (submissionPending.current) return;
		submissionPending.current = true;
		const submittedGeneration = generation.current;
		const callbacks = {
			onSuccess: () => {
				if (generation.current === submittedGeneration) changeOpen(false);
			},
			onSettled: () => {
				submissionPending.current = false;
			},
		};
		if (service) {
			update.mutate(
				{
					id: service.id,
					data: {
						name: values.name,
						virtualPort: values.virtualPort,
						targetPort: values.targetPort,
					},
				},
				callbacks,
			);
		} else {
			create.mutate(
				{
					name: values.name,
					virtualPort: values.virtualPort,
					targetPort: values.targetPort,
				},
				callbacks,
			);
		}
	};

	const isSubmitting = create.isPending || update.isPending;

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col">
				<DialogHeader className="px-6 py-4 border-b">
					<DialogTitle className="flex items-center gap-2">
						<span className="text-xl">🧅</span>
						<T id={service ? "tor.edit" : "tor.add"} />
					</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="contents">
						<div className="p-6 space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											<T id="name" />
										</FormLabel>
										<FormControl>
											<Input placeholder="My Onion Service" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="virtualPort"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												<T id="tor.virtual_port" />
											</FormLabel>
											<FormControl>
												<Input type="number" min={1} max={65535} {...field} />
											</FormControl>
											<FormDescription>
												<T id="tor.virtual_port_desc" />
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="targetPort"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												<T id="tor.target_port" />
											</FormLabel>
											<FormControl>
												<Input type="number" min={1} max={65535} {...field} />
											</FormControl>
											<FormDescription>
												<T id="tor.target_port_desc" />
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div className="p-4 bg-muted/40 rounded-lg text-xs space-y-2">
								<p className="font-semibold flex items-center gap-1.5 text-foreground">
									<T id="tor.help_https_title" />
								</p>
								<p className="text-muted-foreground leading-relaxed">
									<T id="tor.help_https_desc" />
								</p>
							</div>

							{service?.onionAddress && (
								<div className="p-4 bg-muted rounded-lg">
									<p className="text-sm text-muted-foreground mb-1">Onion Address</p>
									<code className="text-sm font-mono break-all">{service.onionAddress}</code>
								</div>
							)}
						</div>
						<DialogFooter className="px-6 py-4 border-t bg-muted/10">
							<Button type="button" variant="outline" onClick={() => changeOpen(false)}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								disabled={isSubmitting}
								className="bg-purple-600/90 text-white hover:bg-purple-600 shadow-sm"
							>
								{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								<T id="save" />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
