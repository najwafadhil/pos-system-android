// =============================================
// LAZY IMPORT HELPER
// =============================================
// Wrapper untuk React.lazy() yang menambahkan minimum delay.
// Ini memastikan loading screen selalu tampil setidaknya
// beberapa ratus milidetik, sehingga user mendapat feedback
// visual yang konsisten bahwa halaman sedang dimuat.
//
// Tanpa delay, halaman yang sudah ter-cache akan langsung
// muncul tanpa loading screen → terasa "blink" / tidak smooth.
// =============================================

import React from 'react';

/**
 * Membuat lazy component dengan minimum delay.
 * @param {Function} importFn - fungsi import(), contoh: () => import('./Cashier')
 * @param {number} minDelay - minimum waktu tampil loading screen (ms)
 * @returns {React.LazyExoticComponent}
 */
export function lazyWithDelay(importFn, minDelay = 600) {
  return React.lazy(() => {
    const start = Date.now();
    return importFn().then(module => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, minDelay - elapsed);
      if (remaining > 0) {
        return new Promise(resolve => setTimeout(() => resolve(module), remaining));
      }
      return module;
    });
  });
}
