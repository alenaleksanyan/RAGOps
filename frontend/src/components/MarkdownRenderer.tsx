"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(codeText);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={`prose prose-invert max-w-none text-xs leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-slate-800" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-sm font-semibold text-white mt-3 mb-1.5 flex items-center gap-1.5" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xs font-semibold text-indigo-300 mt-2.5 mb-1" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-xs font-medium text-slate-200 mt-2 mb-1" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="mb-2.5 text-slate-200 leading-relaxed font-sans last:mb-0" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-white" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="text-indigo-200/90 italic" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-outside pl-4 mb-2.5 space-y-1 text-slate-200" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-outside pl-4 mb-2.5 space-y-1 text-slate-200 font-sans" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed pl-0.5" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-2 border-indigo-500 bg-indigo-950/20 px-3 py-1.5 rounded-r-lg my-2 text-slate-300 italic text-[11px]"
              {...props}
            />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-slate-800">
              <table className="w-full text-left border-collapse text-[11px]" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-slate-900/80 text-slate-300 border-b border-slate-800" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="p-2 font-semibold text-slate-200" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="p-2 border-t border-slate-800/60 text-slate-300" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-3 border-slate-800" {...props} />
          ),
          code: ({ node, className: codeClassName, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const codeString = String(children).replace(/\n$/, "");
            const isInline = !match && !String(children).includes("\n");

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800/80 text-indigo-300 font-mono text-[11px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group my-2.5 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden font-mono text-[11px]">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400">
                  <span>{match ? match[1] : "code"}</span>
                  <button
                    onClick={() => handleCopy(codeString)}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedCode === codeString ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto text-slate-200 leading-relaxed">
                  <code>{children}</code>
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
