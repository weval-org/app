'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A calm, one-line notice for the pages on weval.org that take input from
 * people (pairwise comparisons, workshops): what is kept, where it goes,
 * and what is not collected, with the detail a tap away. It never blocks,
 * never pops up, and never asks for a cookie choice: the site sets none
 * (Plausible, docs/ANALYTICS.md), and the input itself is anonymous.
 *
 * Keep it true to the code. Anything new that is kept about a person on
 * one of these pages gets a line here in the same change.
 */
export function DataNotice({
  what,
  className,
}: {
  /** What this page keeps, in the second person: "Your votes and the reasons you give". */
  what: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <aside
      className={cn('text-sm text-muted-foreground', className)}
      aria-label="How your input is used"
      data-testid="data-notice"
    >
      <p>
        {what} are stored without your name or any account, and become part of
        an open research dataset.{' '}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="underline underline-offset-4 hover:text-foreground"
          aria-expanded={open}
        >
          {open ? 'Show less' : 'How your input is used'}
        </button>
      </p>
      {open && (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-foreground">What is kept.</span>{' '}
            {what}, with the time, and which prompt and models were shown. No
            name, email, account or IP address.
          </li>
          <li>
            <span className="font-medium text-foreground">Where it goes.</span>{' '}
            Weval is a project of the Collective Intelligence Project. Input is
            released as open data for AI research, which means anyone may reuse
            it, including to train or evaluate AI models.
          </li>
          <li>
            <span className="font-medium text-foreground">No trackers.</span>{' '}
            This site measures visits with Plausible, which sets no cookies and
            keeps no personal data. No advertising or product-analytics
            trackers run here.
          </li>
          <li>
            <span className="font-medium text-foreground">Your choice.</span>{' '}
            Taking part is voluntary; close the page at any time and nothing
            more is kept. Questions:{' '}
            <a href="mailto:hello@weval.org" className="underline underline-offset-4">
              hello@weval.org
            </a>
            .
          </li>
        </ul>
      )}
    </aside>
  );
}
