import type React from "react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const StorageKey = "tabler-theme";
export const Light = "light";
export const Dark = "dark";

import { AppTheme } from "src/types/enums";

// Define theme types
export type Theme = AppTheme;

interface ThemeContextType {
	theme: Theme;
	toggleTheme: () => void;
	setTheme: (theme: Theme) => void;
	getTheme: () => Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
	children: ReactNode;
}

const getBrowserDefault = (): Theme => {
	if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
		return AppTheme.Dark;
	}
	return AppTheme.Light;
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
	const [theme, setThemeState] = useState<Theme>(() => {
		// Try to read theme from localStorage or use 'light' as default
		if (typeof window !== "undefined") {
			const stored = localStorage.getItem(StorageKey) as Theme | null;
			return stored || getBrowserDefault();
		}
		return getBrowserDefault();
	});

	useEffect(() => {
		document.body.dataset.theme = theme;
		document.body.classList.remove(theme === AppTheme.Light ? AppTheme.Dark : AppTheme.Light);
		document.body.classList.add(theme);
		localStorage.setItem(StorageKey, theme);
	}, [theme]);

	const toggleTheme = () => {
		setThemeState((prev) => (prev === AppTheme.Light ? AppTheme.Dark : AppTheme.Light));
	};

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
	};

	const getTheme = () => {
		return theme;
	};

	document.documentElement.setAttribute("data-bs-theme", theme);
	return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, getTheme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
