const fallbackVersion = "3.0.0";

export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION?.trim() || fallbackVersion;

export function shortVersion(version = APP_VERSION): string {
  return version.length > 12 ? version.slice(0, 7) : version;
}
