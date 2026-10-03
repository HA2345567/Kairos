import { Header } from "./Header";
import { Footer } from "./Footer";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  hideFooter,
  className,
}: {
  children: ReactNode;
  hideFooter?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-h-screen flex flex-col bg-background", className)}>
      <Header />
      <main className="flex-1">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
}
