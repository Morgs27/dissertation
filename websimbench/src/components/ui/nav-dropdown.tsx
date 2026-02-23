import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface NavDropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  iconClassName?: string;
}

export interface NavDropdownProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: NavDropdownOption[];
  onValueChange: (value: string) => void;
  className?: string;
}

export function NavDropdown({
  icon,
  label,
  value,
  options,
  onValueChange,
  className,
}: NavDropdownProps) {
  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="panel-header uppercase text-[10px] tracking-wider mt-0.5 font-bold !text-tropicalTeal">
        {icon}
        {label}
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 border-none bg-transparent hover:bg-white/5 focus:ring-0 shadow-none text-xs font-bold text-white px-2 w-auto gap-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className="control-select-content"
          position="popper"
          sideOffset={4}
        >
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="control-select-item"
            >
              <span className="nav-dropdown-option">
                <span>{opt.label}</span>
                {opt.icon && (
                  <span
                    className={cn(
                      "nav-dropdown-option-icon",
                      opt.iconClassName,
                    )}
                  >
                    {opt.icon}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
