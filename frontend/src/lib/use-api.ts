"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "./api";

interface Options {
  /** Re-fetch on this interval while the tab is visible (near-real-time views). */
  refreshMs?: number;
  /** Stop polling once this returns true for the latest data. */
  stopWhen?: (data: any) => boolean;
}

/**
 * Loads data through an `api.*` call with explicit loading / error state and optional polling.
 * The first load shows `loading`; background refreshes keep the last good data on screen and
 * only replace it when the server answers, so the UI never shows invented values.
 */
export function useApi<T>(fn: () => Promise<ApiResult<T>>, deps: unknown[] = [], opts: Options = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const stopRef = useRef(opts.stopWhen);
  stopRef.current = opts.stopWhen;
  const stoppedRef = useRef(false);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    const res = await fnRef.current();
    if (res.error) {
      setError(res.error);
    } else {
      setError(null);
      setData(res.data);
      if (stopRef.current?.(res.data)) stoppedRef.current = true;
    }
    if (!background) setLoading(false);
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    load(false);
    if (!opts.refreshMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !stoppedRef.current) load(true);
    }, opts.refreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, opts.refreshMs, ...deps]);

  return { data, error, loading, reload: () => load(false), setData };
}
