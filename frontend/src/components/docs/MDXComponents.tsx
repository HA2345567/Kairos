import { Info, AlertTriangle, CheckCircle, Lightbulb, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export const MDXComponents = {
  Callout: ({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warning" | "success" | "tip" }) => {
    const icons = {
      info: Info,
      warning: AlertTriangle,
      success: CheckCircle,
      tip: Lightbulb,
    };
    const Icon = icons[type];

    const styles = {
      info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
      warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
      success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      tip: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    };

    return (
      <div className={cn("my-6 flex gap-4 rounded-xl border p-4 text-sm leading-relaxed", styles[type])}>
        <div className="mt-0.5 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          {children}
        </div>
      </div>
    );
  },
  
  // You can add more components here as needed
  CodeBlock: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="my-6 rounded-xl border border-border bg-surface overflow-hidden">
      {title && (
        <div className="bg-muted px-4 py-2 text-xs font-mono border-b border-border text-muted-foreground">
          {title}
        </div>
      )}
      <div className="p-4 overflow-x-auto">
        {children}
      </div>
    </div>
  ),

  AgentCard: ({ name, schedule, status, children }: { name: string; schedule: string; status: string; children: React.ReactNode }) => (
    <div className="my-6 rounded-xl border border-border bg-surface/50 p-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4">
        <div className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
          status === "live" ? "bg-success/10 text-success border border-success/20" : "bg-muted text-muted-foreground border border-border"
        )}>
          {status}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-foreground/5 flex items-center justify-center border border-border group-hover:border-foreground/20 transition-colors">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-display text-lg text-foreground">{name}</h4>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Frequency: {schedule}</p>
        </div>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  ),

  APIMethod: ({ method, endpoint }: { method: string; endpoint: string }) => (
    <div className="my-6 flex items-center gap-3 rounded-lg border border-border bg-surface p-3 font-mono text-xs">
      <span className={cn(
        "px-2 py-1 rounded font-bold",
        method === "GET" ? "bg-blue-500/10 text-blue-400" : 
        method === "POST" ? "bg-emerald-500/10 text-emerald-400" :
        method === "PUT" ? "bg-yellow-500/10 text-yellow-400" :
        "bg-red-500/10 text-red-400"
      )}>
        {method}
      </span>
      <span className="text-muted-foreground">{endpoint}</span>
    </div>
  ),

  h1: (props: any) => <h1 className="scroll-m-20 text-4xl font-display tracking-tight text-foreground" {...props} />,
  h2: (props: any) => <h2 className="mt-12 scroll-m-20 border-b border-border pb-2 text-2xl font-display tracking-tight text-foreground transition-colors first:mt-0" {...props} />,
  h3: (props: any) => <h3 className="mt-8 scroll-m-20 text-xl font-display tracking-tight text-foreground" {...props} />,
  p: (props: any) => <p className="leading-7 [&:not(:first-child)]:mt-6 text-muted-foreground" {...props} />,
  ul: (props: any) => <ul className="my-6 ml-6 list-disc [&>li]:mt-2 text-muted-foreground" {...props} />,
  ol: (props: any) => <ol className="my-6 ml-6 list-decimal [&>li]:mt-2 text-muted-foreground" {...props} />,
  li: (props: any) => <li className="mt-2" {...props} />,
  blockquote: (props: any) => <blockquote className="mt-6 border-l-2 border-primary pl-6 italic text-muted-foreground" {...props} />,
  a: ({ href, children, ...props }: any) => {
    const isInternal = href?.startsWith("/");
    if (isInternal) {
      return (
        <a href={href} className="font-medium text-foreground underline underline-offset-4 decoration-primary/30 hover:decoration-primary transition-colors" {...props}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-4 decoration-primary/30 hover:decoration-primary transition-colors" {...props}>
        {children}
      </a>
    );
  },
};
