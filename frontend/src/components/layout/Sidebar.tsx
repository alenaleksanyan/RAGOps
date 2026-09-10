"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Boxes,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  GitCompare,
  Layers,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: BarChart3 },
  { name: "Documents & Chunks", href: "/documents", icon: FileText },
  { name: "RAG Playground", href: "/playground", icon: Bot },
  { name: "Synthetic Benchmarks", href: "/benchmarks", icon: Sparkles },
  { name: "Matrix Builder", href: "/matrix", icon: Layers },
  { name: "Experiment Runs", href: "/experiments", icon: FlaskConical },
  { name: "Side-by-Side Compare", href: "/compare", icon: GitCompare },
  { name: "Trade-offs & Failures", href: "/analytics", icon: Boxes },
  { name: "Providers & Keys", href: "/settings", icon: Cpu },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border bg-[#090d16]/90 backdrop-blur-md flex flex-col justify-between shrink-0 h-screen sticky top-0 transition-all">
      <div>
        {/* Brand Header */}
        <div className="p-4 border-b border-border/60 flex items-center space-x-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
            <FlaskConical className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5 truncate">
              RAGOps <span className="text-[9px] uppercase font-semibold px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">v0.1</span>
            </h1>
            <p className="text-[10px] text-slate-400 truncate">LLMOps Experimentation</p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="p-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                  }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
