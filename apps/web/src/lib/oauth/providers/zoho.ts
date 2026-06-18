import "server-only";

import type { OAuthClient, OAuthTokens, UserInfo } from "../types";
import { handleOAuthError } from "./base";

interface ZohoOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  dc?: string;
  callbackUrl?: string;
  onConnect?: (params: {
    providerAccountId: string;
    userInfo: UserInfo;
    provider: string;
    tokens: OAuthTokens;
  }) => Promise<void>;
}

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  error?: string;
}

interface ZohoUserInfoResponse {
  AAID?: string;
  Email?: string;
  Display_Name?: string;
  error?: string;
}

export class ZohoOAuthClient implements OAuthClient {
  provider = "zoho";
  private clientId: string;
  private clientSecret: string;
  private dc: string;
  private callbackUrl: string;
  scopes: string[];
  onConnect?: (params: {
    providerAccountId: string;
    userInfo: UserInfo;
    provider: string;
    tokens: OAuthTokens;
  }) => Promise<void>;

  constructor({
    clientId,
    clientSecret,
    dc = "com",
    callbackUrl = "",
    onConnect,
  }: ZohoOAuthClientConfig) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.dc = dc;
    this.callbackUrl = callbackUrl;
    this.scopes = ["ZohoCalendar.freebusy.READ", "AaaServer.profile.READ"];
    this.onConnect = onConnect;
  }

  private authBaseUrl(): string {
    return `https://accounts.zoho.${this.dc}/oauth/v2`;
  }

  getAuthorizationUrl(state: string, _codeVerifier: string): URL {
    const url = new URL(`${this.authBaseUrl()}/auth`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("scope", this.scopes.join(" "));
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url;
  }

  async exchangeCode(
    code: string,
    _codeVerifier: string,
  ): Promise<OAuthTokens> {
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        code,
      });

      const res = await fetch(`${this.authBaseUrl()}/token`, {
        method: "POST",
        body: params,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const data = (await res.json()) as ZohoTokenResponse;

      if (!res.ok || data.error) {
        throw new Error(
          `Zoho token exchange failed: ${data.error ?? res.status} body=${JSON.stringify(data)}`,
        );
      }

      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        scopes: this.scopes,
      };
    } catch (error) {
      handleOAuthError(error);
    }
  }

  async getUserInfo(tokens: OAuthTokens): Promise<UserInfo> {
    try {
      const res = await fetch(
        `https://accounts.zoho.${this.dc}/oauth/user/info`,
        {
          headers: { Authorization: `Zoho-oauthtoken ${tokens.accessToken}` },
        },
      );

      if (!res.ok) {
        throw new Error(`Zoho user info failed: ${res.status}`);
      }

      const data = (await res.json()) as ZohoUserInfoResponse;

      if (!data.AAID || !data.Email) {
        throw new Error("Missing required user information from Zoho");
      }

      return {
        id: data.AAID,
        email: data.Email,
        name: data.Display_Name,
      };
    } catch (error) {
      handleOAuthError(error);
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      });

      const res = await fetch(`${this.authBaseUrl()}/token`, {
        method: "POST",
        body: params,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const data = (await res.json()) as ZohoTokenResponse;

      if (!res.ok || data.error) {
        throw new Error(
          `Zoho token refresh failed: ${data.error ?? res.status}`,
        );
      }

      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      return {
        accessToken: data.access_token,
        refreshToken,
        expiresAt,
        scopes: this.scopes,
      };
    } catch (error) {
      handleOAuthError(error);
    }
  }
}
