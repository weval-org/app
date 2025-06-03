'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import React from 'react';

const ChevronRightIcon = dynamic(() => import('lucide-react').then(mod => mod.ChevronRightIcon));

export interface BreadcrumbItem {
  label: string;
  href?: string;
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
        <React.Fragment key={index}>
          {index > 0 && ChevronRightIcon && <ChevronRightIcon className="w-4 h-4 flex-shrink-0" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumbs; 