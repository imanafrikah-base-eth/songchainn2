// Your citizen record for a world: your name there, and how you look.
//
// Loads on arrival, saves when you change something, and falls back to a
// default body so a visitor is never standing in the street with nothing.
// Signed-out visitors get a citizen too, held in memory only; they can walk
// around and look like someone without an account existing first, which is the
// whole point of a public street.

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { DEFAULT_AVATAR, sanitize, type AvatarConfig } from './avatars';
import type { WorldConfig, WorldRings } from './types';

export interface Citizen {
  displayName: string | null;
  avatar: AvatarConfig;
  incognito: boolean;
}

export interface CitizenState extends Citizen {
  /** False until the stored record has been read at least once. */
  loaded: boolean;
  /** True while a save is in flight. */
  saving: boolean;
  save: (next: Partial<Citizen>) => Promise<void>;
}

function readAvatar(value: unknown): AvatarConfig {
  if (!value || typeof value !== 'object') return DEFAULT_AVATAR;
  const v = value as Partial<AvatarConfig>;
  return {
    skin: typeof v.skin === 'string' ? v.skin : DEFAULT_AVATAR.skin,
    outfit: typeof v.outfit === 'string' ? v.outfit : DEFAULT_AVATAR.outfit,
    hair: typeof v.hair === 'string' ? v.hair : DEFAULT_AVATAR.hair,
    accessory: typeof v.accessory === 'string' ? v.accessory : DEFAULT_AVATAR.accessory,
  };
}

export function useCitizen(world: WorldConfig, rings: WorldRings | null): CitizenState {
  const { user } = useAuth();
  const [citizen, setCitizen] = useState<Citizen>({
    displayName: null,
    avatar: DEFAULT_AVATAR,
    incognito: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured || !user?.id) {
        if (active) setLoaded(true);
        return;
      }
      try {
        const { data } = await supabase
          .from('world_citizens')
          .select('display_name, avatar, incognito')
          .eq('world_slug', world.slug)
          .eq('user_id', user.id)
          .maybeSingle();
        if (active && data) {
          setCitizen({
            displayName: data.display_name ?? null,
            avatar: readAvatar(data.avatar),
            incognito: Boolean(data.incognito),
          });
        }
      } catch {
        // No record yet, or the read failed. The default body stands in.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, world.slug]);

  const save = useCallback(
    async (next: Partial<Citizen>) => {
      const merged: Citizen = { ...citizen, ...next };
      setCitizen(merged);
      if (!isSupabaseConfigured || !user?.id) return;
      setSaving(true);
      try {
        await supabase.from('world_citizens').upsert(
          {
            world_slug: world.slug,
            user_id: user.id,
            display_name: merged.displayName,
            avatar: merged.avatar,
            incognito: merged.incognito,
          },
          { onConflict: 'world_slug,user_id' },
        );
      } catch {
        // The change is already applied locally; a failed write just means it
        // does not survive a reload. Not worth an error in someone's face.
      } finally {
        setSaving(false);
      }
    },
    [citizen, user?.id, world.slug],
  );

  return {
    ...citizen,
    // A look tied to holding the key stops working the moment the key is sold,
    // so holdings are re-checked on every render rather than trusted from the
    // stored row.
    avatar: sanitize(citizen.avatar, rings),
    loaded,
    saving,
    save,
  };
}
