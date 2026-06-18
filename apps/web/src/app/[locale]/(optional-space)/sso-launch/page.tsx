"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect } from "react";
import { Trans } from "@/i18n/client";

/**
 * Generic OIDC SSO launch shim: initiates better-auth OAuth2 sign-in and
 * redirects to the provider authorization URL.
 */
export default function SsoLaunchPage() {
  useEffect(() => {
    function fallback() {
      window.location.replace("/login");
    }

    fetch("/api/better-auth/sign-in/oauth2", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "oidc", callbackURL: "/" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { url?: string }) => {
        if (data?.url) {
          window.location.replace(data.url);
        } else {
          fallback();
        }
      })
      .catch(fallback);
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30">
      <div className="text-center">
        <Loader2Icon className="mx-auto mb-4 size-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          <Trans i18nKey="ssoLaunchSigningIn" defaults="Signing you in…" />
        </p>
      </div>
    </div>
  );
}
