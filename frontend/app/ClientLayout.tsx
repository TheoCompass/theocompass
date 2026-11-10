'use client';
import CookieConsent from 'react-cookie-consent';

/**
 * The consent bar.
 *
 * It was the only surface in the product still styled with literals -
 * `#1d3557` background, `#457b9d` button, `borderRadius: 0.375rem` - so it was
 * also the only one that could drift from the palette without anyone noticing.
 * `disableStyles` hands the whole thing to Tailwind, and the bar now reads as a
 * footer strip: navy ground, hairline top, an accent button in the same caps
 * treatment as every other label.
 *
 * It sits at z-60 because the landing page's mobile call-to-action is at z-40;
 * without that, a first visit stacks two bars on top of each other.
 *
 * Accept-only is deliberate. Analytics loads unconditionally from `layout.tsx`,
 * so a "Decline" button here would set a cookie and change nothing - a choice
 * that lies. Adding a real one means gating gtag behind consent first.
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}

      <CookieConsent
        disableStyles
        disableButtonStyles
        location="bottom"
        buttonText="Accept"
        cookieName="theocompass-consent"
        expires={365}
        sameSite="strict"
        ariaAcceptLabel="Accept analytics cookies"
        containerClasses="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-cerulean-800 bg-ink px-4 py-3 text-mini text-paper md:px-6"
        contentClasses="min-w-0 flex-1 leading-snug"
        buttonWrapperClasses="shrink-0"
        buttonClasses="bg-accent px-3 py-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-accent-deep"
      >
        We use{' '}
        <strong className="font-semibold text-cerulean-200">Google Analytics</strong> to improve
        your quiz experience. No personal data collected.{' '}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-cerulean-200 underline decoration-cerulean-400 underline-offset-2 transition-colors hover:decoration-cerulean-200"
        >
          Privacy policy
        </a>
      </CookieConsent>
    </>
  );
}
