import { APP_VERSION, shortVersion } from "@/lib/version";

export function AppVersion() {
  return (
    <p className="mt-5 text-center font-mono text-[11px] text-muted-foreground/70">
      GymKeeper · {shortVersion(APP_VERSION)}
    </p>
  );
}
