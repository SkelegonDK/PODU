import { verifyToken } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = `http_${status}`,
  ) {
    super(message);
  }
}

export function isLocalMode(): boolean {
  return process.env.PODU_LOCAL_MODE === "true";
}

export function publicConfig() {
  return {
    local: isLocalMode(),
    clerkPublishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ??
      process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY ??
      process.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY ??
      "",
    convexUrl: process.env.CONVEX_URL ?? "",
  };
}

const requests = new WeakMap<Request, ConvexHttpClient>();

export async function authorize(req: Request): Promise<void> {
  if (isLocalMode()) {
    const hostname = new URL(req.url).hostname;
    if (
      process.env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(hostname)
    ) {
      throw new HttpError(
        503,
        "Local demo mode is only available on localhost in development.",
      );
    }
    return;
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  const url = process.env.CONVEX_URL;
  if (!secretKey || !url)
    throw new HttpError(
      503,
      "Clerk and Convex must be configured before starting Podu.",
      "backend_not_configured",
    );
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  try {
    await verifyToken(token, {
      secretKey,
      audience: "convex",
      authorizedParties: (
        process.env.PODU_ALLOWED_ORIGINS ??
        "http://localhost:3000,http://127.0.0.1:3000"
      )
        .split(",")
        .map((s) => s.trim()),
    });
  } catch {
    throw new HttpError(
      401,
      "Your session expired. Sign in again.",
      "unauthenticated",
    );
  }
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  requests.set(req, client);
}

export function backend(req: Request): ConvexHttpClient | null {
  if (isLocalMode()) return null;
  const client = requests.get(req);
  if (!client) throw new HttpError(401, "Sign in to continue.");
  return client;
}
