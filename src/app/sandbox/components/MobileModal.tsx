'use client';

import { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMobile } from '../hooks/useMobile';

interface MobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function MobileModal({ 
  isOpen, 
  onClose, 
  title, 
  description, 
  children, 
  footer 
}: MobileModalProps) {
  const { isMobile } = useMobile();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={`
          ${isMobile 
            ? 'w-[95vw] max-w-none h-[90vh] max-h-none flex flex-col p-0' 
            : 'max-w-md'
          }
        `}
      >
        {isMobile ? (
          <>
            {/* Mobile: Full-screen modal with header */}
            <DialogHeader className="p-4 border-b border-border flex-shrink-0">
              <DialogTitle className="text-lg">{title}</DialogTitle>
              {description && (
                <DialogDescription className="text-sm">
                  {description}
                </DialogDescription>
              )}
            </DialogHeader>
            
            {/* Mobile: Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4">
              {children}
            </div>
            
            {/* Mobile: Sticky footer */}
            {footer && (
              <DialogFooter className="p-4 border-t border-border flex-shrink-0">
                {footer}
              </DialogFooter>
            )}
          </>
        ) : (
          <>
            {/* Desktop: Standard modal layout */}
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription>
                  {description}
                </DialogDescription>
              )}
            </DialogHeader>
            
            <div className="my-4">
              {children}
            </div>
            
            {footer && (
              <DialogFooter>
                {footer}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
} 