import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/types/database";
import { supabase } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user, loading: false }),
  setProfile: (profile) => set({ profile }),

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) set({ profile: data as UserProfile });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },
}));
