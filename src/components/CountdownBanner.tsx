"use client";

import { useEffect, useState } from "react";
import { Clock, Flame, ShieldCheck } from "lucide-react";

interface CountdownBannerProps {
  expiresAt: number;
  offlinePact: boolean;
  compact?: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired · Pending Wipe";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function CountdownBanner({
  expiresAt,
  offlinePact,
  compact = false,
}: CountdownBannerProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = now === null ? null : expiresAt - now;
  const expiryDateStr = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4DACB] bg-[#F3EDE2]/80 ${
        compact ? "px-3.5 py-2.5 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBEAE3] px-2.5 py-1 font-medium text-[#A8431F]">
          <Flame className="h-3.5 w-3.5" />
          Auto-Wipe Countdown
        </span>
        <span
          suppressHydrationWarning
          data-testid="countdown-timer"
          className="font-mono-label font-semibold text-[#191715]"
        >
          {remainingMs === null ? "Calculating…" : formatRemaining(remainingMs)}
        </span>
        <span className="text-xs text-[#645C52]">(wipes after {expiryDateStr} UTC)</span>
      </div>

      {offlinePact ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF2ED] px-3 py-1 text-xs font-medium text-[#1E4635]">
          <ShieldCheck className="h-3.5 w-3.5" />
          No Social Posting · Offline Pact Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#645C52]">
          <Clock className="h-3.5 w-3.5" />
          Ephemeral Private Room
        </span>
      )}
    </div>
  );
}
