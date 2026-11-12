"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { CERTAINTY_MARK, CERTAINTY_SLOTS, SURFACE } from "../lib/palette";
import { APP_STAGE, APP_VERSION } from "../lib/site";
import { FINGERPRINT_AXIS_COUNT } from "./christian-denominations/_constants";
import { LiveStats } from "./_components/_LiveStats";
import { RoadmapMilestones } from "./_components/_RoadmapMilestones";

/**
 * The landing page, reworked for a phone first.
 *
 * Three things were doing damage: a full-bleed photo behind a 68vh hero (slow,
 * and unreadable at 375px), a 800px vertical timeline you had to scroll past to
 * reach anything, and a "Support the Project" section that repeated a link
 * already in the footer. The photo is a dark texture from md up and an
 * uncropped 2.4:1 band below it, the roadmap is a snap carousel on phones and a
 * numbered timeline from md up, and every call to action is the same accent.
 *
 * The roadmap section is `<RoadmapMilestones />` rather than markup here: the
 * milestones are shared with `/roadmap`, and the hand-written phases that used
 * to live in this file disagreed with the real plan.
 */


/**
 * The four things the beta adds, each with a miniature of the real thing.
 *
 * This was four flat <li> rows: the plainest block on the page, describing the
 * most visual part of the product. The previews below are drawn from the same
 * palette and the same marks the app itself uses — family hues, the axis rail
 * with its gap band, the essentiality ramp — so the section shows the product
 * instead of listing it. No images, no data, nothing extra to download.
 */
const FEATURES = [
  {
    title: "230+ denominations",
    body: "The full theological database, spanning every major branch of Christianity with sourced descriptions.",
  },
  {
    title: "Results you can read",
    body: "A compass you can tap, a 14-axis fingerprint with real contrast, and a label cloud that separates how sure you are from how essential the belief is.",
  },
  {
    title: "Side-by-side comparison",
    body: "Expand any tradition to see axis-by-axis agreement with your own profile: where you overlap, and where you diverge.",
  },
  {
    title: "Shareable cards",
    body: "Download your summary, labels or fingerprint as an image. No account, no email, nothing stored.",
  },
] as const;

const PREVIEW_HUES = ["#b56576", "#8e7ab5", "#5b7fb5", "#4f9d9b", "#6b9a58", "#cf7a45", "#c8963e"];

/** Hand-placed so the swarm has gaps instead of a grid (no layout randomness). */
const PREVIEW_DOTS: Array<[number, number]> = [
  [6, 22], [16, 54], [26, 16], [24, 78], [34, 40], [40, 8], [44, 64], [52, 26],
  [56, 84], [60, 46], [66, 14], [70, 70], [78, 38], [82, 58], [86, 20], [92, 78],
  [12, 38], [30, 62], [48, 12], [64, 92], [88, 46], [96, 30],
];

function BetaDatabasePreview() {
  return (
    <div className="relative h-24 w-full" aria-hidden="true">
      {PREVIEW_DOTS.map(([x, y], i) => (
        <span
          key={`${x}-${y}`}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ left: `${x}%`, top: `${y}%`, backgroundColor: PREVIEW_HUES[i % PREVIEW_HUES.length] }}
        />
      ))}
    </div>
  );
}

function BetaCompassPreview() {
  return (
    <div className="chart-grid relative h-24 w-full bg-paper" aria-hidden="true">
      <span className="absolute left-1/2 top-0 h-full w-px bg-rule" />
      <span className="absolute left-0 top-1/2 h-px w-full bg-rule" />
      <span className="absolute h-1.5 w-1.5 rounded-full bg-[#b56576]" style={{ left: "24%", top: "28%" }} />
      <span className="absolute h-1.5 w-1.5 rounded-full bg-[#6b9a58]" style={{ left: "70%", top: "22%" }} />
      <span className="absolute h-1.5 w-1.5 rounded-full bg-[#c8963e]" style={{ left: "34%", top: "72%" }} />
      <span className="absolute h-1.5 w-1.5 rounded-full bg-cerulean-600" style={{ left: "78%", top: "66%" }} />
      {/* You: punch fill, navy ring, and the breathing halo from the real chart */}
      <span
        className="halo-breathe absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-punch-500"
        style={{ left: "56%", top: "50%" }}
      />
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cerulean-900 bg-punch-500"
        style={{ left: "56%", top: "50%" }}
      />
    </div>
  );
}

const PREVIEW_AXES = [
  { label: "Theology", you: 34, them: 68 },
  { label: "Practice", you: 58, them: 51 },
];

function BetaComparePreview() {
  return (
    <div className="w-full space-y-3" aria-hidden="true">
      {PREVIEW_AXES.map((axis) => {
        const gap = Math.abs(axis.them - axis.you);
        return (
          <div key={axis.label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="meta">{axis.label}</span>
              <span className="font-mono text-3xs text-ink-muted">{gap} apart</span>
            </div>
            <div className="relative h-2 w-full bg-muted-soft">
              <span
                className="absolute top-0 h-full"
                style={{
                  left: `${Math.min(axis.you, axis.them)}%`,
                  width: `${gap}%`,
                  backgroundColor: "#7d5ba6",
                  opacity: 0.3,
                }}
              />
              <span
                className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper bg-cerulean-900"
                style={{ left: `${axis.you}%` }}
              />
              <span
                className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-cerulean-900 bg-paper-raised"
                style={{ left: `${axis.them}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PREVIEW_CARDS = [
  { text: "The Trinity", tier: "Core Dogma", filled: 3 },
  { text: "Believer's baptism", tier: "Secondary", filled: 2 },
  { text: "Women's ordination", tier: "Non-Essential", filled: 1 },
];

function BetaExportPreview() {
  return (
    <div className="w-full border border-rule bg-paper-raised" aria-hidden="true">
      <div className="flex items-center justify-between bg-cerulean-900 px-2 py-1.5">
        <span className="font-serif text-3xs text-paper">TheoCompass</span>
        <span className="h-1 w-1 rounded-full bg-punch-500" />
      </div>
      <div className="space-y-1 p-2">
        {PREVIEW_CARDS.map((card) => (
          <div
            key={card.text}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-[2px] border border-rule bg-paper-raised px-1.5 py-1"
          >
            <span className="text-3xs leading-tight text-ink">{card.text}</span>
            <span className="shrink-0 rounded-[2px] bg-muted-soft px-1 py-0.5 text-[0.5rem] font-semibold leading-none text-ink-soft">
              {card.tier}
            </span>
            {/* Three ticks, matching CERTAINTY_SLOTS: three slots, four states.
                The colours are imported, not literals: this preview was the last
                place in the app that spelled the cerulean out by hand. */}
            <span className="ml-auto flex items-end gap-[2px]">
              {Array.from({ length: CERTAINTY_SLOTS }, (_, slot) => (
                <span
                  key={slot}
                  className="h-1.5 w-[3px]"
                  style={{
                    backgroundColor: slot < card.filled ? CERTAINTY_MARK : SURFACE.ruleStrong,
                  }}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const BETA_PREVIEWS = [BetaDatabasePreview, BetaCompassPreview, BetaComparePreview, BetaExportPreview];

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFeature, setOpenFeature] = useState(0);

  // Escape and a resize to desktop both close the menu. Without the second one
  // the drawer survives a resize as an invisible open state, which the next
  // click on the hamburger then reads as "already open".
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 48rem)");
    const onBreakpoint = () => {
      if (desktop.matches) setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpoint);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpoint);
    };
  }, [isMenuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-paper pb-16 font-sans text-ink md:pb-0">
      {/* 1. Header - one row, one accent, nothing rounded */}
      <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-rule bg-paper/95 px-4 py-2.5 backdrop-blur-md md:px-12 md:py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="TheoCompass"
            width={40}
            height={40}
            className="h-8 w-8 object-contain md:h-9 md:w-9"
            priority
          />
          <span className="font-serif text-lg font-bold tracking-tight text-ink md:text-xl">TheoCompass</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm font-medium text-ink-muted md:flex">
          <Link href="#products" className="transition-colors hover:text-ink">
            The quiz
          </Link>
          <Link href="/roadmap" className="transition-colors hover:text-ink">
            Roadmap
          </Link>
          <a
            href="https://www.reddit.com/r/TheoCompass"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-ink"
          >
            Community
          </a>
          <Link
            href="/christian-denominations"
            className="border border-cerulean-900 bg-cerulean-900 px-3 py-1.5 text-2xs font-semibold text-paper transition-colors hover:bg-cerulean-800"
          >
            Start the quiz
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="p-2 text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink md:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"}
            />
          </svg>
        </button>

        {isMenuOpen && (
          <>
            {/* The drawer used to float over a page that kept scrolling behind
                it, with nothing saying where it ended. A scrim closes it and
                marks the boundary; `top-full` starts it under the header, which
                is why it can live inside a `backdrop-blur` parent at all. */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setIsMenuOpen(false)}
              className="animate-fade-in absolute left-0 top-full h-[100dvh] w-full cursor-default bg-ink/25 md:hidden"
            />

            <div
              id="mobile-menu"
              className="animate-fade-in absolute left-0 top-full z-10 w-full border-b border-rule bg-paper-raised md:hidden"
            >
              <nav className="px-4 text-mini font-medium text-ink-soft">
                <Link
                  href="#products"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-b border-rule py-3 transition-colors hover:text-ink"
                >
                  The quiz
                </Link>
                <Link
                  href="/roadmap"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-b border-rule py-3 transition-colors hover:text-ink"
                >
                  Roadmap
                </Link>
                <a
                  href="https://www.reddit.com/r/TheoCompass"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-b border-rule py-3 transition-colors hover:text-ink"
                >
                  Community
                </a>
                <div className="py-3">
                  <Link
                    href="/christian-denominations"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
                  >
                    Start the quiz
                    <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                  </Link>
                </div>
              </nav>
            </div>
          </>
        )}
      </header>

      {/* 2. Hero - one artwork layer at every width, cropped from the centre */}
      <main id="main-content" className="relative flex w-full flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(120%_100%_at_50%_0%,#2c5175_0%,#1d3557_55%,#14273f_100%)]" />

        {/* The banner is 4912x2048 and its middle third is the compass; the outer
            thirds are empty texture. Cropping them off with `object-cover` shows
            the part that matters, at a readable size, instead of squeezing the
            whole frame into a letterbox band on a phone. */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/banner.png"
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover object-center opacity-50 md:opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-cerulean-900/45 via-cerulean-900/60 to-cerulean-900" />
        </div>

        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center px-4 py-12 text-center md:py-24">
          {/* The badge used to be 10px cerulean-200 with a 40%-opacity border on
              a navy gradient: the first thing on the page was the least visible.
              Punch fill, a live dot, and a slow sweep — all killed by the global
              reduced-motion guard in globals.css. */}
          <span
            className="relative mb-5 inline-flex animate-fade-in-up items-center gap-2 overflow-hidden border border-punch-500/50 bg-punch-500/20 px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-paper"
            style={{ animationFillMode: "both" }}
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-punch-300 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-punch-500" />
            </span>
            {APP_VERSION} {APP_STAGE.toLowerCase()}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-shimmer" />
          </span>

          <h1
            className="animate-fade-in-up font-display text-[clamp(1.9rem,7vw,3.5rem)] font-semibold leading-[1.05] tracking-tight text-paper"
            style={{ animationDelay: "70ms", animationFillMode: "both" }}
          >
            Find your theological <span className="text-cerulean-300">alignment.</span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl animate-fade-in-up text-body leading-relaxed text-cerulean-100 md:text-base"
            style={{ animationDelay: "140ms", animationFillMode: "both" }}
          >
            Match your beliefs against <strong className="font-bold text-paper">230+ Christian denominations</strong>{" "}
            across {FINGERPRINT_AXIS_COUNT} dimensions. We look at <strong className="font-bold text-paper">what</strong> you believe, your
            certainty, and your posture toward everyone else.
          </p>

          <div
            className="mt-8 flex w-full animate-fade-in-up flex-col gap-3 sm:w-auto sm:flex-row"
            style={{ animationDelay: "220ms", animationFillMode: "both" }}
          >
            <Link
              href="/christian-denominations"
              className="border border-paper bg-paper px-6 py-3 text-center text-sm font-semibold text-cerulean-900 transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-cerulean-100 motion-reduce:hover:translate-y-0"
            >
              Take the quiz
            </Link>
            <Link
              href="#roadmap"
              className="px-6 py-3 text-center text-sm font-semibold text-cerulean-100 underline decoration-cerulean-300/50 underline-offset-4 transition-colors hover:text-paper hover:decoration-cerulean-300"
            >
              What comes next
            </Link>
          </div>
        </div>
      </main>


      {/* 3. The one live product - a single card, not a pitch deck */}
      <section id="products" className="w-full border-b border-rule bg-paper px-4 py-12 md:px-6 md:py-16">
        <div className="reveal-static mx-auto max-w-3xl border border-rule bg-paper-raised p-5 md:p-8">
          <p className="meta mb-2 text-cerulean-800">Now in open beta</p>
          <h2 className="font-serif text-2xl font-bold text-ink md:text-3xl">Denomination alignment quiz</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft md:text-base">
            230+ Christian denominations across history, from Apostolic to Pentecostal. Answer honestly and the compass
            shows where you sit, the fingerprint shows how strongly you hold it, and the label cloud names the beliefs
            underneath.
          </p>

          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-4 text-2xs">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-muted">Dimensions</dt>
              <dd className="num font-mono font-semibold text-ink">{FINGERPRINT_AXIS_COUNT}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-muted">Questions</dt>
              <dd className="num font-mono font-semibold text-ink">30&ndash;120</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-muted">Traditions</dt>
              <dd className="num font-mono font-semibold text-ink">230+</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-muted">Account needed</dt>
              <dd className="font-semibold text-ink">No</dd>
            </div>
          </dl>

          <Link
            href="/christian-denominations"
            className="mt-5 inline-block border border-cerulean-900 bg-cerulean-900 px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-cerulean-800"
          >
            Start the quiz
          </Link>
        </div>

        <LiveStats />
      </section>

      {/* 4. What the beta adds - an accordion that shows the product, not tells */}
      <section className="w-full border-b border-rule bg-paper-raised px-4 py-12 md:px-6 md:py-16">
        <div className="reveal-static mx-auto max-w-3xl">
          <h2 className="font-serif text-2xl font-bold text-ink md:text-3xl">What the beta adds</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft md:text-base">
            Four things changed in this build. Open one to see what it looks like.
          </p>

          <div className="mt-6 divide-y divide-rule border-y border-rule">
            {FEATURES.map((feature, index) => {
              const isOpen = openFeature === index;
              const Preview = BETA_PREVIEWS[index];
              return (
                <div key={feature.title}>
                  <button
                    type="button"
                    onClick={() => setOpenFeature(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                    aria-controls={`beta-panel-${index}`}
                    className="group flex w-full items-center gap-3 py-4 text-left"
                  >
                    <span className="num font-mono text-3xs text-ink-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-sm font-bold text-ink transition-colors group-hover:text-accent-deep">
                      {feature.title}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      strokeWidth={2}
                      className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-300 motion-reduce:transition-none ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* 0fr -> 1fr: the panel animates to its own height without a
                      magic max-height, and simply snaps open where the
                      transition is unsupported. */}
                  <div
                    id={`beta-panel-${index}`}
                    aria-hidden={!isOpen}
                    className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="grid gap-4 pb-5 pl-7 sm:grid-cols-[1fr_14rem] sm:items-center">
                        <p className="text-sm leading-relaxed text-ink-soft">{feature.body}</p>
                        <div
                          className={`w-full border border-rule bg-paper p-2 ${
                            isOpen ? "animate-boot" : ""
                          }`}
                        >
                          <Preview />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-sm leading-relaxed text-ink-soft">
            Questions, corrections or calibration arguments are welcome in the{" "}
            <a
              href="https://www.reddit.com/r/TheoCompass"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-cerulean-900 underline decoration-cerulean-300 underline-offset-2 hover:decoration-cerulean-900"
            >
              community
            </a>
            .
          </p>
        </div>
      </section>

      {/* 5. Roadmap - three milestones here, the eight phases on /roadmap */}
      <RoadmapMilestones />

      {/* 6. Footer - the support link lives here instead of in its own section */}
      <footer className="w-full bg-paper-raised px-4 py-10 md:px-6 md:py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="max-w-[34ch] font-serif text-base italic leading-snug text-ink-soft md:max-w-none md:text-lg">
            &ldquo;He is before all things, and in him all things hold together.&rdquo; &ndash; Colossians 1:17
          </p>

          <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            <Link href="/roadmap" className="text-ink-soft transition-colors hover:text-ink">
              Full roadmap
            </Link>
            <a
              href="https://www.reddit.com/r/TheoCompass"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-soft transition-colors hover:text-ink"
            >
              Community
            </a>
            <a
              href="https://ko-fi.com/oroq"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-soft transition-colors hover:text-punch-ink"
            >
              Support on Ko-fi
            </a>
            <a
              href="mailto:theocompass.project@gmail.com"
              className="text-ink-soft transition-colors hover:text-ink"
            >
              Contact
            </a>
          </nav>

          <p className="mt-6 max-w-md border-t border-rule pt-4 text-xs leading-relaxed text-ink-muted">
            Each month is dozens of hours of research and code. If it has been useful,{" "}
            <a
              href="https://ko-fi.com/oroq"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-rule-strong underline-offset-2 hover:text-ink"
            >
              a coffee
            </a>{" "}
            keeps it moving.
          </p>

          <p className="mt-4 text-xs text-ink-muted">Built for informed decision, not persuasion.</p>
          <p className="mt-1 text-xs text-ink-muted">&copy; 2026 Oroq / TheoCompass Project</p>
        </div>
      </footer>

      {/*
        Sticky mobile call to action. The hero button scrolls away on a phone, so
        the one action that matters stays reachable; the padding on the root keeps
        it from covering the footer.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper-raised/95 px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <Link
          href="/christian-denominations"
          className="block border border-cerulean-900 bg-cerulean-900 px-4 py-2.5 text-center text-sm font-semibold text-paper"
        >
          Start the quiz
        </Link>
      </div>
    </div>
  );
}

