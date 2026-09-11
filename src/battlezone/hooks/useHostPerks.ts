import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/battlezone/integrations/supabase/client";
import { useAuth } from "@/battlezone/contexts/AuthContext";

/**
 * Whether this account hosts free and may take a battle down.
 *
 * The founder gave IMan Afrikah and N3M3SIS every feature with nothing to pay
 * while they test WaveWarz Africa, and the right to delete a battle or keep it
 * in history off the boards. The list is a table, and the rules that matter are
 * enforced there: the Open Mic charge skips them, and both delete and hide
 * refuse anybody else. This hook only decides what the screen says, so a stale
 * answer is a wrong label, never a way in.
 */
export interface HostPerks {
  freeHost: boolean;
  canDelete: boolean;
}

const NONE: HostPerks = { freeHost: false, canDelete: false };

export function useHostPerks() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["battle-host-perks", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HostPerks> => {
      // The generated types are regenerated with the frontend, so a table added
      // in the same batch is not in them yet. Same cast the rest of the app
      // uses for a new table.
      const { data: row, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
            };
          };
        };
      })
        .from("battle_host_perks")
        .select("free_host, can_delete")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return NONE;
      if (!row) return NONE;
      return {
        freeHost: (row as { free_host?: boolean }).free_host !== false,
        canDelete: (row as { can_delete?: boolean }).can_delete !== false,
      };
    },
  });

  return data ?? NONE;
}

export default useHostPerks;
