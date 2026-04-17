import { ChevronRight } from "lucide-react";
import AppLink from "@/battlezone/components/AppLink";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  linkTo?: string;
  linkLabel?: string;
}

const SectionHeader = ({ title, subtitle, linkTo, linkLabel }: SectionHeaderProps) => (
  <div className="flex items-end justify-between mb-6">
    <div>
      <h2 className="text-2xl font-display font-bold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
    {linkTo && (
      <AppLink to={linkTo} className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
        {linkLabel || "View All"} <ChevronRight className="h-4 w-4" />
      </AppLink>
    )}
  </div>
);

export default SectionHeader;
