import * as React from "react"

import { cn } from "@/lib/utils"
import { useMobile } from "@/app/sandbox/hooks/useMobile"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export interface AutoExpandTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
  maxRows?: number;
}

const AutoExpandTextarea = React.forwardRef<HTMLTextAreaElement, AutoExpandTextareaProps>(
  ({ className, minRows = 1, maxRows = 10, value, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [internalValue, setInternalValue] = React.useState(value || '');
    const isUserTypingRef = React.useRef(false);
    const { isMobile } = useMobile();

    // Combine refs
    React.useImperativeHandle(ref, () => textareaRef.current!);

        const adjustHeight = React.useCallback((currentContent?: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // On mobile, skip complex height calculations and use simple fixed sizing
      if (isMobile) {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'auto';
        return;
      }

      // Desktop: Use smart auto-expanding logic
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      
      // Calculate the height based on content
      const scrollHeight = textarea.scrollHeight;
      const computedStyle = getComputedStyle(textarea);
      const lineHeight = parseInt(computedStyle.lineHeight, 10) || 20;
      const paddingTop = parseInt(computedStyle.paddingTop, 10) || 0;
      const paddingBottom = parseInt(computedStyle.paddingBottom, 10) || 0;
      const borderTop = parseInt(computedStyle.borderTopWidth, 10) || 0;
      const borderBottom = parseInt(computedStyle.borderBottomWidth, 10) || 0;
      
      const minContentHeight = lineHeight * minRows;
      const maxContentHeight = lineHeight * maxRows;
      const extraHeight = paddingTop + paddingBottom + borderTop + borderBottom;
      
      const minHeight = minContentHeight + extraHeight;
      const maxHeight = maxContentHeight + extraHeight;
      
      // For empty or minimal content, use our calculated minHeight
      // Only use scrollHeight when there are actually multiple lines
      const contentToUse = currentContent !== undefined ? currentContent : internalValue;
      const contentLines = String(contentToUse || '').split('\n').length;
      const shouldUseScrollHeight = contentLines > minRows;
      const newHeight = shouldUseScrollHeight 
        ? Math.min(scrollHeight, maxHeight)
        : minHeight;
      
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [minRows, maxRows, internalValue, isMobile]);

    // Adjust height when value changes (desktop only)
    React.useEffect(() => {
      if (!isMobile) {
        adjustHeight();
      }
    }, [internalValue, adjustHeight, isMobile]);

    // Adjust height on mount (desktop only)
    React.useEffect(() => {
      if (!isMobile) {
        adjustHeight();
      }
    }, [adjustHeight, isMobile]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      isUserTypingRef.current = true;
      setInternalValue(newValue);

      // Call the parent onChange if provided
      if (onChange) {
        onChange(e);
      }

      // Adjust height immediately with the fresh content (desktop only)
      if (!isMobile) {
        setTimeout(() => adjustHeight(newValue), 0);
      }
    };

    // Update internal value when external value changes
    // BUT only if the change didn't originate from user typing
    React.useEffect(() => {
      const externalValue = value || '';
      if (!isUserTypingRef.current && externalValue !== internalValue) {
        setInternalValue(externalValue);
      }
      isUserTypingRef.current = false;
    }, [value, internalValue]);

    return (
      <textarea
        ref={textareaRef}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          // On mobile, allow normal resizing and scrolling
          isMobile ? "resize-y" : "resize-none transition-all",
          className
        )}
        value={internalValue}
        onChange={handleChange}
        rows={isMobile ? Math.max(minRows, 3) : undefined}
        style={isMobile ? {} : { overflow: 'hidden' }}
        {...props}
      />
    )
  }
)
AutoExpandTextarea.displayName = "AutoExpandTextarea"

export { Textarea, AutoExpandTextarea } 