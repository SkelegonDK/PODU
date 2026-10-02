import { Component, type ReactNode } from "react";
import { LandingPage } from "./components/LandingPage";
import { WelcomePage } from "./components/WelcomePage";
import { AccountUnavailable, AuthPage } from "./components/AuthPage";
import { ClerkApp } from "./components/ClerkApp";
import { clientConfig } from "./shared/publicConfig";

// This is the only public key compiled into the browser. No secret key is read here.
const publishableKey = clientConfig.clerkPublishableKey;

class AccountErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed)
      return (
        <AuthPage signUp={false}>
          <div className="account-message" role="alert">
            <h2>We couldn’t open PODU.</h2>
            <p>Please try again in a moment.</p>
            <button
              className="button-link"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        </AuthPage>
      );
    return this.props.children;
  }
}

export function App() {
  const path = window.location.pathname;
  if (path === "/welcome")
    return <WelcomePage localPreview={clientConfig.local} />;
  if (!clientConfig.local && publishableKey)
    return (
      <AccountErrorBoundary>
        <ClerkApp publishableKey={publishableKey} />
      </AccountErrorBoundary>
    );

  if (path.startsWith("/sign-up") || path.startsWith("/sign-in"))
    return (
      <AccountUnavailable
        signUp={path.startsWith("/sign-up")}
        localPreview={clientConfig.local}
      />
    );
  if (!clientConfig.local) return <WelcomePage />;
  return (
    <LandingPage
      accountControls={
        <a className="quiet-link" href="/welcome">
          About PODU
        </a>
      }
    />
  );
}

export default App;
