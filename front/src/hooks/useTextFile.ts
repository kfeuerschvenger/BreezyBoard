import { useCallback, useEffect, useRef, useState } from 'react';

type UseTextFileResult = {
  data: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Fetch a plain text file from the public folder.
 * - path: relative path (for example: "/Terms of Service.txt")
 * - enabled: whether to actually perform the fetch (useful to avoid fetching until needed)
 *
 * The hook returns data, loading, error and a refetch function.
 */
export default function useTextFile(path?: string, enabled = false): UseTextFileResult {
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastPathRef = useRef<string | undefined>(undefined);

  const fetchFile = useCallback(async () => {
    if (!path) return;
    // Avoid redundant fetches
    if (lastPathRef.current === path && data !== null) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // encodeURI so spaces and other characters are handled
      const res = await fetch(encodeURI(path), { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Failed to load file: ${res.status} ${res.statusText}`);
      }
      const txt = await res.text();
      setData(txt);
      lastPathRef.current = path;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('useTextFile fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path, data]);

  // when enabled and path changes, fetch once
  useEffect(() => {
    if (enabled && path) {
      fetchFile();
    }
    // cleanup on unmount
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, path, fetchFile]);

  return {
    data,
    loading,
    error,
    refetch: fetchFile,
  };
}
