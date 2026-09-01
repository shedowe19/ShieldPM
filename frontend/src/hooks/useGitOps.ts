import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as gitopsApi from "../api/backend/gitops";
import { useToast } from "./use-toast";

/**
 * Hook to fetch GitOps configuration
 */
export const useGitOpsConfig = () => {
	return useQuery({
		queryKey: ["gitops-config"],
		queryFn: () => gitopsApi.getGitOpsConfig(),
		retry: false,
	});
};

/**
 * Hook to fetch GitOps commit history
 */
export const useGitOpsHistory = (limit = 20) => {
	return useQuery({
		queryKey: ["gitops-history", limit],
		queryFn: () => gitopsApi.getGitOpsHistory(limit),
		retry: false,
	});
};

/**
 * Hook for GitOps mutations
 */
export const useGitOps = () => {
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const updateConfig = useMutation({
		mutationFn: (data: gitopsApi.GitOpsConfigUpdate) => gitopsApi.updateGitOpsConfig(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["gitops-config"] });
			toast({
				title: "Configuration Updated",
				description: "GitOps configuration has been saved.",
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to update configuration.",
				variant: "destructive",
			});
		},
	});

	const testConnection = useMutation({
		mutationFn: () => gitopsApi.testGitOpsConnection(),
		onSuccess: (result) => {
			if (result.success) {
				if (result.warning) {
					toast({
						title: "Connection Successful with Warning",
						description: `${result.message}\n\n${result.warning}`,
						variant: "destructive",
						duration: 10000,
					});
				} else {
					toast({
						title: "Connection Successful",
						description: result.message || "Repository is accessible.",
					});
				}
			} else {
				toast({
					title: "Connection Failed",
					description: result.message || "Could not connect to repository.",
					variant: "destructive",
				});
			}
		},
		onError: (error: Error) => {
			toast({
				title: "Error",
				description: error.message || "Failed to test connection.",
				variant: "destructive",
			});
		},
	});

	const exportConfig = useMutation({
		mutationFn: () => gitopsApi.exportGitOpsConfig(),
		onSuccess: (result) => {
			toast({
				title: "Export Complete",
				description: `Exported ${result.filesExported} configuration files.`,
			});
		},
		onError: (error: Error) => {
			toast({
				title: "Export Failed",
				description: error.message || "Failed to export configuration.",
				variant: "destructive",
			});
		},
	});

	const push = useMutation<gitopsApi.GitOpsResult, Error, string | undefined>({
		mutationFn: (message?: string) => gitopsApi.pushGitOps(message),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["gitops-config"] });
			queryClient.invalidateQueries({ queryKey: ["gitops-history"] });
			if (result.success) {
				toast({
					title: "Push Successful",
					description: result.commit
						? `Committed: ${result.commit.substring(0, 8)}`
						: result.message || "Changes pushed.",
				});
			} else {
				toast({
					title: "Push Failed",
					description: result.message || "Could not push to repository.",
					variant: "destructive",
				});
			}
		},
		onError: (error: Error) => {
			toast({
				title: "Push Error",
				description: error.message || "Failed to push.",
				variant: "destructive",
			});
		},
	});

	const pull = useMutation({
		mutationFn: () => gitopsApi.pullGitOps(),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["gitops-config"] });
			queryClient.invalidateQueries({ queryKey: ["gitops-history"] });
			if (result.success) {
				toast({
					title: "Pull Successful",
					description: result.message || "Changes pulled from repository.",
				});
			} else {
				toast({
					title: "Pull Failed",
					description: result.message || "Could not pull from repository.",
					variant: "destructive",
				});
			}
		},
		onError: (error: Error) => {
			toast({
				title: "Pull Error",
				description: error.message || "Failed to pull.",
				variant: "destructive",
			});
		},
	});

	const revert = useMutation({
		mutationFn: (sha: string) => gitopsApi.revertGitOps(sha),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["gitops-history"] });
			if (result.success) {
				toast({
					title: "Revert Successful",
					description: result.message || "Reverted to selected commit.",
				});
			} else {
				toast({
					title: "Revert Failed",
					description: result.message || "Could not revert.",
					variant: "destructive",
				});
			}
		},
		onError: (error: Error) => {
			toast({
				title: "Revert Error",
				description: error.message || "Failed to revert.",
				variant: "destructive",
			});
		},
	});

	const importConfig = useMutation<gitopsApi.GitOpsImportResult, Error, { overwrite: boolean; dryRun: boolean }>({
		mutationFn: ({ overwrite, dryRun }) => gitopsApi.importGitOpsConfig(overwrite, dryRun),
		onSuccess: (result) => {
			if (!result.dryRun) {
				queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
				queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
				queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
				queryClient.invalidateQueries({ queryKey: ["streams"] });
			}

			if (result.success) {
				toast({
					title: result.dryRun ? "Validation Complete" : "Import Complete",
					description: `${result.dryRun ? "Would import" : "Imported"} ${result.imported}, skipped ${result.skipped}, removed ${result.deleted}.`,
				});
			} else {
				toast({
					title: "Import Failed",
					description: result.errors.join(", ") || "Could not import configuration.",
					variant: "destructive",
				});
			}
		},
		onError: (error: Error) => {
			toast({
				title: "Import Error",
				description: error.message || "Failed to import.",
				variant: "destructive",
			});
		},
	});

	return {
		updateConfig,
		testConnection,
		exportConfig,
		push,
		pull,
		revert,
		importConfig,
	};
};
