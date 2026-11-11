"use client";

import Image from "next/image";
import { forwardRef, type ReactNode } from "react";
import { APP_STAGE, APP_VERSION } from "../../../lib/site";

/**
 * The chrome every download wears.
 *
 * Three exports were three dialects: one navy masthead tinted punch, one
 * purple, one sage, each with a no-op `from-ink via-ink to-ink` gradient, a
 * `border-b-4` in that hue, a shadowed circular logo and a radial wash. The hue
 * carried nothing - the report's name already says which report it is - and
 * three colours for one product is the opposite of "recognisably us".
 *
 * The masthead is now the same `chrome-band` the in-app header uses, so a
 * download looks like a photograph of the instrument rather than a flyer. The
 * footer stays navy, because a report wants a heavy close, but its type is set
 * in cerulean tints: the old `text-ink-muted` on navy measured 2.2:1, i.e. the
 * line "Built for informed decision" was invisible in every file we shipped.
 */
export interface ExportFrameProps {
  /** The report's own name, printed under the wordmark. */
  artefact: string;
  modeLabel: string;
  questionCount: number;
  timestamp: string;
  /** One line above the timestamp, e.g. which filter the export reflects. */
  footnote?: string;
  children: ReactNode;
}

const ExportFrame = forwardRef<HTMLDivElement, ExportFrameProps>(function ExportFrame(
  { artefact, modeLabel, questionCount, timestamp, footnote, children },
  ref
) {
  return (
    <div
      ref={ref}
      className="absolute w-[960px] overflow-hidden bg-paper-raised font-sans text-ink"
      style={{ left: "-9999px", top: "0" }}
    >
      {/* ─── MASTHEAD ─── */}
      <header className="chrome-band px-10 py-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <div>
              <p className="font-display text-lg leading-none text-ink">TheoCompass</p>
              <p className="meta mt-1">{artefact}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="meta">{modeLabel}</p>
            <p className="meta mt-1">
              {questionCount} questions
            </p>
          </div>
        </div>
      </header>

      {children}

      {/* ─── FOOTER ───
          Light, because the product's own footer is light: the navy band made
          the download look like a different product, and it also meant every
          line needed a second colour decision (the old one, in ink-muted on
          navy, measured 2.2:1 - i.e. invisible). Same order and wording as the
          landing footer: verse, then the project line, then the colophon. */}
      <footer className="border-t border-rule bg-paper px-10 py-6 text-center">
        <p className="font-display text-base italic leading-snug text-ink-soft">
          &ldquo;He is before all things, and in him all things hold together.&rdquo; &ndash;
          Colossians 1:17
        </p>
        <p className="mt-3 text-2xs text-ink-muted">Built for informed decision, not persuasion.</p>
        {footnote && <p className="mt-1 text-2xs text-ink-muted">{footnote}</p>}
        <div className="mx-auto my-3 h-px w-12 bg-rule-strong" />
        <p className="font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted">
          TheoCompass {APP_VERSION} · {APP_STAGE}
        </p>
        <p className="mt-1 font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted">
          theocompass.com · Generated {timestamp}
        </p>
      </footer>
    </div>
  );
});

export default ExportFrame;
