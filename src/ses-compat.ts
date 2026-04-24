/**
 * SES compatibility shim.
 *
 * MetaMask (and some other browser extensions) inject Agoric's SES "lockdown"
 * before the page scripts run.  Lockdown removes non-standard V8 intrinsics
 * (Error.captureStackTrace, Error.prepareStackTrace, Function.prototype.caller,
 * Function.prototype.arguments, RegExp.$1…$9, etc.) and freezes them out.
 *
 * Several of our deps (wagmi, viem, @tanstack/react-query) call these
 * defensively – but only AFTER checking they exist.  The problem is that after
 * SES lockdown, the property appears as "own non-configurable non-writable"
 * (value = undefined) rather than simply absent.  A check like
 *   `if (Error.captureStackTrace)` → false, so callers skip it (safe).
 * But some older builds do `Error.captureStackTrace(err, ctor)` without the guard,
 * which throws a TypeError on a frozen undefined.
 *
 * This module is imported first (see main.tsx) and re-attaches no-op shims
 * only when SES has removed them.  If SES has NOT run (no MetaMask / extension),
 * the real V8 implementations remain untouched because we only set when absent.
 */

function tryDefine(target: object, prop: string, value: unknown) {
  try {
    if ((target as any)[prop] == null) {
      Object.defineProperty(target, prop, {
        value,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
  } catch {
    // Property is frozen non-configurable – nothing we can do, skip silently.
  }
}

// Error.captureStackTrace – used by wagmi / viem for stack enrichment.
tryDefine(Error, 'captureStackTrace', function captureStackTrace() {});

// Error.prepareStackTrace – used by some stack-trace formatters.
tryDefine(Error, 'prepareStackTrace', undefined);

// Function.prototype.caller / .arguments – removed by SES; some polyfills check these.
tryDefine(Function.prototype, 'caller', undefined);
tryDefine(Function.prototype, 'arguments', undefined);
