import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCloudflaredTunnel } from "@/hooks/useCloudflaredTunnel";
import type { CloudflaredTunnel } from "@/api/backend";
import { Cloud, Loader2 } from "lucide-react";
import { T, intl } from "@/locale";

const formSchema = z.object({
	name: z.string().min(1, intl.formatMessage({ id: "error.required_field" })),
	token: z.string().min(1, intl.formatMessage({ id: "error.required_field" })),
});

interface CloudflaredTunnelModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tunnel?: CloudflaredTunnel | null;
}

export function CloudflaredTunnelModal({ open, onOpenChange, tunnel }: CloudflaredTunnelModalProps) {
	const { create, update } = useCloudflaredTunnel();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			token: "",
		},
	});

	useEffect(() => {
		if (open) {
			form.reset({
				name: tunnel?.name || "",
				token: tunnel?.token || "",
			});
		}
	}, [open, tunnel, form]);

	const onSubmit = (values: z.infer<typeof formSchema>) => {
		if (tunnel) {
			update.mutate(
				{ id: tunnel.id, data: values },
				{
					onSuccess: () => onOpenChange(false),
				},
			);
		} else {
			create.mutate(values, {
				onSuccess: () => onOpenChange(false),
			});
		}
	};

	const isSubmitting = create.isPending || update.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
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
											<Input type="password" placeholder="eyJhIjoi..." {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter className="px-6 py-4 border-t bg-muted/10">
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
