"use client";

import { useState } from "react";
import { ArrowRight, Dices, Target, Terminal, UserCog } from "lucide-react";
import { DIALOG_BUTTON, Dialog } from "../../_components/_Dialog";

/**
 * The dialogs the quiz opens: leave, restart, developer.
 *
 * "Leave" has two voices. Mid-quiz it is one warning, because progress is
 * already in localStorage and there is nothing to decide. On the results page
 * the same button must offer a choice: keep the finished result for next time,
 * or delete it. That is `backContext`.
 *
 * These were the last screens still wearing the old dialect - `bg-black/50`,
 * `rounded-lg shadow-xl`, a 16px bold sans title, `bg-red-600` for anything
 * destructive, and a purple "Unlock Dev Tools" button with a rocket in it. Red,
 * amber and purple are not in this palette at all; they were Tailwind defaults
 * that had simply never been visited.
 *
 * Structure is unchanged. What changed is that the shape, the focus behaviour
 * and the buttons now come from `_Dialog` (shared, in `app/_components`), the
 * destructive action speaks punch,
 * and the access code is a disclosure instead of a box in the middle of a
 * confirmation dialog, where it read as a required step.
 */
interface ModalsProps {
  showBackModal: boolean;
  showDevModal: boolean;
  showRestartModal: boolean;
  devCode: string;
  onUnlockDevTools: () => void;
  onCloseBackModal: () => void;
  onCloseDevModal: () => void;
  onCloseRestartModal: () => void;
  onConfirmBack: () => void;
  onConfirmDev: () => void;
  onConfirmRestart: () => void;
  onDevDenomFill: (denomId: string) => void;
  onSetDevCode: (code: string) => void;
  /**
   * Which leave dialog to show: "progress" mid-quiz, "results" once the quiz is
   * finished. On results there is a choice, because those two exits do
   * different things to localStorage.
   */
  backContext?: "progress" | "results";
  /** Results only: keep the result and go to the main page. */
  onSaveAndLeave: () => void;
  /** Results only: drop the result and go to the main page. */
  onDiscardAndLeave: () => void;
  backModalMessage?: string;
}

/** A row in the developer list: icon, name, one line of consequence. */
function DevRow({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof Dices;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 py-3 text-left"
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-accent"
        strokeWidth={1.5}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-mini font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">{detail}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="mt-1 h-3.5 w-3.5 shrink-0 text-rule-strong transition-colors group-hover:text-accent"
        strokeWidth={2}
      />
    </button>
  );
}

export function Modals({
  showBackModal,
  showDevModal,
  showRestartModal,
  devCode,
  onUnlockDevTools,
  onCloseBackModal,
  onCloseDevModal,
  onCloseRestartModal,
  onConfirmBack,
  onConfirmDev,
  onConfirmRestart,
  onDevDenomFill,
  onSetDevCode,
  backContext = "progress",
  onSaveAndLeave,
  onDiscardAndLeave,
  backModalMessage = "Your progress is saved automatically. You can resume later.",
}: ModalsProps) {
  const [customDenomId, setCustomDenomId] = useState("DENOM_001");
  const [showCustomIdInput, setShowCustomIdInput] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);

  const handleCustomDenomSubmit = () => {
    const trimmed = customDenomId.trim();
    if (trimmed) {
      onDevDenomFill(trimmed);
      setShowCustomIdInput(false);
    }
  };

  const closeRestart = () => {
    onCloseRestartModal();
    onSetDevCode("");
    setShowAccessCode(false);
  };

  return (
    <>
      {/* ── Leave ─────────────────────────────────────────────────────── */}
      {backContext === "results" ? (
        <Dialog
          open={showBackModal}
          onClose={onCloseBackModal}
          eyebrow="Leave"
          title="Leave your results?"
          footer={
            <>
              <button type="button" onClick={onCloseBackModal} className={DIALOG_BUTTON.quiet}>
                Stay
              </button>
              <button type="button" onClick={onDiscardAndLeave} className={DIALOG_BUTTON.danger}>
                Don&rsquo;t save
              </button>
              <button type="button" onClick={onSaveAndLeave} className={DIALOG_BUTTON.primary}>
                Save results
              </button>
            </>
          }
        >
          <p>
            Saving keeps these results in this browser, so opening the quiz again shows
            them instead of starting over. Leaving without saving deletes them.
          </p>
        </Dialog>
      ) : (
        <Dialog
          open={showBackModal}
          onClose={onCloseBackModal}
          eyebrow="Leave"
          title="Leave the quiz?"
          footer={
            <>
              <button type="button" onClick={onCloseBackModal} className={DIALOG_BUTTON.quiet}>
                Stay
              </button>
              <button type="button" onClick={onConfirmBack} className={DIALOG_BUTTON.danger}>
                Leave quiz
              </button>
            </>
          }
        >
          <p>{backModalMessage}</p>
        </Dialog>
      )}

      {/* ── Developer tools ───────────────────────────────────────────── */}
      <Dialog
        open={showDevModal}
        onClose={onCloseDevModal}
        eyebrow="Developer"
        title="Skip to a result"
        footer={
          <button type="button" onClick={onCloseDevModal} className={DIALOG_BUTTON.quiet}>
            Close
          </button>
        }
      >
        <div className="divide-y divide-rule">
          <DevRow
            icon={Dices}
            title="Random answers"
            detail="Answer every question at random, then land on the results."
            onClick={onConfirmDev}
          />

          <DevRow
            icon={Target}
            title="Perfect Catholic"
            detail="Fill in the answers that put DENOM_032 at the top."
            onClick={() => onDevDenomFill("DENOM_032")}
          />

          {!showCustomIdInput ? (
            <DevRow
              icon={UserCog}
              title="Specific tradition"
              detail="Fill in the answers for a tradition ID you name."
              onClick={() => setShowCustomIdInput(true)}
            />
          ) : (
            <div className="py-3">
              <label
                htmlFor="denom-id"
                className="font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted"
              >
                Tradition ID
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="denom-id"
                  type="text"
                  value={customDenomId}
                  onChange={(event) => setCustomDenomId(event.target.value)}
                  placeholder="DENOM_001"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleCustomDenomSubmit();
                    if (event.key === "Escape") {
                      // Collapse the field, not the dialog it sits in.
                      event.preventDefault();
                      event.stopPropagation();
                      setShowCustomIdInput(false);
                    }
                  }}
                  className="num min-w-0 flex-1 border border-rule-strong bg-paper-raised px-2.5 py-1.5 font-mono text-mini text-ink placeholder:text-ink-muted"
                />
                <button
                  type="button"
                  onClick={handleCustomDenomSubmit}
                  className={DIALOG_BUTTON.primary}
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomIdInput(false)}
                  className={DIALOG_BUTTON.quiet}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* ── Restart ───────────────────────────────────────────────────── */}
      <Dialog
        open={showRestartModal}
        onClose={closeRestart}
        eyebrow="Restart"
        title="Restart the quiz?"
        footer={
          <>
            <button type="button" onClick={closeRestart} className={DIALOG_BUTTON.quiet}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmRestart();
                setShowAccessCode(false);
              }}
              className={DIALOG_BUTTON.danger}
            >
              Restart
            </button>
          </>
        }
      >
        <p>
          This deletes your saved answers and starts again at question 1. Your last
          results are not kept.
        </p>

        {/* Below the decision and collapsed: a secret is not a step. */}
        <div className="mt-4 border-t border-rule pt-3">
          {!showAccessCode ? (
            <button
              type="button"
              onClick={() => setShowAccessCode(true)}
              className="flex items-center gap-1.5 font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-accent-ink"
            >
              <Terminal aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
              Access code
            </button>
          ) : (
            <div>
              <label
                htmlFor="access-code"
                className="font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted"
              >
                Access code
              </label>
              <input
                id="access-code"
                type="password"
                autoComplete="new-password"
                data-form-type="other"
                placeholder="Enter code"
                value={devCode}
                onChange={(event) => onSetDevCode(event.target.value)}
                autoFocus
                className="mt-1.5 w-full border border-rule-strong bg-paper-raised px-2.5 py-1.5 font-mono text-mini text-ink placeholder:text-ink-muted"
              />

              {devCode === "mod" && (
                <button
                  type="button"
                  onClick={onUnlockDevTools}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 bg-accent-soft px-2.5 py-1.5 text-2xs font-semibold text-accent-ink transition-colors hover:bg-cerulean-200"
                >
                  <Terminal aria-hidden="true" className="h-3 w-3" strokeWidth={2} />
                  Open developer tools
                </button>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}