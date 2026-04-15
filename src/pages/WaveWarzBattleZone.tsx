import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Flame, Mic, MicOff, Radio, Send, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { usePlayerActions } from '@/context/PlayerContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type GenericRow = Record<string, any>;

interface BattleMessage {
  id: string;
  battle_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

function getBattleId(row: GenericRow): string {
  return String(row?.id ?? row?.battle_id ?? '');
}

function getBattleTitle(row: GenericRow): string {
  return String(row?.title ?? row?.name ?? row?.battle_title ?? `Battle ${getBattleId(row).slice(0, 8)}`);
}

function isBattleLive(row: GenericRow): boolean {
  const status = String(row?.status ?? '').toLowerCase();
  return Boolean(
    row?.is_live === true ||
      status === 'live' ||
      status === 'active' ||
      row?.launched_at ||
      row?.live_at
  );
}

function parseBattleLiveId(input: string | null | undefined): string | null {
  if (!input) return null;
  const match = input.match(/BATTLE_LIVE::([a-zA-Z0-9-]+)/);
  return match?.[1] ?? null;
}

export default function WaveWarzBattleZone() {
  const { user } = useAuth();
  const { battleId: battleIdFromRoute } = useParams<{ battleId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { exitRoomMode } = usePlayerActions();

  const [battles, setBattles] = useState<GenericRow[]>([]);
  const [listenerCounts, setListenerCounts] = useState<Record<string, number>>({});
  const [activeUsers, setActiveUsers] = useState<Record<string, string[]>>({});
  const [messages, setMessages] = useState<BattleMessage[]>([]);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(battleIdFromRoute ?? null);
  const [chatDraft, setChatDraft] = useState('');
  const [isSubmittingChat, setIsSubmittingChat] = useState(false);
  const [isCreatingBattle, setIsCreatingBattle] = useState(false);
  const [isSwitchingBattle, setIsSwitchingBattle] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDetails, setCreateDetails] = useState('');
  const [createScheduledAt, setCreateScheduledAt] = useState('');
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);

  const heartbeatTimerRef = useRef<number | null>(null);
  const joinedBattleIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const embedFallbackTriggeredRef = useRef(false);
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const battleAudioRef = useRef<HTMLAudioElement | null>(null);

  const fallbackToEmbeddedBattleZone = useCallback(
    (reason?: string) => {
      if (embedFallbackTriggeredRef.current) return;
      embedFallbackTriggeredRef.current = true;
      toast({
        title: 'BattleZone fallback',
        description:
          reason ||
          'BattleZone had trouble loading in-app. Opening embedded BattleZone as fallback.',
        variant: 'destructive',
      });
      navigate('/wavewarz-africa/results', { replace: true });
    },
    [navigate]
  );

  const activeBattle = useMemo(
    () => battles.find((battle) => getBattleId(battle) === activeBattleId) ?? null,
    [activeBattleId, battles]
  );

  const sortedBattles = useMemo(() => {
    const list = [...battles];
    list.sort((a, b) => {
      const aLive = isBattleLive(a) ? 1 : 0;
      const bLive = isBattleLive(b) ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      const aCount = listenerCounts[getBattleId(a)] ?? 0;
      const bCount = listenerCounts[getBattleId(b)] ?? 0;
      if (aCount !== bCount) return bCount - aCount;
      return String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? ''));
    });
    return list;
  }, [battles, listenerCounts]);

  const fetchBattles = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('battles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      fallbackToEmbeddedBattleZone();
      return;
    }
    setBattles(Array.isArray(data) ? data : []);
  }, [fallbackToEmbeddedBattleZone]);

  const fetchLiveCounts = useCallback(async () => {
    const [liveCountRes, fallbackCountRes] = await Promise.all([
      (supabase as any).from('battle_live_counts').select('*'),
      (supabase as any).from('battle_listener_counts').select('*'),
    ]);

    const map: Record<string, number> = {};
    const apply = (rows: any[]) => {
      rows.forEach((row) => {
        const bid = String(row?.battle_id ?? row?.id ?? '');
        if (!bid) return;
        const count = Number(row?.listener_count ?? row?.listeners ?? row?.count ?? 0);
        map[bid] = Number.isFinite(count) ? count : 0;
      });
    };

    if (Array.isArray(liveCountRes.data)) apply(liveCountRes.data);
    if (Array.isArray(fallbackCountRes.data)) apply(fallbackCountRes.data);
    setListenerCounts(map);
  }, []);

  const fetchLiveUsers = useCallback(async () => {
    const { data } = await (supabase as any).from('battle_live_users').select('*');
    const map: Record<string, string[]> = {};
    (Array.isArray(data) ? data : []).forEach((row: any) => {
      const bid = String(row?.battle_id ?? '');
      if (!bid) return;
      const display = String(row?.display_name ?? row?.room_name ?? row?.username ?? row?.user_id ?? 'Listener');
      map[bid] = map[bid] ?? [];
      if (!map[bid].includes(display)) {
        map[bid].push(display);
      }
    });
    setActiveUsers(map);
  }, []);

  const fetchMessages = useCallback(async (battleId: string | null) => {
    if (!battleId) {
      setMessages([]);
      return;
    }
    const { data } = await (supabase as any)
      .from('battle_room_messages')
      .select('*')
      .eq('battle_id', battleId)
      .order('created_at', { ascending: true })
      .limit(200);
    const normalized = (Array.isArray(data) ? data : []).map((row: any) => ({
      id: String(row?.id ?? crypto.randomUUID()),
      battle_id: String(row?.battle_id ?? battleId),
      user_id: String(row?.user_id ?? row?.sender_id ?? 'unknown'),
      message: String(row?.message ?? row?.content ?? ''),
      created_at: String(row?.created_at ?? new Date().toISOString()),
    }));
    setMessages(normalized);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(
    (battleId: string) => {
      stopHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        void (supabase as any).rpc('heartbeat_battle_room', { _battle_id: battleId });
      }, 25000);
    },
    [stopHeartbeat]
  );

  const leaveJoinedBattle = useCallback(async () => {
    const joinedId = joinedBattleIdRef.current;
    stopHeartbeat();
    if (!joinedId) return;
    joinedBattleIdRef.current = null;
    await (supabase as any).rpc('leave_battle_room', { _battle_id: joinedId });
  }, [stopHeartbeat]);

  const joinOrSwitchBattle = useCallback(
    async (nextBattleId: string) => {
      const prevBattleId = joinedBattleIdRef.current;
      if (prevBattleId && prevBattleId !== nextBattleId) {
        await (supabase as any).rpc('switch_battle_room', { _new_battle_id: nextBattleId });
      } else if (!prevBattleId) {
        await (supabase as any).rpc('join_battle_room', { _battle_id: nextBattleId });
      }
      joinedBattleIdRef.current = nextBattleId;
      startHeartbeat(nextBattleId);
    },
    [startHeartbeat]
  );

  const cleanupBattleMedia = useCallback(async () => {
    if (battleAudioRef.current) {
      battleAudioRef.current.pause();
      battleAudioRef.current.src = '';
    }
    if (localMicStreamRef.current) {
      localMicStreamRef.current.getTracks().forEach((track) => track.stop());
      localMicStreamRef.current = null;
    }
    setMicEnabled(false);
    await exitRoomMode();
  }, [exitRoomMode]);

  const attachBattleAudio = useCallback(
    async (battle: GenericRow | null) => {
      if (!battle) return;
      const streamUrl = String(battle?.stream_url ?? battle?.audio_url ?? '');
      if (!streamUrl) return;
      if (!battleAudioRef.current) {
        battleAudioRef.current = new Audio();
      }
      battleAudioRef.current.src = streamUrl;
      battleAudioRef.current.autoplay = true;
      battleAudioRef.current.loop = false;
      battleAudioRef.current.preload = 'auto';
      try {
        await battleAudioRef.current.play();
      } catch {
        // Browser autoplay policies may block until user interaction.
      }
    },
    []
  );

  const ensureBattleConnected = useCallback(
    async (nextBattleId: string) => {
      setIsSwitchingBattle(true);
      try {
        await cleanupBattleMedia();
        await joinOrSwitchBattle(nextBattleId);
        setActiveBattleId(nextBattleId);
        navigate(`/wavewarz-africa/room/${nextBattleId}`, { replace: true });
      } catch {
        fallbackToEmbeddedBattleZone(
          'Could not open BattleZone in $ongChainn app. Opening embedded fallback now.'
        );
      } finally {
        if (mountedRef.current) setIsSwitchingBattle(false);
      }
    },
    [cleanupBattleMedia, fallbackToEmbeddedBattleZone, joinOrSwitchBattle, navigate]
  );

  const handleCreateBattle = useCallback(
    async (mode: 'schedule' | 'launch_now') => {
      if (!user?.id) return;
      const title = createTitle.trim();
      if (!title) {
        toast({ title: 'Battle title is required', variant: 'destructive' });
        return;
      }

      setIsCreatingBattle(true);
      try {
        const payload: Record<string, any> = {
          title,
          description: createDetails.trim() || null,
          created_by: user.id,
          creator_user_id: user.id,
          status: mode === 'launch_now' ? 'live' : 'scheduled',
        };
        if (createScheduledAt) payload.scheduled_at = new Date(createScheduledAt).toISOString();

        const createRes = await (supabase as any).from('battles').insert(payload).select('*').single();
        if (createRes.error || !createRes.data?.id) {
          throw createRes.error ?? new Error('Could not create battle');
        }
        const newBattleId = String(createRes.data.id);

        if (mode === 'launch_now') {
          const launchRes = await (supabase as any).rpc('launch_battle_now', { _battle_id: newBattleId });
          if (launchRes.error) {
            const msg = String(launchRes.error.message || '');
            if (/(max|limit).*(live|battle)|5/i.test(msg)) {
              toast({
                title: 'Live Battle Limit Reached',
                description: 'Only 5 battles can be live at once. End one live battle before launching another.',
                variant: 'destructive',
              });
            } else {
              toast({ title: 'Could not launch battle', description: msg, variant: 'destructive' });
            }
            return;
          }

          const launchPath = `/wavewarz-africa/room/${newBattleId}`;
          const socialContent = `BATTLE_LIVE::${newBattleId}::${title} is now LIVE. Join now at ${launchPath}`;

          await (supabase as any).from('social_posts').insert({
            user_id: user.id,
            post_type: 'text',
            content: socialContent,
          });

          const usersRes = await (supabase as any).from('audience_profiles').select('user_id').neq('user_id', user.id).limit(500);
          const users = (Array.isArray(usersRes.data) ? usersRes.data : [])
            .map((row: any) => String(row?.user_id ?? ''))
            .filter(Boolean);
          if (users.length > 0) {
            const notificationsPayload = users.map((toUserId: string) => ({
              user_id: toUserId,
              type: 'mention',
              from_user_id: user.id,
              post_id: null,
              message: `BATTLE_LIVE::${newBattleId}::${title} is now LIVE`,
            }));
            await (supabase as any).from('notifications').insert(notificationsPayload);
          }

          toast({ title: 'Battle launched', description: 'The battle is now live and visible in feed + notifications.' });
          await fetchBattles();
          await fetchLiveCounts();
          await ensureBattleConnected(newBattleId);
          setIsCreatePanelOpen(false);
          return;
        }

        toast({ title: 'Battle scheduled', description: 'Your battle was scheduled successfully.' });
        setIsCreatePanelOpen(false);
        setCreateTitle('');
        setCreateDetails('');
        setCreateScheduledAt('');
        await fetchBattles();
      } catch (error: any) {
        toast({
          title: 'Create battle failed',
          description: String(error?.message || 'Please try again'),
          variant: 'destructive',
        });
      } finally {
        if (mountedRef.current) setIsCreatingBattle(false);
      }
    },
    [
      createDetails,
      createScheduledAt,
      createTitle,
      ensureBattleConnected,
      fetchBattles,
      fetchLiveCounts,
      user?.id,
    ]
  );

  const handleSendChat = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!user?.id || !activeBattleId) return;
      const message = chatDraft.trim();
      if (!message) return;

      setIsSubmittingChat(true);
      try {
        let insertRes = await (supabase as any)
          .from('battle_room_messages')
          .insert({
            battle_id: activeBattleId,
            user_id: user.id,
            message,
          })
          .select('*')
          .single();
        if (insertRes.error) {
          insertRes = await (supabase as any)
            .from('battle_room_messages')
            .insert({
              battle_id: activeBattleId,
              user_id: user.id,
              content: message,
            })
            .select('*')
            .single();
        }
        if (insertRes.error) throw insertRes.error;
        setChatDraft('');
      } catch (error: any) {
        toast({
          title: 'Message failed',
          description: String(error?.message || 'Could not send message'),
          variant: 'destructive',
        });
      } finally {
        if (mountedRef.current) setIsSubmittingChat(false);
      }
    },
    [activeBattleId, chatDraft, user?.id]
  );

  const handleToggleMic = useCallback(async () => {
    if (micEnabled) {
      if (localMicStreamRef.current) {
        localMicStreamRef.current.getTracks().forEach((track) => track.stop());
        localMicStreamRef.current = null;
      }
      setMicEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (localMicStreamRef.current) {
        localMicStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      localMicStreamRef.current = stream;
      setMicEnabled(true);
    } catch (error: any) {
      toast({
        title: 'Mic unavailable',
        description: String(error?.message || 'Allow microphone permission and try again'),
        variant: 'destructive',
      });
    }
  }, [micEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void fetchBattles();
    void fetchLiveCounts();
    void fetchLiveUsers();
  }, [fetchBattles, fetchLiveCounts, fetchLiveUsers]);

  useEffect(() => {
    if (battleIdFromRoute) {
      setActiveBattleId(battleIdFromRoute);
      return;
    }
    if (!activeBattleId && sortedBattles.length > 0) {
      const firstLive = sortedBattles.find((battle) => isBattleLive(battle)) ?? sortedBattles[0];
      const bid = getBattleId(firstLive);
      if (bid) setActiveBattleId(bid);
    }
  }, [activeBattleId, battleIdFromRoute, sortedBattles]);

  useEffect(() => {
    void fetchMessages(activeBattleId);
  }, [activeBattleId, fetchMessages]);

  useEffect(() => {
    if (!activeBattleId || !user?.id) return;
    void joinOrSwitchBattle(activeBattleId);
    return () => {
      void leaveJoinedBattle();
    };
  }, [activeBattleId, joinOrSwitchBattle, leaveJoinedBattle, user?.id]);

  useEffect(() => {
    if (!activeBattle) return;
    void attachBattleAudio(activeBattle);
  }, [activeBattle, attachBattleAudio]);

  useEffect(() => {
    const channel = supabase
      .channel('battle-zone-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battles' }, () => {
        void fetchBattles();
        void fetchLiveCounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_rooms' }, () => {
        void fetchLiveCounts();
        void fetchLiveUsers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_room_messages' }, (payload) => {
        const row = (payload as any)?.new as any;
        const changedBattleId = String(row?.battle_id ?? '');
        if (activeBattleId && changedBattleId === activeBattleId) {
          void fetchMessages(activeBattleId);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void fetchBattles();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, (payload) => {
        const row = (payload as any)?.new as any;
        const linkedBattleId = parseBattleLiveId(String(row?.content ?? ''));
        if (linkedBattleId) {
          void fetchBattles();
          void fetchLiveCounts();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeBattleId, fetchBattles, fetchLiveCounts, fetchLiveUsers, fetchMessages]);

  useEffect(() => {
    return () => {
      stopHeartbeat();
      void leaveJoinedBattle();
      void cleanupBattleMedia();
    };
  }, [cleanupBattleMedia, leaveJoinedBattle, stopHeartbeat]);

  useEffect(() => {
    const shouldOpenCreate = location.pathname.endsWith('/create');
    setIsCreatePanelOpen(shouldOpenCreate);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground variant="default" />
      <Navigation />

      <main className="relative z-10 container mx-auto px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Battle Zone</h1>
            <p className="text-xs text-zinc-300 sm:text-sm">
              Live battles first, dedicated battle rooms, realtime chat, and stable battle presence.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
            onClick={() => {
              setIsCreatePanelOpen((prev) => !prev);
              navigate('/wavewarz-africa/create');
            }}
          >
            Create Battle
          </Button>
        </div>

        {isCreatePanelOpen && (
          <section className="mb-4 rounded-2xl border border-cyan-300/30 bg-black/45 p-4">
            <h2 className="text-base font-semibold text-white">Create Battle</h2>
            <p className="mt-1 text-xs text-zinc-300">Schedule a battle or launch one right now.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Battle title"
                className="border-cyan-300/30 bg-black/35 text-white"
              />
              <Input
                type="datetime-local"
                value={createScheduledAt}
                onChange={(event) => setCreateScheduledAt(event.target.value)}
                className="border-cyan-300/30 bg-black/35 text-white"
              />
            </div>
            <Textarea
              value={createDetails}
              onChange={(event) => setCreateDetails(event.target.value)}
              placeholder="Battle details / artist matchup"
              className="mt-2 min-h-20 border-cyan-300/30 bg-black/35 text-white"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={isCreatingBattle}
                onClick={() => void handleCreateBattle('schedule')}
                className="bg-emerald-500 text-black hover:bg-emerald-400"
              >
                Schedule Battle
              </Button>
              <Button
                type="button"
                disabled={isCreatingBattle}
                onClick={() => void handleCreateBattle('launch_now')}
                className="bg-rose-500 text-white hover:bg-rose-400"
              >
                Launch Battle Now
              </Button>
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <section className="rounded-2xl border border-cyan-400/25 bg-black/45 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Live & Upcoming Battles</h2>
              <span className="text-[11px] text-zinc-300">Live listed first</span>
            </div>

            <div className="space-y-2">
              {sortedBattles.map((battle) => {
                const bid = getBattleId(battle);
                const selected = bid === activeBattleId;
                const live = isBattleLive(battle);
                const listeners = listenerCounts[bid] ?? 0;
                const users = activeUsers[bid] ?? [];
                return (
                  <button
                    key={bid}
                    type="button"
                    onClick={() => void ensureBattleConnected(bid)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-cyan-300/60 bg-cyan-500/15'
                        : 'border-white/15 bg-black/35 hover:border-cyan-300/40'
                    }`}
                    disabled={isSwitchingBattle}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{getBattleTitle(battle)}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          live ? 'bg-rose-500/20 text-rose-100' : 'bg-cyan-500/15 text-cyan-100'
                        }`}
                      >
                        {live ? 'LIVE' : 'UPCOMING'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-300">{String(battle?.description ?? battle?.subtitle ?? '')}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
                      <span className="inline-flex items-center gap-1">
                        <Radio className="h-3 w-3" />
                        {listeners} listeners
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {users.length} active
                      </span>
                    </div>
                  </button>
                );
              })}
              {sortedBattles.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/20 p-4 text-center text-xs text-zinc-300">
                  No battles yet. Create one to get started.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-300/25 bg-black/45 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white">{activeBattle ? getBattleTitle(activeBattle) : 'Battle Room'}</h2>
                <p className="text-[11px] text-zinc-300">
                  Presence uses `battle_rooms`; chat uses `battle_room_messages`.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-cyan-300/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                  onClick={handleToggleMic}
                >
                  {micEnabled ? <Mic className="mr-1 h-4 w-4" /> : <MicOff className="mr-1 h-4 w-4" />}
                  {micEnabled ? 'Mic On' : 'Mic Off'}
                </Button>
              </div>
            </div>

            <div className="mb-3 rounded-xl border border-white/15 bg-black/40 p-2">
              <div className="mb-2 flex items-center gap-1 text-xs text-zinc-300">
                <Flame className="h-3.5 w-3.5 text-rose-300" />
                Active users
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(activeBattleId ? activeUsers[activeBattleId] : [])?.slice(0, 12).map((name) => (
                  <span key={name} className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-100">
                    {name}
                  </span>
                ))}
                {(!activeBattleId || (activeUsers[activeBattleId] ?? []).length === 0) && (
                  <span className="text-[11px] text-zinc-400">No active users yet.</span>
                )}
              </div>
            </div>

            <div className="h-[280px] overflow-y-auto rounded-xl border border-white/15 bg-black/35 p-2">
              {messages.map((message) => (
                <div key={message.id} className="mb-2 rounded-lg border border-white/10 bg-black/35 p-2">
                  <div className="text-[10px] text-zinc-400">{message.user_id === user?.id ? 'You' : message.user_id}</div>
                  <div className="text-sm text-zinc-100">{message.message}</div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="p-4 text-center text-xs text-zinc-400">No battle chat yet. Start the room conversation.</p>
              )}
            </div>

            <form onSubmit={handleSendChat} className="mt-2 flex items-center gap-2">
              <Input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="Send a battle-room message..."
                className="border-cyan-300/30 bg-black/35 text-white"
                disabled={!activeBattleId || isSubmittingChat}
              />
              <Button type="submit" disabled={!activeBattleId || isSubmittingChat}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </section>
        </div>
      </main>

      <AudioPlayer />
    </div>
  );
}
