import React from "react";
import { Info, History, RefreshCw, ShieldAlert, Link as LinkIcon } from "lucide-react";

export type DetailTabType = "About" | "Historical" | "Rebalances" | "Risk" | "Resources";

interface BasketTabsProps {
  activeTab: DetailTabType;
  onTabChange: (tab: DetailTabType) => void;
}

interface TabDef {
  id: DetailTabType;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "About", label: "About", icon: Info },
  { id: "Historical", label: "Historical", icon: History },
  { id: "Rebalances", label: "Rebalances", icon: RefreshCw },
  { id: "Risk", label: "Risk", icon: ShieldAlert },
  { id: "Resources", label: "Resources", icon: LinkIcon },
];

export const BasketTabs: React.FC<BasketTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#0A0D12] border border-[#1F2633] mb-6 overflow-x-auto no-scrollbar">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              isActive
                ? "bg-[#1A202C] text-[#D4FF00] font-bold border border-[#2D3748] shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-[#141A25]"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#D4FF00]" : "text-gray-400"}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
