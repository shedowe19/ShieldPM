import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { createTerminalHost, type TerminalHost, updateTerminalHost } from "../api/backend";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "../hooks/use-toast";

const formSchema = z.object({
	name: z.string().min(1, { message: "Name is required" }),
	host: z.string().min(1, { message: "Host is required" }),
	port: z.coerce.number().min(1).max(65535),
	auth_type: z.enum(["password", "key"]),
	username: z.string().min(1, { message: "Username is required" }),
	password: z.string().optional(),
	private_key: z.string().optional(),
});

interface Props {
	isOpen: boolean;
	onClose: () => void;
	editingHost?: TerminalHost | null;
}

const TerminalHostModal = ({ isOpen, onClose, editingHost }: Props) => {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema) as any,
		defaultValues: {
			name: "",
			host: "",
			port: 22,
			auth_type: "password",
			username: "",
			password: "",
			private_key: "",
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: needed for reset logic
	useEffect(() => {
		if (editingHost) {
			form.reset({
				name: editingHost.name,
				host: editingHost.host,
				port: editingHost.port,
				auth_type: editingHost.authType,
				username: editingHost.username,
				password: editingHost.password || "",
				private_key: editingHost.privateKey || "",
			});
		} else {
			form.reset({
				name: "",
				host: "",
				port: 22,
				auth_type: "password",
				username: "",
				password: "",
				private_key: "",
			});
		}
	}, [editingHost, isOpen, form]);

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		try {
			if (editingHost) {
				await updateTerminalHost(editingHost.id, {
					...values,
				});
				toast({
					title: t("Success"),
					description: t("Terminal Host updated successfully"),
				});
			} else {
				await createTerminalHost({
					...values,
				});
				toast({
					title: t("Success"),
					description: t("Terminal Host created successfully"),
				});
			}
			queryClient.invalidateQueries({ queryKey: ["terminal-hosts"] });
			onClose();
		} catch (error: any) {
			toast({
				variant: "destructive",
				title: t("Error"),
				description: error.message,
			});
		}
	};

	const authType = form.watch("auth_type");

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>{editingHost ? t("Edit Terminal Host") : t("Add Terminal Host")}</DialogTitle>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("Name")}</FormLabel>
									<FormControl>
										<Input placeholder="My Server" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="host"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("Hostname / IP")}</FormLabel>
										<FormControl>
											<Input placeholder="192.168.1.100" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="port"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("Port")}</FormLabel>
										<FormControl>
											<Input type="number" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("Username")}</FormLabel>
									<FormControl>
										<Input placeholder="root" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="auth_type"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("Authentication Method")}</FormLabel>
									<Select onValueChange={field.onChange} defaultValue={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select auth method" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="password">{t("Password")}</SelectItem>
											<SelectItem value="key">{t("SSH Key")}</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{authType === "password" && (
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("Password")}</FormLabel>
										<FormControl>
											<Input type="password" placeholder="********" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{authType === "key" && (
							<FormField
								control={form.control}
								name="private_key"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("Private Key")}</FormLabel>
										<FormControl>
											<Textarea
												placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
												className="font-mono text-xs h-32"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<div className="flex justify-end space-x-2 pt-4">
							<Button variant="outline" onClick={onClose} type="button">
								{t("Cancel")}
							</Button>
							<Button type="submit">{t("Save")}</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};

export default TerminalHostModal;
