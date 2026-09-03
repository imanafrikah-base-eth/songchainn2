/**
 * Which chat a room_messages row belongs to.
 *
 * room_messages.room_name was doing two incompatible jobs: in the SONGCHAINN
 * global room it holds the speaker's display name, in a WaveWarz battle room it
 * used to hold the battle's UUID. The global room read the table with no scope
 * filter at all, so every battle message surfaced in the global chat with a
 * UUID where the speaker's name should be.
 *
 * room_id is the scope now, and it is the only thing either room filters on.
 * The same two values are mirrored in supabase/functions/hikulu-judge so the
 * judges speak into the battle room and nowhere else.
 */

export const GLOBAL_CHAT_SCOPE = 'global';

export function battleChatScope(battleId: string | undefined): string {
  return battleId ? `battle:${battleId.toLowerCase()}` : 'battle:unknown';
}
