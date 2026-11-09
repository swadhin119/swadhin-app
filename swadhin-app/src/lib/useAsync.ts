import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const id = useRef(0);
  const run = useCallback(() => {
    const my = ++id.current; setLoading(true); setError(null);
    fn().then((v) => { if (my === id.current) { setData(v); setLoading(false); } })
      .catch((e) => { if (my === id.current) { setError(String(e?.message || e)); setLoading(false); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { if (enabled) run(); else { id.current++; setLoading(false); } }, [run, enabled]);
  return { data, error, loading, reload: run };
}
