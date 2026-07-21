import type { SourceCode } from "@ai-trend-radar/types";
import type { IconType } from "react-icons";
import { SiGithub, SiInstagram, SiProducthunt, SiReddit, SiThreads, SiYcombinator } from "react-icons/si";

const sourceBrands: Record<SourceCode, { icon: IconType; label: string; color: string }> = {
  product_hunt: { icon: SiProducthunt, label: "Product Hunt", color: "#da552f" },
  github: { icon: SiGithub, label: "GitHub", color: "#181717" },
  hacker_news: { icon: SiYcombinator, label: "Hacker News", color: "#ff6600" },
  reddit: { icon: SiReddit, label: "Reddit", color: "#ff4500" },
  threads: { icon: SiThreads, label: "Threads", color: "#000000" },
  instagram: { icon: SiInstagram, label: "Instagram", color: "#e4405f" },
};

export function SourceBrandIcon({ source, size = "small" }: { source: SourceCode; size?: "small" | "medium" }) {
  const brand = sourceBrands[source];
  const Icon = brand.icon;

  return (
    <span
      className={`source-brand-icon source-brand-icon-${size}`}
      style={{ "--source-brand-color": brand.color } as React.CSSProperties}
      aria-label={brand.label}
      title={brand.label}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}

export function getSourceLabel(source: SourceCode) {
  return sourceBrands[source].label;
}
