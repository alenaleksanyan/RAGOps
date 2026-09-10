"use client";

import React from "react";
import { CheckCircle2, Download, HardDrive, Cpu, Cloud } from "lucide-react";
import { ModelInfo } from "@/types";

interface ModelStatusBadgeProps {
  model?: ModelInfo;
  isDownloaded?: boolean;
  sizeFormatted?: string | null;
  ramRequired?: string | null;
  provider?: string;
  className?: string;
}

export function ModelStatusBadge({
  model,
  isDownloaded,
  sizeFormatted,
  ramRequired,
  provider,
  className = "",
}: ModelStatusBadgeProps) {
  const downloaded = model ? model.is_downloaded : isDownloaded;
  const size = model ? model.size_formatted : sizeFormatted;
  const ram = model ? model.ram_required : ramRequired;
  const prov = model ? model.provider : provider;

  if (prov && !["ollama", "fastembed"].includes(prov)) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60 ${className}`}
      >
        <Cloud className="w-2.5 h-2.5 text-sky-400" />
        <span>Cloud API</span>
      </span>
    );
  }

  if (downloaded) {
    return (
      <span
        title={ram ? `Requires ${ram}` : undefined}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${className}`}
      >
        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
        <span>Ready</span>
        {size && <span className="text-emerald-500/70 font-mono text-[9px]">({size})</span>}
      </span>
    );
  }

  return (
    <span
      title={ram ? `Estimated download. Requires ${ram}` : "Requires local download"}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 ${className}`}
    >
      <Download className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
      <span>Download Needed</span>
      {size && <span className="text-amber-500/70 font-mono text-[9px]">({size})</span>}
    </span>
  );
}
