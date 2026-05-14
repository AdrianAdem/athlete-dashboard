import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  dark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () =>
        set((state) => {
          const next = !state.dark;
          document.documentElement.classList.toggle("dark", next);
          return { dark: next };
        }),
    }),
    {
      name: "theme",
      onRehydrateStorage: () => (state) => {
        if (state?.dark) {
          document.documentElement.classList.add("dark");
        }
      },
    }
  )
);
