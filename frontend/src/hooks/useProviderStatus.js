import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/api";

export function useProviderStatus() {
  const [providerStatus, setProviderStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi("/api/v1/ai/provider-status");
      setProviderStatus(data);
    } catch {
      setProviderStatus({
        provider: "unknown",
        status: "unavailable",
        display_name: "Provider Status Unavailable",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll every 60 seconds
    const timer = setInterval(fetchStatus, 60000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  return { providerStatus, loading, refetch: fetchStatus };
}
