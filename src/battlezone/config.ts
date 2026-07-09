// Feature flags for the WaveWarz Africa battle zone.
//
// VOICE_ENABLED gates every in-app voice surface (LiveKit connection, mic
// controls, speaker requests/management, host music broadcast, audio status).
// While it is false, live audio for battles runs on an X (Twitter) Space that
// the host links when creating the battle; the app keeps voting + text chat.
// Flip this to true to bring the in-app LiveKit voice stack back, the code
// paths are all still in place.
export const VOICE_ENABLED = false;
