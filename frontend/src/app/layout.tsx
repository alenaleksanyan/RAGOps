import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RAGOps – RAG Evaluation & Experimentation Workbench",
  description: "Enterprise LLMOps Evaluation & Optimization Workbench for Retrieval-Augmented Generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-background text-foreground flex antialiased`}>
        <Providers>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 min-h-screen">
            <main className="flex-1 p-8 overflow-y-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
