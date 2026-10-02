import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./Brand";

export function AuthPage({
  signUp,
  children,
}: {
  signUp: boolean;
  children: ReactNode;
}) {
  return (
    <div className="paper-theme auth-page">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <a href="/welcome" className="quiet-link">
          <ArrowLeft size={16} aria-hidden="true" /> Back to PODU
        </a>
      </header>
      <main id="main-content" tabIndex={-1} className="auth-layout">
        <section className="auth-intro">
          <p className="eyebrow">A little room to think</p>
          <h1>
            {signUp
              ? "Your curiosity\nhas a place here."
              : "Welcome back.\nWhat’s on your mind?"}
          </h1>
          <p>
            {signUp
              ? "Start with something you’re interested in. See where the conversation takes you."
              : "A new question, a familiar interest, or something you want to think through. Let’s begin."}
          </p>
          <div className="auth-note">
            <span aria-hidden="true">↗</span> No script. No perfect answer. Just
            you, thinking out loud.
          </div>
        </section>
        <section
          className="auth-form"
          aria-label={signUp ? "Create your PODU account" : "Sign in to PODU"}
        >
          {children}
        </section>
      </main>
      <footer className="site-footer">
        <span>PODU · Made for curious minds.</span>
        <span>You’re talking with AI.</span>
      </footer>
    </div>
  );
}

export function AccountUnavailable({ signUp }: { signUp: boolean }) {
  return (
    <AuthPage signUp={signUp}>
      <div className="account-message" role="status">
        <h2>Accounts are coming soon.</h2>
        <p>
          Account access isn’t available in this preview yet. You can still
          explore the local conversation experience.
        </p>
        <a href="/app" className="button-link">
          Explore PODU
        </a>
        <a href="/welcome" className="quiet-link">
          Back to the welcome page
        </a>
      </div>
    </AuthPage>
  );
}
