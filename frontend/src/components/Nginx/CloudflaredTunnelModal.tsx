import { zodResolver } from "@hookform/resolvers/zod";
import { Cloud, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { CloudflaredTunnel } from "@/api/backend";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCloudflaredTunnel } from "@/hooks/useCloudflaredTunnel";
import { intl, T } from "@/locale";

const formSchema = z.object({
	name: z.string().min(1, intl.formatMessage({ id: "error.required_field" })),
	token: z.string(),
});

interface CloudflaredTunnelModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tunnel?: CloudflaredTunnel | null;
}

export function CloudflaredTunnelModal({ open, onOpenChange, tunnel }: CloudflaredTunnelModalProps) {
	const { create, update } = useCloudflaredTunnel();
	const generation = useRef(0);
	const submissionPending = useRef(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const tunnelSnapshot = useRef(tunnel);
	tunnelSnapshot.current = tunnel;
	const tunnelId = tunnel?.id;

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			token: "",
		},
	});

	useEffect(() => {
		generation.current++;
		submissionPending.current = false;
		setIsSubmitting(false);
		if (open) {
			form.reset({
				name: tunnelId ? tunnelSnapshot.current?.name || "" : "",
				token: "",
			});
		}
		return () => {
			generation.current++;
		};
	}, [open, tunnelId, form]);

	const changeOpen = (nextOpen: boolean) => {
		if (!nextOpen) generation.current++;
		onOpenChange(nextOpen);
	};

	const onSubmit = (values: z.infer<typeof formSchema>) => {
		if (!open || submissionPending.current) return;
		if (!tunnel?.hasToken && !values.token) {
			form.setError("token", { message: intl.formatMessage({ id: "error.required_field" }) });
			return;
		}
		submissionPending.current = true;
		setIsSubmitting(true);
		const submittedGeneration = generation.current;
		const callbacks = {
			onSuccess: () => {
				if (submittedGeneration === generation.current) changeOpen(false);
			},
			onSettled: () => {
				if (submittedGeneration !== generation.current) return;
				submissionPending.current = false;
				setIsSubmitting(false);
			},
		};
		if (tunnel) {
			update.mutate(
				{ id: tunnel.id, data: { name: values.name, ...(values.token ? { token: values.token } : {}) } },
				callbacks,
			);
		} else {
			create.mutate(values, callbacks);
		}
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col">
				<DialogHeader className="px-6 py-4 border-b">
					<DialogTitle className="flex items-center gap-2">
						<Cloud className="h-5 w-5" />
						<T id={tunnel ? "cloudflared.edit" : "cloudflared.add"} />
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
											<Input placeholder="My Tunnel" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="token"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											<T id="cloudflared.token" />
										</FormLabel>
										<FormControl>
											<Input
												type="password"
												placeholder={
													tunnel?.hasToken
														? intl.formatMessage({ id: "form.secret.keep-existing" })
														: "eyJhIjoi..."
												}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter className="px-6 py-4 border-t bg-muted/10">
							<Button type="button" variant="outline" onClick={() => changeOpen(false)}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								disabled={isSubmitting}
								className="bg-orange-600/90 text-white hover:bg-orange-600 shadow-sm"
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
