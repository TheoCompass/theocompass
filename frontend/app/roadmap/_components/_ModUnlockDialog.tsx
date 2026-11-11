"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DIALOG_BUTTON } from "../../_components/_Dialog";
import { unlockRoadmap } from "../../../lib/api";

const FORM_ID = "roadmap-unlock-form";

/**
 * The moderator gate.
 *
 * The code is checked by the worker (`POST /api/roadmap/unlock`), not in the
 * browser, so a wrong code fails for the same reason a wrong PATCH fails. It is
 * a speed bump rather than authentication — it protects the roadmap statuses
 * and nothing else — but a client-only check would have been no bump at all,
 * since the PATCH endpoint would still accept anything.
 */
export function ModUnlockDialog({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setError(null);
    setBusy(false);
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const candidate = code.trim();
    if (!candidate || busy) return;

    setBusy(true);
    setError(null);
    try {
      const accepted = await unlockRoadmap(candidate);
      if (!accepted) {
        setError("That code was not accepted.");
        return;
      }
      onUnlocked(candidate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the API.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Moderator"
      title="Unlock status editing"
      initialFocusRef={inputRef}
      footer={
        <>
          <button type="button" onClick={onClose} className={DIALOG_BUTTON.quiet}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} disabled={busy || !code.trim()} className={DIALOG_BUTTON.primary}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        <p>
          Statuses on this page are shared: whatever you pick is what every visitor
          sees. Enter the maintainer code to change one.
        </p>

        <label
          htmlFor="roadmap-mod-code"
          className="mt-3 block font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted"
        >
          Access code
        </label>
        <input
          ref={inputRef}
          id="roadmap-mod-code"
          type="password"
          autoComplete="off"
          data-form-type="other"
          placeholder="Enter code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="mt-1.5 w-full border border-rule-strong bg-paper-raised px-2.5 py-1.5 font-mono text-mini text-ink placeholder:text-ink-muted"
        />

        {error && (
          <p role="alert" className="mt-2 text-2xs leading-snug text-punch-ink">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
