/**
 * Reusable normalization utilities for Resource Intelligence UI.
 */

export const SECRET_REDACTION_REGEXES = [
  /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}/g, // GitHub PATs
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, // JWTs
  /(?:^|[^A-Za-z0-9+])(AKIA[0-9A-Z]{16})(?:[^A-Za-z0-9+]|$)/g, // AWS Access Keys
  /(?:secret|password|token|key|pwd)(?:[ \t]*[:=][ \t]*)(['"]?)([^'"\r\n]+)\1/gi, // generic key/values
  /([a-zA-Z0-9+/=]{40,})/g // Long base64 strings (often secrets/certs)
];

export function redactSecrets(text) {
  if (!text) return text;
  let redacted = String(text);

  // Apply specific known regexes
  SECRET_REDACTION_REGEXES.forEach(regex => {
    redacted = redacted.replace(regex, (match) => {
      // If regex has groups, we might only want to replace the value part, 
      // but for simplicity, we'll replace the whole match if it's a token, 
      // or just the captured group if it's a key=value regex.
      if (match.toLowerCase().includes('secret') || match.toLowerCase().includes('password')) {
        return match.split(/[:=]/)[0] + '=[REDACTED_SECRET]';
      }
      return '[REDACTED_SECRET]';
    });
  });

  return redacted;
}

export function normalizeSeverity(severity) {
  if (!severity) return 'info';
  const s = severity.toLowerCase();
  if (['critical', 'fatal', 'error'].includes(s)) return 'critical';
  if (['high', 'severe', 'warning'].includes(s)) return 'high';
  if (['medium', 'moderate'].includes(s)) return 'medium';
  if (['low', 'minor'].includes(s)) return 'low';
  return 'info';
}

export function normalizeEventType(type) {
  if (!type) return 'UnknownEvent';
  return type.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Normalizes different provider risk/event objects into a standard Resource Intelligence schema.
 */
export function normalizeRiskEvent(rawEvent, provider = 'azure', resourceType = 'Generic') {
  if (!rawEvent) return null;

  // AKS Risks formatting
  if (rawEvent.type && rawEvent.evidence) {
    return {
      id: rawEvent.id || Math.random().toString(36).substring(7),
      resource_id: rawEvent.clusterId || "unknown",
      resource_type: resourceType || "Kubernetes",
      resource_name: rawEvent.resource || "unknown",
      provider: provider,
      severity: normalizeSeverity(rawEvent.severity),
      event_type: normalizeEventType(rawEvent.type),
      title: `${rawEvent.type} on ${rawEvent.resource}`,
      short_message: rawEvent.evidence.split('\n')[0].substring(0, 150),
      log_preview: rawEvent.evidence.split('\n').slice(0, 3).join('\n'),
      full_log: redactSecrets(rawEvent.evidence),
      timestamp: rawEvent.timestamp || new Date().toISOString(),
      source: rawEvent.source || "Kubernetes API",
      recommendation: rawEvent.recommendation || "Investigate the failure evidence.",
      rca_supported: true,
      metadata: {
        namespace: rawEvent.namespace || "default",
        ...rawEvent.metadata
      }
    };
  }

  // Azure Activity Logs formatting
  if (rawEvent.operationName && rawEvent.status) {
    const isFailure = rawEvent.status === "Failed" || rawEvent.level === "Error";
    const title = rawEvent.operationName.split('/').pop() || rawEvent.operationName;
    return {
      id: rawEvent.id || rawEvent.correlationId || Math.random().toString(36).substring(7),
      resource_id: rawEvent.resourceId || "unknown",
      resource_type: resourceType || "AzureResource",
      resource_name: rawEvent.resourceId?.split('/').pop() || "unknown",
      provider: provider,
      severity: isFailure ? 'high' : 'info',
      event_type: isFailure ? 'ActivityFailure' : 'ActivityInfo',
      title: `${isFailure ? 'Failed:' : 'Info:'} ${title}`,
      short_message: rawEvent.description || `Operation ${title} ${rawEvent.status}`,
      log_preview: (rawEvent.description || "").split('\n').slice(0, 3).join('\n'),
      full_log: redactSecrets(rawEvent.description || JSON.stringify(rawEvent, null, 2)),
      timestamp: rawEvent.eventTimestamp || new Date().toISOString(),
      source: "Azure Activity Log",
      recommendation: isFailure ? "Review the operation parameters and permissions." : "",
      rca_supported: isFailure,
      metadata: {
        operationName: rawEvent.operationName,
        status: rawEvent.status,
        caller: rawEvent.caller,
        correlationId: rawEvent.correlationId
      }
    };
  }

  // Kubernetes Events formatting
  if (rawEvent.reason && rawEvent.involved_object) {
    return {
      id: rawEvent.id || Math.random().toString(36).substring(7),
      resource_id: "unknown",
      resource_type: "KubernetesEvent",
      resource_name: rawEvent.involved_object || "unknown",
      provider: provider,
      severity: rawEvent.type === 'Warning' ? 'medium' : 'info',
      event_type: normalizeEventType(rawEvent.reason),
      title: `${rawEvent.reason} on ${rawEvent.involved_object}`,
      short_message: rawEvent.message?.substring(0, 150) || "",
      log_preview: (rawEvent.message || "").split('\n').slice(0, 3).join('\n'),
      full_log: redactSecrets(rawEvent.message || ""),
      timestamp: rawEvent.last_timestamp || new Date().toISOString(),
      source: "Kubernetes Events",
      recommendation: "Review the event context to determine if action is needed.",
      rca_supported: rawEvent.type === 'Warning',
      metadata: {
        namespace: rawEvent.namespace,
        count: rawEvent.count
      }
    };
  }

  // Fallback generic format
  return {
    id: rawEvent.id || Math.random().toString(36).substring(7),
    resource_id: "unknown",
    resource_type: "Generic",
    resource_name: rawEvent.name || "unknown",
    provider: provider,
    severity: normalizeSeverity(rawEvent.severity || rawEvent.level),
    event_type: "GenericEvent",
    title: rawEvent.title || rawEvent.name || "Unknown Event",
    short_message: (rawEvent.message || rawEvent.description || "").substring(0, 150),
    log_preview: (rawEvent.message || rawEvent.description || "").split('\n').slice(0, 3).join('\n'),
    full_log: redactSecrets(rawEvent.message || rawEvent.description || JSON.stringify(rawEvent, null, 2)),
    timestamp: rawEvent.timestamp || new Date().toISOString(),
    source: rawEvent.source || "Unknown",
    recommendation: rawEvent.recommendation || "",
    rca_supported: true,
    metadata: { ...rawEvent }
  };
}
