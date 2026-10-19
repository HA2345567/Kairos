import { Header } from "./Header";
import { Footer } from "./Footer";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  hideFooter = true,
  className,
  contentTag = "main",
}: {
  children: ReactNode;
  hideFooter?: boolean;
  className?: string;
  contentTag?: "main" | "div";
}) {
  const Content = contentTag;
  return (
    <div className={cn("min-h-screen flex flex-col bg-background", className)}>
      <Header />
      <Content className="flex-1">{children}</Content>
      {!hideFooter && <Footer />}
    </div>
  );
}
