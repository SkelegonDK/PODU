import { useEffect, useState, type ReactNode } from "react";
import { ClerkProvider, useAuth, SignIn, UserButton } from "@clerk/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { setTokenProvider } from "../lib/poduApi";
import { clientConfig } from "../shared/publicConfig";

const convex = !clientConfig.local && clientConfig.convexUrl ? new ConvexReactClient(clientConfig.convexUrl) : null;

function Authenticated({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setTokenProvider(() => getToken({ template: "convex" }));
    setReady(true);
    return () => { setTokenProvider(null); };
  }, [getToken]);
  if (!isLoaded || !ready) return <div className="p-8 text-center">Loading your account…</div>;
  if (!isSignedIn) return <div className="min-h-screen flex flex-col items-center justify-center gap-6"><h1 className="text-2xl">Welcome to PODU</h1><SignIn routing="hash" /></div>;
  return <><div className="fixed right-4 top-4 z-40"><UserButton /></div>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (clientConfig.local) return children;
  if (!clientConfig.clerkPublishableKey || !convex) return <div role="alert" className="p-8">Configure Clerk and Convex to start PODU.</div>;
  return <ClerkProvider publishableKey={clientConfig.clerkPublishableKey}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}><Authenticated>{children}</Authenticated></ConvexProviderWithClerk>
  </ClerkProvider>;
}
