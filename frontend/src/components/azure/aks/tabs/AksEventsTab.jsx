"use client";

import React from "react";
import ResourceRiskList from "@/components/resource-intelligence/ResourceRiskList";
import { normalizeRiskEvent } from "@/lib/resourceRiskFormatters";

export default function AksEventsTab({ events }) {
  // Normalize Kubernetes events into generic Resource Intelligence events
  const normalizedEvents = (events || []).map(e => 
    normalizeRiskEvent(e, "azure", "Kubernetes")
  );

  return (
    <div className="animate-in fade-in duration-300">
      <ResourceRiskList items={normalizedEvents} emptyType="events" />
    </div>
  );
}
