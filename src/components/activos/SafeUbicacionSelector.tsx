/**
 * SafeUbicacionSelector - Wrapper seguro para romper React 19 optimization objects
 */

'use client';

import { useEffect, useState } from 'react';
import UbicacionSelector from './UbicacionSelector';

interface SafeUbicacionSelectorProps {
  selectedId: string;
  onChange: (id: string) => void;
  error?: string;
}

export default function SafeUbicacionSelector({
  selectedId: propId,
  onChange,
  error: propError,
}: SafeUbicacionSelectorProps) {
  // Force complete isolation - create new state that's completely disconnected
  const [safeId, setSafeId] = useState<string>('');
  const [safeError, setSafeError] = useState<string>('');

  useEffect(() => {
    // Deep clone to break any React optimization wrapper
    const id = JSON.parse(JSON.stringify(String(propId || '')));
    setSafeId(id);
  }, [propId]);

  useEffect(() => {
    // Force string conversion
    const err = propError ? JSON.parse(JSON.stringify(String(propError))) : '';
    setSafeError(err);
  }, [propError]);

  const handleChange = (id: string) => {
    // Deep clone before passing back up
    const cloned = JSON.parse(JSON.stringify(String(id)));
    onChange(cloned);
  };

  return (
    <UbicacionSelector
      key={`ubicacion-${safeId}-${safeError.length}`}
      selectedId={safeId}
      onChange={handleChange}
      error={safeError}
    />
  );
}
