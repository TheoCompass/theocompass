'use client';
import CookieConsent from 'react-cookie-consent';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      
      <CookieConsent
        location="bottom"
        buttonText="Accept"
        cookieName="theocompass-consent"
        style={{ 
          background: "#1e293b", 
          color: "#f1f5f9", 
          fontSize: "14px",
          padding: "12px 24px"
        }}
        buttonStyle={{ 
          background: "#3b82f6", 
          color: "white", 
          fontSize: "14px",
          borderRadius: "6px"
        }}
        expires={365}
        sameSite="strict"
      >
        We use <strong>Google Analytics</strong> to improve your quiz experience. 
        No personal data collected.{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
      </CookieConsent>
    </>
  );
}
