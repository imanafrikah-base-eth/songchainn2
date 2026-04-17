import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useEmbedMode } from "@/battlezone/contexts/EmbedModeContext";

const BASE_PATH = "/wavewarz-africa";

function withBasePath(to: LinkProps["to"]): LinkProps["to"] {
  if (typeof to !== "string") return to;
  if (/^https?:\/\//i.test(to)) return to;
  if (to.startsWith(BASE_PATH)) return to;
  if (to === "/") return BASE_PATH;
  if (to.startsWith("/")) return `${BASE_PATH}${to}`;
  return to;
}

const AppLink = forwardRef<HTMLAnchorElement, LinkProps>(function AppLink(props, ref) {
  const { embedTo, isEmbedded } = useEmbedMode();
  const scopedTo = withBasePath(props.to);
  const nextTo = isEmbedded ? embedTo(scopedTo) : scopedTo;
  return <Link {...props} ref={ref} to={nextTo} />;
});

export default AppLink;
