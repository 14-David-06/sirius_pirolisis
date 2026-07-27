/**
 * Registra los matchers de `@testing-library/jest-dom` (toBeInTheDocument,
 * toHaveTextContent, …) para `tsc`.
 *
 * El import vive en `jest.setup.js`, que al ser `.js` queda fuera del `include`
 * de tsconfig, así que la ampliación de tipos nunca se cargaba y los `.test.tsx`
 * fallaban con TS2339 sobre cada matcher.
 */

import '@testing-library/jest-dom';
