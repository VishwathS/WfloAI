"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectAccent = "violet" | "indigo" | "red";

const ACCENT_FOCUS: Record<SelectAccent, string> = {
  violet: "focus:border-violet-400 focus:ring-violet-500/25",
  indigo: "focus:border-indigo-400 focus:ring-indigo-500/25",
  red: "focus:border-red-400 focus:ring-red-500/25"
};

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  accent?: SelectAccent;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(
  (
    { className, children, accent = "violet", onPointerDown, onClick, onKeyDown, ...props },
    ref
  ) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "nodrag flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-900 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-gray-400",
        ACCENT_FOCUS[accent],
        className
      )}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onKeyDown={onKeyDown}
      // React Flow's document-level key handler skips any focused element that
      // isInputDOMNode() recognises — INPUT/SELECT/TEXTAREA or anything carrying
      // a contenteditable attribute (presence only; "false" still counts). The
      // Radix trigger is a BUTTON, so without this Backspace deletes the node.
      contentEditable="false"
      suppressContentEditableWarning
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex items-center justify-center py-1 text-gray-400", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex items-center justify-center py-1 text-gray-400", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const fullscreenElement = document.fullscreenElement;
    setContainer(
      fullscreenElement instanceof HTMLElement ? fullscreenElement : document.body
    );
  }, []);

  if (!container) {
    return null;
  }

  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={6}
        className={cn(
          "nowheel relative z-[60] max-h-72 min-w-[8rem] overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 shadow-panel",
          position === "popper" && "w-[var(--radix-select-trigger-width)]",
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="max-h-72 overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400",
      className
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-8 text-sm text-gray-700 outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-gray-50 data-[state=checked]:font-medium data-[highlighted]:text-gray-900 data-[state=checked]:text-gray-900 data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-violet-600" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("my-1 h-px bg-gray-100", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator
};
