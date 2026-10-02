declare const __PODU_PUBLIC_CONFIG__: {
  local: boolean;
  clerkPublishableKey: string;
  convexUrl: string;
};

export const clientConfig = typeof __PODU_PUBLIC_CONFIG__ === "undefined"
  ? { local: true, clerkPublishableKey: "", convexUrl: "" }
  : __PODU_PUBLIC_CONFIG__;
