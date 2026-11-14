/**
 * Where the moderator code lives for the rest of the tab.
 *
 * One key for both moderator surfaces -- roadmap status editing and the feedback
 * queue -- because unlocking one should not make the other ask again, and a
 * reload should not make either ask again.
 *
 * `sessionStorage`, not `localStorage`: the code is a speed bump, not an account,
 * so it should not outlive the tab. Every access is wrapped because private mode
 * and blocked storage throw on read, and a moderator page that crashes for want
 * of a stored code would be worse than one that simply asks for it.
 */

const MOD_CODE_KEY = "theocompass_mod_code";

export function readModCode(): string | null {
  try {
    return window.sessionStorage.getItem(MOD_CODE_KEY);
  } catch {
    return null;
  }
}

export function rememberModCode(code: string): void {
  try {
    window.sessionStorage.setItem(MOD_CODE_KEY, code);
  } catch {
    /* the in-memory code still works for this page view */
  }
}

export function forgetModCode(): void {
  try {
    window.sessionStorage.removeItem(MOD_CODE_KEY);
  } catch {
    /* nothing to clean up */
  }
}
