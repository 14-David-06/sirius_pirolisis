/**
 * SafeTipoActivoSelector - Wrapper seguro para romper React 19 optimization objects
 */

'use client';

import { useEffect, useState } from 'react';
import TipoActivoSelector from './TipoActivoSelector';

interface SafeTipoActivoSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

export default function SafeTipoActivoSelector({
  selectedIds: propIds,
  onChange,
  error: propError,
}: SafeTipoActivoSelectorProps) {
  // Force complete isolation - create new state that's completely disconnected
  const [safeIds, setSafeIds] = useState<string[]>([]);
  const [safeError, setSafeError] = useState<string>('');

  useEffect(() => {
    // Deep clone to break any React optimization wrapper
    const ids = JSON.parse(JSON.stringify(propIds || []));
    setSafeIds(ids);
  }, [propIds]);

  useEffect(() => {
    // Force string conversion
    const err = propError ? JSON.parse(JSON.stringify(String(propError))) : '';
    setSafeError(err);
  }, [propError]);

  const handleChange = (ids: string[]) => {
    // Deep clone before passing back up
    const cloned = JSON.parse(JSON.stringify(ids));
    onChange(cloned);
  };

  return (
    <TipoActivoSelector
      key={`tipo-${safeIds.length}-${safeError.length}`}
      selectedIds={safeIds}
      onChange={handleChange}
      error={safeError}
    />
  );
}
