'use client';

import { ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import dynamic from 'next/dynamic';

const X = dynamic(() => import('lucide-react').then(mod => mod.X));

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function MobileBottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-lg border-t border-border animate-in slide-in-from-bottom-full duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Content */}
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

interface ActionItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  actions: ActionItem[];
}

export function MobileActionSheet({ isOpen, onClose, title, actions }: MobileActionSheetProps) {
  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-2">
        {actions.map((action, index) => (
          <div key={index}>
            <Button
              variant={action.variant === 'destructive' ? 'destructive' : 'ghost'}
              size="lg"
              className="w-full justify-start h-12 text-left"
              onClick={() => {
                action.onClick();
                onClose();
              }}
              disabled={action.disabled}
            >
              {action.icon && <span className="mr-3 flex-shrink-0">{action.icon}</span>}
              <span>{action.label}</span>
            </Button>
            {index < actions.length - 1 && action.variant === 'destructive' && (
              <Separator className="my-2" />
            )}
          </div>
        ))}
      </div>
    </MobileBottomSheet>
  );
} 