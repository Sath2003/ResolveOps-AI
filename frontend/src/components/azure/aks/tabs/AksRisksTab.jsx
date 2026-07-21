"use client";

import React from "react";
import ResourceRiskList from "@/components/resource-intelligence/ResourceRiskList";
import { normalizeRiskEvent } from "@/lib/resourceRiskFormatters";

export default function AksRisksTab({ risks, clusterId }) {
  // Normalize the raw AKS risk objects into generic Resource Intelligence events
  const normalizedRisks = (risks || []).map(r => 
    normalizeRiskEvent({ ...r, clusterId }, "azure", "Kubernetes")
  );

  return (
    <div className="animate-in fade-in duration-300">
      <ResourceRiskList items={normalizedRisks} emptyType="risks" />
    </div>
  );
}
