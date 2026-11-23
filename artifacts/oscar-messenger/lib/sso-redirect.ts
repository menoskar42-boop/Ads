export function ssoRedirectUrl(platform: string, origin: string, nativeUri: string): string {
  if (platform !== "web") return nativeUri;

  try {
    const pageOrigin = new URL(origin);
    if (pageOrigin.protocol !== "https:" && pageOrigin.protocol !== "http:") {
      return nativeUri;
    }
    return `${pageOrigin.origin}/oscar-messenger/sign-in`;
  } catch {
    return nativeUri;
  }
}
