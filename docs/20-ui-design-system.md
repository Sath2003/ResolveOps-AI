# 20 — UI Design System & Component Guidelines

## Overview
ResolveOps AI uses a unified dark design system built with Vanilla CSS design tokens and Tailwind CSS utilities.

## Core Color Palette
- **Background**: `#060610` (App shell), `#080812` (Card surface)
- **Primary / Accent**: `indigo-500` / `indigo-600` (`#6366f1`)
- **Status Colors**:
  - **Healthy / Available**: `emerald-400` (`#34d399`) / `bg-emerald-500/10`
  - **Warning / Degraded**: `amber-400` (`#fbbf24`) / `bg-amber-500/10`
  - **Critical / Error**: `rose-400` (`#f87171`) / `bg-rose-500/10`
  - **Informational / Info**: `cyan-400` (`#22d3ee`) / `bg-cyan-500/10`

## Shared Components
1. **`ProviderBadge`**: Displays runtime provider (`OpenAI — Active` or `Amazon Bedrock — Active`) dynamically from `GET /api/v1/ai/provider-status`.
2. **`ErrorCard`**: Friendly error display featuring user-safe text, retry trigger, copyable request ID, and expandable technical details.
3. **`EvidenceCard`**: Displays live diagnostic evidence items with raw log expandable previews.
4. **`RCADisplay`**: Renders structured root cause, incident summary, impact, resolution, and text confidence classification (`High confidence`, `Moderate confidence`, `Low confidence`).
5. **`MetricCard`**: Compact metric card container used in Analytics and Command Center views.

## Accessibility Guidelines
- All interactive buttons have explicit `aria-label` or visible text labels.
- Status displays combine color badges with iconography (e.g. `CheckCircle2`, `AlertTriangle`) and text descriptors for non-color dependent accessibility.
- Investigation state changes use `role="status"` and `aria-live="polite"`.
