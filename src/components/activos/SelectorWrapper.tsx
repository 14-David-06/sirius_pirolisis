/**
 * SelectorWrapper - Wrapper para romper la cadena de estado de React 19
 * Workaround para bug de {state, value, isStale} en dev mode
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import TipoActivoSelector from './TipoActivoSelector';
import UbicacionSelector from './UbicacionSelector';

interface TipoActivoWrapperProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

export function TipoActivoWrapper({
  selectedIds,
  onChange,
  error,
}: TipoActivoWrapperProps) {
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState('');
  const mountKey = useRef(0);

  useEffect(() => {
    const ids = Array.isArray(selectedIds) ? [...selectedIds] : [];
    setLocalIds(ids);
    mountKey.current += 1;
  }, [selectedIds]);

  useEffect(() => {
    const err = String(error || '');
    setLocalError(err);
  }, [error]);

  const handleChange = (ids: string[]) => {
    const newIds = [...ids];
    setLocalIds(newIds);
    onChange(newIds);
  };

  // Forzar remontaje usando key
  return (
    <TipoActivoSelector
      key={`tipo-${mountKey.current}-${localIds.length}`}
      selectedIds={localIds}
      onChange={handleChange}
      error={localError}
    />
  );
}

interface UbicacionWrapperProps {
  selectedId: string;
  onChange: (id: string) => void;
  error?: string;
}

export function UbicacionWrapper({
  selectedId,
  onChange,
  error,
}: UbicacionWrapperProps) {
  const [localId, setLocalId] = useState('');
  const [localError, setLocalError] = useState('');
  const mountKey = useRef(0);

  useEffect(() => {
    const id = String(selectedId || '');
    setLocalId(id);
    mountKey.current += 1;
  }, [selectedId]);

  useEffect(() => {
    const err = String(error || '');
    setLocalError(err);
  }, [error]);

  const handleChange = (id: string) => {
    const idStr = String(id);
    setLocalId(idStr);
    onChange(idStr);
  };

  return (
    <UbicacionSelector
      key={`ubicacion-${mountKey.current}-${localId}`}
      selectedId={localId}
      onChange={handleChange}
      error={localError}
    />
  );
}
