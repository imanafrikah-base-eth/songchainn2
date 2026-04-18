import { ChevronRight } from "lucide-react";
import AppLink from "@/battlezone/components/AppLink";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  linkTo?: string;
  linkLabel?: string;
}

const SectionHeader = ({ title, subtitle, linkTo, linkLabel }: SectionHeaderProps) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h2 className="text-2xl font-display font-bold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
    {linkTo && (
      <AppLink to={linkTo} className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary transition-colors hover:text-primary/80 sm:self-auto">
        {linkLabel || "View All"} <ChevronRight className="h-4 w-4" />
      </AppLink>
    )}
  </div>
);

export default SectionHeader;
