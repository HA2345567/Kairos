import { useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Copy from "lucide-react/dist/esm/icons/copy";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WalletDropdownProps {
  address: string;
  walletName?: string;
  walletIcon?: string;
  onDisconnect: () => Promise<void> | void;
  className?: string;
}

function WalletMark({
  address,
  name,
  icon,
  className,
}: {
  address: string;
  name: string;
  icon?: string;
  className: string;
}) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#bca4ff] via-[#8f70f0] to-[#75e6be] p-[1.5px]", className)}>
      <span className="grid size-full place-items-center overflow-hidden rounded-full bg-[#19181d] text-[10px] font-bold uppercase tracking-wide text-white">
        {icon ? (
          <img src={icon} alt={`${name} wallet`} className="size-full object-cover" />
        ) : (
          address.slice(0, 2)
        )}
      </span>
    </span>
  );
}

export function WalletDropdown({
  address,
  walletName = "Solana Wallet",
  walletIcon,
  onDisconnect,
  className,
}: WalletDropdownProps) {
  const [copied, setCopied] = useState(false);
  const displayAddr = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connected";

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Wallet address copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy wallet address");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Connected wallet ${displayAddr}`}
          className={cn(
            "group inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.09] bg-[#1b1b1b] py-1 pl-1.5 pr-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-all hover:border-white/20 hover:bg-[#242424] active:scale-[0.98]",
            className,
          )}
        >
          <span className="relative">
            <WalletMark address={address} name={walletName} icon={walletIcon} className="size-[30px]" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#1b1b1b] bg-[#55d6a4]" />
          </span>
          <span className="font-mono text-xs font-semibold tracking-tight text-white/90">{displayAddr}</span>
          <ChevronDown className="size-3.5 text-white/45 transition-transform group-data-[state=open]:rotate-180 group-hover:text-white/75" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[320px] overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#171717] p-2.5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="rounded-[15px] border border-white/[0.06] bg-[radial-gradient(110%_130%_at_0%_0%,rgba(153,69,255,0.13),transparent_58%),linear-gradient(145deg,rgba(255,255,255,0.035),transparent_70%)] p-3">
          <div className="flex items-center gap-3">
            <WalletMark address={address} name={walletName} icon={walletIcon} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-5 text-white">{walletName}</p>
              <p className="mt-0.5 text-[11px] text-white/45">Connected to Solana</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#55d6a4]/20 bg-[#55d6a4]/[0.08] px-2 py-1 text-[10px] font-semibold tracking-wide text-[#82e2bd]">
              <span className="size-1.5 rounded-full bg-[#55d6a4]" />
              DEVNET
            </span>
          </div>

          <div className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-white/[0.06] bg-black/25 px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-wide text-white/75" title={address}>
              {address}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "Wallet address copied" : "Copy wallet address"}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              {copied ? <Check className="size-3.5 text-[#82e2bd]" /> : <Copy className="size-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <div className="my-2.5 h-px bg-white/[0.07]" />

        <DropdownMenuItem asChild>
          <Link
            to="/positions"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-[12px] font-medium text-white/75 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white"
          >
            <Layers className="size-4 text-white/50" aria-hidden="true" />
            <span className="flex-1">My positions</span>
            <span className="text-[10px] text-white/30">PORTFOLIO</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <a
            href={`https://solscan.io/account/${address}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-[12px] font-medium text-white/75 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white"
          >
            <ExternalLink className="size-4 text-white/50" aria-hidden="true" />
            <span className="flex-1">View on Solscan</span>
            <span className="text-[10px] text-white/30">EXPLORER</span>
          </a>
        </DropdownMenuItem>

        <div className="my-2.5 h-px bg-white/[0.07]" />

        <DropdownMenuItem
          onClick={() => onDisconnect()}
          className="flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-[12px] font-medium text-[#f08a91] outline-none transition-colors hover:bg-[#f05d68]/[0.09] hover:text-[#ff9ca3] focus:bg-[#f05d68]/[0.09] focus:text-[#ff9ca3]"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>Disconnect wallet</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
