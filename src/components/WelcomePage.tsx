import { ArrowRight, Headphones } from "lucide-react";
import { Brand } from "./Brand";

const conversationIdeas = [
  ["Follow your curiosity", "Why do we see the world so differently?"],
  ["Make room for reflection", "What does a good day look like for me?"],
  ["Think something through", "How could I approach this idea differently?"],
];

export function WelcomePage({
  localPreview = false,
}: {
  localPreview?: boolean;
}) {
  return (
    <div className="paper-theme welcome-page">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Account" className="account-nav">
          <a className="quiet-link" href="/sign-in">
            Sign in
          </a>
          <a className="button-link button-link-small" href="/sign-up">
            Create account
          </a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="hero-copy">
            <p className="eyebrow">For wherever your mind wanders</p>
            <h1 id="welcome-title">
              Good conversations.
              <br />
              New perspectives.
            </h1>
            <p className="hero-description">
              A voice companion for the things on your mind. Explore an
              interest, untangle an idea, or pause and reflect. Just bring your
              curiosity.
            </p>
            <div className="hero-actions">
              <a className="button-link" href="/sign-up">
                Find your conversation{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <p>
                <Headphones size={16} aria-hidden="true" /> A conversation at
                your own pace.
              </p>
            </div>
            {localPreview && (
              <a className="quiet-link preview-link" href="/app">
                Explore the local app{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
          <div className="conversation-art" aria-hidden="true">
            <div className="art-orbit art-orbit-one" />
            <div className="art-orbit art-orbit-two" />
            <span className="art-caption">
              A thought. A question. A new direction.
            </span>
            <div className="thought thought-one">“I’ve been wondering…”</div>
            <div className="thought thought-two">“Let’s explore that.”</div>
            <div className="art-wave">
              {[16, 28, 45, 64, 38, 76, 96, 57, 32, 70, 47, 26, 14].map(
                (height, i) => (
                  <span key={i} style={{ height }} />
                ),
              )}
            </div>
            <span className="art-footnote">
              Space to speak. Space to listen.
            </span>
          </div>
        </section>
        <section className="conversation-ideas" aria-labelledby="ideas-title">
          <div className="ideas-heading">
            <p className="eyebrow">There’s no perfect place to start</p>
            <h2 id="ideas-title">What’s on your mind?</h2>
          </div>
          <div className="ideas-list">
            {conversationIdeas.map(([title, question], i) => (
              <a href="/sign-up" key={title} className="idea-link">
                <span className="idea-number">0{i + 1}</span>
                <span>
                  <strong>{title}</strong>
                  <span>{question}</span>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
        <section className="how-it-works" aria-label="How PODU works">
          <p>Pick a topic.</p>
          <span aria-hidden="true">→</span>
          <p>Choose a conversation style.</p>
          <span aria-hidden="true">→</span>
          <p>Speak your mind.</p>
        </section>
      </main>
      <footer className="site-footer">
        <span>PODU · Made for curious minds.</span>
        <span>You’re talking with AI. Bring your own perspective.</span>
      </footer>
    </div>
  );
}
