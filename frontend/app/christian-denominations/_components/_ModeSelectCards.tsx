"use client";

import { Compass, Microscope, MoveRight, Zap } from "lucide-react";

interface ModeSelectCardsProps {
  savedMode: string | null;
  onSelectQuick: () => void;
}

/**
 * The first screen of the quiz.
 *
 * Same language as the rest of the flow: hairline cards, no gradients, no emoji,
 * and metadata in the small-caps line so the three modes are comparable at a
 * glance instead of three competing colours.
 */
export function ModeSelectCards({ savedMode, onSelectQuick }: ModeSelectCardsProps) {
  const comingSoon = () =>
    alert(
      "Standard Mode (60 questions, ~60 min) and Deep Mode (120 questions, ~120 min) are coming soon. Subscribe on r/TheoCompass for updates!"
    );

  const modes = [
    {
      key: "quick",
      name: "Quick",
      questions: "30 questions",
      minutes: "~30 min",
      blurb: "A streamlined overview of the most defining Christian doctrines.",
      note: "Best for first-timers",
      icon: Zap,
      available: true,
      onClick: onSelectQuick,
    },
    {
      key: "standard",
      name: "Standard",
      questions: "60 questions",
      minutes: "~60 min",
      blurb: "The recommended TheoCompass experience.",
      note: "Balanced",
      icon: Compass,
      available: false,
      onClick: comingSoon,
    },
    {
      key: "deep",
      name: "Deep",
      questions: "120 questions",
      minutes: "~120 min",
      blurb: "The ultimate theological audit.",
      note: "Deep dive",
      icon: Microscope,
      available: false,
      onClick: comingSoon,
    },
  ];

  return (
    <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isPrimary = mode.key === "quick";

        return (
          <button
            key={mode.key}
            type="button"
            onClick={mode.onClick}
            aria-disabled={!mode.available}
            className={`flex items-center gap-3 border-l-2 p-3 text-left transition-colors md:flex-col md:items-stretch md:gap-0 md:p-6 ${
              isPrimary
                ? "border-l-accent bg-paper-raised hover:bg-cerulean-50"
                : "border-l-rule bg-paper-raised/60 hover:border-l-rule-strong hover:bg-cerulean-50/60"
            } ${mode.available ? "" : "opacity-70"}`}
          >
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 ${isPrimary ? "text-accent" : "text-ink-muted"}`}
              strokeWidth={1.75}
            />

            <div className="min-w-0 flex-1 md:mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2
                  className={`font-display text-base md:text-xl ${
                    isPrimary ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {mode.name}
                </h2>
                <span className="meta num md:hidden">{mode.questions}</span>
              </div>

              {/* Phone shows one line of orientation so all three modes fit on
                  screen; from sm up the full blurb has room. */}
              <p className="mt-1 hidden text-sm leading-relaxed text-ink-soft sm:block">
                {mode.blurb}
              </p>

              <div className="meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 md:mt-6 md:border-t md:border-rule md:pt-3">
                <span className="num hidden md:inline">{mode.questions}</span>
                <span aria-hidden="true" className="hidden text-rule-strong md:inline">
                  /
                </span>
                <span className="num">{mode.minutes}</span>
                <span aria-hidden="true" className="text-rule-strong">
                  /
                </span>
                <span>{mode.available ? mode.note : "Coming soon"}</span>
              </div>

              {isPrimary && (
                <span className="meta mt-1 hidden text-accent sm:block">
                  {savedMode === "quick" ? "Resume where you left off" : "Start here"}
                </span>
              )}
            </div>

            <MoveRight
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 md:hidden ${
                isPrimary ? "text-accent" : "text-rule-strong"
              }`}
              strokeWidth={1.75}
            />
          </button>
        );
      })}
    </div>
  );
}
