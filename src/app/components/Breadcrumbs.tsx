'use client';

import Link from 'next/link';
import React from 'react';
import Icon from '@/components/ui/icon';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
  title?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center space-x-1 text-sm text-muted-foreground ${className || ''}`}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          {index > 0 && <Icon name="chevron-right" className="h-4 w-4 mx-1" />}
          {item.href && !item.isCurrent ? (
            <Link href={item.href} className="hover:underline" title={item.title}>
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
};

export default Breadcrumbs; 