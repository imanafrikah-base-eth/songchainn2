#!/usr/bin/env node
/**
 * PreToolUse gate: measure the UI before code ships.
 *
 * This replaced an `agent`-type hook whose `if: "Bash(git commit*)"` filter
 * failed to match (the prefix wildcard needs a space, `git commit *`) and so
 * fired on *every* Bash call, including read-only ones. A guard that blocks
 * unrelated work is worse than no guard, so the filtering is done here in
 * plain code where it is deterministic and cannot fail open.
 *
 * Contract:
 *   - Not a git commit/push  -> exit 0, silent. Never in the way.
 *   - Dev server not running -> allow, with a visible warning. Refusing to
 *     commit because a server is down is infrastructure noise, not a defect.
 *   - Overflow found         -> deny, with the exact routes and elements.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const SERVER = 'http://localhost:5173';
const SESSION = '.ui-inspect-session.json';

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function warn(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

const input = readHookInput();
const command = String(input?.tool_input?.command ?? '');

// Only two commands actually ship code. Everything else passes untouched.
if (!/\bgit\s+(commit|push)\b/.test(command)) allow();

// A dry run or a status-ish invocation is not a ship.
if (/--dry-run\b/.test(command)) allow();

let serverUp = false;
try {
  execFileSync('curl', ['-sf', '-o', '/dev/null', SERVER], { timeout: 8000 });
  serverUp = true;
} catch {
  serverUp = false;
}

if (!serverUp) {
  warn(
    'UI check skipped: dev server is not running on ' +
      SERVER +
      '. Start it with `npm run dev` to have layout measured before shipping.',
  );
}

const args = ['scripts/ui-inspect.mjs', '--widths', '320,360,402'];
let scannedSignedIn = false;
if (existsSync(SESSION)) {
  args.push('--storage', SESSION);
  scannedSignedIn = true;
}

let output = '';
let failed = false;
try {
  output = execFileSync('node', args, {
    encoding: 'utf8',
    // This machine has 8 GB and the scan walks every route at three widths in
    // both themes. Four minutes was not enough and the gate was timing out,
    // which reads as a failure rather than as a slow pass. The hook's own
    // timeout in .claude/settings.json is set above this on purpose.
    timeout: 840000,
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
} catch (err) {
  failed = true;
  output = String(err.stdout || err.message || '');
}

if (!failed) {
  if (!scannedSignedIn) {
    warn(
      'UI check passed, but signed out only: guarded routes redirected to the landing page. ' +
        'Run `node scripts/ui-inspect.mjs --login` once so future checks cover the real app.',
    );
  }
  allow();
}

deny(
  'UI check failed. Something does not fit the phone screen, so this is not ready to ship.\n\n' +
    output.trim().slice(0, 3000) +
    '\n\nLines marked TAP are controls the user cannot fully reach. Fix these, then commit again.' +
    (scannedSignedIn ? '' : '\n\n(Scanned signed out only; capture a session with --login for full coverage.)'),
);
