'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PRINT_CSS = `
@media print {
  body > *:not(.carb-print-root) { display: none !important; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  .carb-print-root { display: block !important; color: #111; background: #fff; }
}
`;

interface PrintPortalProps {
  children: ReactNode;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Mounts `children` in a body-level container that is invisible on screen and
 * is the ONLY thing rendered when printing (`window.print()` / "Save as PDF").
 * The stylesheet is scoped to the portal's lifetime, so it never leaks into
 * other pages. Children should use explicit light-paper colors.
 */
export const PrintPortal = ({
  children,
  orientation = 'portrait',
}: PrintPortalProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div aria-hidden='true' className='carb-print-root hidden'>
      <style>{`${PRINT_CSS}@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`}</style>
      {children}
    </div>,
    document.body
  );
};
