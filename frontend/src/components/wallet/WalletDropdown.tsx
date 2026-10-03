import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Layers,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WalletDropdownProps {
  address: string;
  onDisconnect: () => Promise<void> | void;
  className?: string;
}

export function WalletDropdown({
  address,
  onDisconnect,
  className,
}: WalletDropdownProps) {
  const [copied, setCopied] = useState(false);

  const displayAddr = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "Connected";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Wallet address copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full",
            "bg-surface hover:bg-surface-elevated",
            "border border-border/40 hover:border-border",
            "transition-all duration-200 cursor-pointer select-none",
            "shadow-sm active:scale-[0.98]",
            "group outline-none",
            className
          )}
        >
          {/* Solana Gradient Avatar */}
          <div className="relative size-6 rounded-full bg-gradient-to-tr from-[#9945FF] via-[#14F195] to-[#00C2FF] p-[1.5px] shrink-0">
            <div className="w-full h-full rounded-full bg-surface flex items-center justify-center">
              <span className="text-[9px] font-bold text-foreground tracking-wider font-mono">
                {address ? address.slice(0, 2).toUpperCase() : "SO"}
              </span>
            </div>
            {/* Live indicator dot */}
            <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-surface shadow-[0_0_6px_#34d399]" />
          </div>

          {/* Formatted Address */}
          <span className="text-xs font-semibold text-foreground font-mono tracking-tight">
            {displayAddr}
          </span>

          {/* Smooth Dropdown Chevron */}
          <ChevronDown className="size-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 p-3 bg-surface/95 backdrop-blur-2xl border border-border/40 rounded-2xl shadow-xl space-y-2 text-foreground z-50 animate-in fade-in-0 zoom-in-95"
      >
        {/* Account Header */}
        <div className="flex items-center gap-3 p-1">
          <div className="relative size-10 rounded-full bg-gradient-to-tr from-[#9945FF] via-[#14F195] to-[#00C2FF] p-[2px] shrink-0 shadow-md">
            <div className="w-full h-full rounded-full bg-surface flex items-center justify-center">
              <span className="text-xs font-bold text-foreground font-mono">
                {address ? address.slice(0, 2).toUpperCase() : "SO"}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground tracking-wide">
                Solana Wallet
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600/15 text-emerald-400 border border-emerald-600/30">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Devnet
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5 select-all">
              {address}
            </p>
          </div>
        </div>

        {/* Copy Address Action Box */}
        <div className="bg-foreground/[0.04] border border-border/30 rounded-xl p-2 flex items-center justify-between transition-colors">
          <span className="text-xs font-mono text-foreground/90 pl-1">{displayAddr}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] text-[11px] font-medium text-foreground transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="size-3 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="h-px bg-border/30 my-1" />

        {/* Quick Links */}
        <DropdownMenuItem asChild>
          <Link
            to="/positions"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-foreground/[0.06] cursor-pointer transition-colors outline-none"
          >
            <Layers className="size-4 text-foreground" />
            <span>My Positions & Portfolio</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <a
            href={`https://solscan.io/account/${address}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-foreground/[0.06] cursor-pointer transition-colors outline-none"
          >
            <div className="flex items-center gap-2.5">
              <ExternalLink className="size-4 text-cyan-600" />
              <span>View on Solscan</span>
            </div>
            <ArrowUpRight className="size-3 text-muted-foreground" />
          </a>
        </DropdownMenuItem>

        <div className="h-px bg-border/30 my-1" />

        {/* Disconnect Action */}
        <DropdownMenuItem
          onClick={() => onDisconnect()}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer transition-colors outline-none focus:bg-rose-500/10 focus:text-rose-300"
        >
          <LogOut className="size-4" />
          <span>Disconnect Wallet</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
