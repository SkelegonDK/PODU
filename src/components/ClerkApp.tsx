import { useEffect, useLayoutEffect, useState } from "react";
import {
  ClerkProvider,
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  SignIn,
  SignUp,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/react";
import { shadcn } from "@clerk/ui/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { clientConfig } from "../shared/publicConfig";
import { AuthPage } from "./AuthPage";
import { WelcomePage } from "./WelcomePage";
import { LandingPage } from "./LandingPage";
import { configureAccessToken } from "@/lib/poduApi";

const convex = clientConfig.convexUrl
  ? new ConvexReactClient(clientConfig.convexUrl)
  : null;

const appearance = {
  theme: shadcn,
  variables: {
    fontFamily: "'Uncut Sans', sans-serif",
    borderRadius: "0.75rem",
    colorInput: "var(--card)",
    colorInputForeground: "var(--foreground)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorWarning: "var(--pale-sky)",
    colorDanger: "var(--destructive)",
  },
  options: { socialButtonsVariant: "blockButton" as const },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none" },
    card: { boxShadow: "none", border: "1px solid var(--border)" },
    formButtonPrimary: { minHeight: "48px" },
    formFieldInput: {
      minHeight: "48px",
      fontSize: "16px",
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
    },
    socialButtons: { display: "grid", gridTemplateColumns: "1fr", gap: "8px" },
    // Keep branding readable over Clerk's tinted development overlay.
    footer: { "& p": { color: "var(--foreground)" } },
    socialButtonsBlockButton: { minHeight: "48px", color: "var(--foreground)" },
    socialButtonsBlockButtonText: { color: "var(--foreground)" },
    footerActionText: { color: "var(--muted-foreground)" },
    formFieldInputShowPasswordButton: { minWidth: "44px", minHeight: "44px" },
    userButtonTrigger: { minWidth: "44px", minHeight: "44px" },
  },
};

function AccountLoading() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaiting(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <AuthPage signUp={window.location.pathname.startsWith("/sign-up")}>
      <div className="account-message" role="status">
        <h2>
          {waiting
            ? "This is taking a little longer."
            : "Getting things ready…"}
        </h2>
        <p>
          {waiting
            ? "Check your connection, then try again."
            : "Your account will be ready in a moment."}
        </p>
        {waiting && (
          <button
            className="button-link"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        )}
      </div>
    </AuthPage>
  );
}

function AccountFailure() {
  return (
    <AuthPage signUp={window.location.pathname.startsWith("/sign-up")}>
      <div className="account-message" role="alert">
        <h2>We couldn’t load account access.</h2>
        <p>Please check your connection and try again.</p>
        <button
          className="button-link"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
        <a href="/welcome" className="quiet-link">
          Back to PODU
        </a>
      </div>
    </AuthPage>
  );
}

function ClerkRoutes() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const path = window.location.pathname;
  const signUp = path.startsWith("/sign-up");
  const isAuthPage = signUp || path.startsWith("/sign-in");
  useLayoutEffect(() => {
    if (isSignedIn)
      return configureAccessToken(() => getToken({ template: "convex" }));
  }, [isSignedIn, getToken]);
  useEffect(() => {
    if (isSignedIn && isAuthPage) window.location.replace("/");
  }, [isSignedIn, isAuthPage]);

  if (isSignedIn && isAuthPage) return <AccountLoading />;
  if (isAuthPage)
    return (
      <AuthPage signUp={signUp}>
        {signUp ? (
          <SignUp routing="hash" signInUrl="/sign-in" forceRedirectUrl="/" />
        ) : (
          <SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl="/" />
        )}
      </AuthPage>
    );
  if (!isSignedIn || path === "/welcome") return <WelcomePage />;
  return (
    <LandingPage
      userName={user?.firstName ?? undefined}
      accountControls={<UserButton />}
    />
  );
}

export function ClerkApp({ publishableKey }: { publishableKey: string }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={appearance}
      localization={{
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Make a little room for your curiosity.",
          },
        },
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in and follow your next thought.",
          },
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      <ClerkLoading>
        <AccountLoading />
      </ClerkLoading>
      <ClerkFailed>
        <AccountFailure />
      </ClerkFailed>
      <ClerkLoaded>
        {convex ? (
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <ClerkRoutes />
          </ConvexProviderWithClerk>
        ) : (
          <ClerkRoutes />
        )}
      </ClerkLoaded>
    </ClerkProvider>
  );
}
