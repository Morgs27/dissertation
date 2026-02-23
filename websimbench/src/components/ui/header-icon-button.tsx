import * as React from "react";
import { cn } from "@/lib/utils";

export interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label?: string;
}

export const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  HeaderIconButtonProps
>(({ icon, label, className, ...props }, ref) => {
  return (
    <button ref={ref} className={cn("header-icon-btn", className)} {...props}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
});
HeaderIconButton.displayName = "HeaderIconButton";
