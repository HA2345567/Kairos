import React from "react";
import { RefreshCw, ExternalLink, Calendar, CheckCircle2 } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface RebalancesTabViewProps {
  basket: Basket;
}

interface RebalanceEvent {
  date: string;
  version: string;
  txHash: string;
  summary: string;
  changes: { token: string; from: string; to: string }[];
}

export const RebalancesTabView: React.FC<RebalancesTabViewProps> = ({ basket }) => {
  const events: RebalanceEvent[] = [
    {
      date: "2026-09-15",
      version: "v1.3",
      txHash: "5KtPn...9xJk",
      summary: "Adjusted liquid staking weights to capture MEV tip rewards post-upgrade.",
      changes: [
        { token: "SOL", from: "35%", to: "40%" },
        { token: "JTO", from: "25%", to: "20%" },
      ],
    },
    {
      date: "2026-08-01",
      version: "v1.2",
      txHash: "3mQr8...7LzB",
      summary: "Target Weight Adjustment: Added Pyth Network oracle governance allocation.",
      changes: [
        { token: "PYTH", from: "10%", to: "15%" },
        { token: "JUP", from: "30%", to: "25%" },
      ],
    },
    {
      date: "2026-06-20",
      version: "v1.0",
      txHash: "9aWv2...4PpK",
      summary: "Initial basket deployment on Solana Mainnet with Jupiter router routing.",
      changes: [
        { token: "SOL", from: "0%", to: "35%" },
        { token: "JUP", from: "0%", to: "30%" },
        { token: "JTO", from: "0%", to: "25%" },
        { token: "PYTH", from: "0%", to: "10%" },
      ],
    },
  ];

  return (
    <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-xl font-bold font-display text-white tracking-tight">
            Rebalance & Weight History
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Transparent on-chain records of target allocation updates
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/10 text-emerald-400 border border-[#10B981]/30 text-xs font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Automated Invariant</span>
        </div>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1F2633]">
        {events.map((event, idx) => (
          <div key={event.version} className="relative group">
            {/* Timeline Dot */}
            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#0A0D12] border-2 border-[#D4FF00] group-hover:scale-125 transition-transform" />

            <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633] group-hover:border-[#2D3748] transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{event.version}</span>
                  <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {event.date}
                  </span>
                </div>
                <a
                  href={`https://solscan.io/tx/${event.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-mono text-gray-400 hover:text-[#D4FF00] transition-colors"
                >
                  <span>Tx: {event.txHash}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <p className="text-xs text-gray-300 mb-3">{event.summary}</p>

              {/* Weight changes badges */}
              <div className="flex flex-wrap gap-2">
                {event.changes.map((c) => (
                  <div
                    key={c.token}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141A25] border border-[#1F2633] text-[11px] font-mono"
                  >
                    <span className="text-gray-300 font-semibold">{c.token}:</span>
                    <span className="text-gray-500 line-through">{c.from}</span>
                    <span className="text-emerald-400 font-bold">→ {c.to}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
