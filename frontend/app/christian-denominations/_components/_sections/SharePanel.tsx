"use client";

import {
  ArrowRight,
  BarChart3,
  Download,
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
  Tags,
} from "lucide-react";

/**
 * Share — three visual artefacts, each with its own download.
 *
 * The previous version was three identical text rows, so every button looked
 * like it produced the same file. Each card now previews what you get, says who
 * it is for, and downloads only that artefact.
 */
export function SharePanel({
  isExporting,
  isExportingLabels,
  isExportingFingerprint,
  onDownloadImage,
  onDownloadLabels,
  onDownloadFingerprint,
  onRetake,
}: {
  isExporting: boolean;
  isExportingLabels: boolean;
  isExportingFingerprint: boolean;
  onDownloadImage: () => void;
  onDownloadLabels: () => void;
  onDownloadFingerprint: () => void;
  onRetake: () => void;
}) {
  const artefacts = [
    {
      key: "summary",
      title: "Match summary",
      what: "Your #1 tradition, the runners-up and the compass in one square image.",
      use: "Best for posting on social",
      icon: ImageIcon,
      busy: isExporting,
      onDownload: onDownloadImage,
      accent: "bg-punch",
      tint: "bg-punch-soft",
    },
    {
      key: "fingerprint",
      title: "Fingerprint",
      what: "All 14 axes, your position on each one, printed as a single chart.",
      use: "Best for comparing with a friend",
      icon: BarChart3,
      busy: isExportingFingerprint,
      onDownload: onDownloadFingerprint,
      accent: "bg-cerulean-600",
      tint: "bg-cerulean-100",
    },
    {
      key: "labels",
      title: "Belief labels",
      what: "Every theological label your answers produced, grouped and weighted.",
      use: "Best for keeping for yourself",
      icon: Tags,
      busy: isExportingLabels,
      onDownload: onDownloadLabels,
      accent: "bg-cerulean-900",
      tint: "bg-cerulean-100",
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="border-b border-rule pb-2">
        <h2 className="font-display text-xl text-ink">Keep and share your results</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          Three separate images. Pick the one you need — nothing is uploaded.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-3">
        {artefacts.map((artefact) => {
          const Icon = artefact.icon;

          return (
            <div
              key={artefact.key}
              className="flex items-center gap-3 border border-rule bg-paper-raised p-2.5 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:p-0"
            >
              {/* Preview: a strip on desktop, a thumbnail on a phone. Three
                  full cards stacked meant only one download was ever visible. */}
              <div
                className={`relative grid h-12 w-12 shrink-0 place-items-center border border-rule md:h-20 md:w-full md:border-0 md:border-b ${artefact.tint}`}
              >
                <Icon
                  aria-hidden="true"
                  className="h-5 w-5 text-cerulean-900 md:h-6 md:w-6"
                  strokeWidth={1.5}
                />
                <span className={`absolute inset-x-0 bottom-0 h-[3px] ${artefact.accent}`} />
              </div>

              <div className="min-w-0 flex-1 md:flex md:flex-col md:p-3.5">
                <h3 className="font-display text-sm text-ink md:text-base">
                  {artefact.title}
                </h3>
                <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-ink-soft md:mt-1.5 md:line-clamp-none md:flex-1 md:text-xs md:leading-relaxed">
                  {artefact.what}
                </p>
                <p className="meta mt-1 hidden md:block">{artefact.use}</p>

                <button
                  type="button"
                  onClick={artefact.onDownload}
                  disabled={artefact.busy}
                  aria-live="polite"
                  className="mt-1.5 inline-flex shrink-0 items-center justify-center gap-1 bg-cerulean-900 px-2 py-1.5 text-2xs font-semibold text-white transition-colors hover:bg-cerulean-800 disabled:cursor-not-allowed disabled:opacity-60 md:mt-3 md:w-full md:px-3 md:py-2 md:text-xs"
                >
                  <Download aria-hidden="true" className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2} />
                  {artefact.busy ? "Generating" : "Download PNG"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <a
          href="https://www.reddit.com/r/TheoCompass/submit/?type=IMAGE"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 border border-rule-strong px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-cerulean-600 hover:text-cerulean-800"
        >
          Post on r/TheoCompass
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
        </a>
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-1.5 border border-rule-strong px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-cerulean-600 hover:text-cerulean-800"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
          Retake the quiz
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 border-t border-rule pt-6 md:grid-cols-2">
        <div>
          <h3 className="meta">Coming next</h3>
          <p className="mt-1.5 text-sm text-ink-soft">
            A historical and creedal timeline, plus a creedal alignment score.
          </p>
        </div>
        <div>
          <h3 className="meta">Support the project</h3>
          <p className="mt-1.5 text-sm text-ink-soft">
            Help expand the database to 230+ denominations and build the full v2.0
            experience.
          </p>
          <a
            href="https://ko-fi.com/oroq"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-cerulean-800 underline decoration-cerulean-300 underline-offset-4 transition-colors hover:decoration-cerulean-600"
          >
            Support on Ko-Fi
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
          </a>
        </div>
      </div>
    </div>
  );
}

