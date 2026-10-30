# Contract claims

Generated from CONTRACT.md by scripts/contract-docs.mjs. [The authoritative contract](../CONTRACT.md#status) retains each clause’s complete acceptance obligations, Evidence, Gap and judgment provenance. Partial and missing clauses retain every obligation named there.

| Clause | Status | Evidence paths |
| --- | --- | --- |
| `ENGAGEMENT-001` | done | `src/gauge/catalog.ts`; `tests/gauge.mjs` |
| `BUDGET-001` | done | `src/gauge/catalog.ts`; `tests/gauge.mjs` |
| `RATE-001` | done | `src/gauge/catalog.ts`; `src/gauge/time.ts`; `tests/gauge.mjs` |
| `CAPACITY-001` | done | `src/gauge/reports.ts`; `tests/gauge.mjs`; `tests/gauge-forecast.mjs` |
| `TIME-001` | done | `src/gauge/time.ts`; `tests/gauge.mjs` |
| `TIME-002` | done | `src/gauge/time.ts`; `tests/gauge.mjs` |
| `COST-001` | done | `src/gauge/expenses.ts`; `tests/gauge.mjs` |
| `ECONOMICS-001` | done | `src/gauge/reports.ts`; `tests/gauge.mjs` |
| `BILLING-001` | done | `src/gauge/billing.ts`; `tests/gauge.mjs` |
| `BILLING-002` | done | `src/gauge/billing.ts`; `src/gauge/billing-corrections.ts`; `tests/gauge.mjs` |
| `REVIEW-001` | done | `src/gauge/reports.ts`; `tests/gauge.mjs` |
| `ACCESS-001` | done | `src/gauge/store.ts`; `src/gauge/reports.ts`; `tests/gauge.mjs` |
| `MOVE-001` | done | `src/gauge/harvest.ts`; `src/gauge/imports.ts`; `tests/gauge.mjs`; `tests/gauge-portability.mjs` |
| `AGENT-001` | done | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `AGENT-002` | done | `src/gauge/proposals.ts`; `src/gauge/ui-recovery.ts`; `src/gauge/alternative-billable.ts`; `tests/gauge-agent.mjs` |
| `AGENT-003` | done | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `AGENT-004` | done | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `SETUP-001` | partial | `src/gauge/agency.ts`; `src/gauge/agency-profile.ts`; `src/gauge/fx-rates.ts`; `src/gauge/setup.ts`; `src/gauge/ui-agency.ts`; `migrations/core/0019_gauge_agency.sql`; `migrations/core/0058_gauge_agency_profile.sql`; `tests/gauge-currency.mjs`; `tests/gauge-agency.mjs`; `src/gauge/invoices.ts`; `tests/gauge-invoices.mjs` |
| `SETUP-002` | done | `src/gauge/clients.ts`; `src/gauge/ui-clients.ts`; `src/gauge/catalog.ts`; `src/gauge/http.ts`; `tests/gauge-clients.mjs` |
| `SETUP-003` | done | `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-cash-forecast.mjs`; `src/gauge/fx-rates.ts`; `src/gauge/ui-agency.ts` |
| `SETUP-004` | done | `src/gauge/custom-fields.ts`; `src/gauge/custom-values.ts`; `src/gauge/custom-report.ts`; `src/gauge/custom-resource.ts`; `tests/gauge-invoices.mjs`; `tests/gauge-base-portability.mjs` |
| `SETUP-005` | partial | `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `tests/gauge-agency.mjs`; `tests/gauge-currency.mjs`; `src/gauge/portfolio.ts`; `src/gauge/ui-portfolio.ts`; `src/gauge/cash-conversion.ts`; `src/gauge/ui-cash.ts`; `src/gauge/ui-conversion.ts`; `src/gauge/fx-rates.ts` |
| `SALES-001` | done | `src/gauge/pipeline.ts`; `src/gauge/ui-pipeline.ts`; `src/gauge/report-lineage-pipeline.ts`; `src/gauge/reports.ts`; `tests/gauge-pipeline.mjs` |
| `SALES-002` | done | `tests/gauge-invoices.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs` |
| `SALES-003` | done | `tests/gauge-commercial-proposals.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs` |
| `SALES-004` | done | `src/gauge/sales-conversion.ts`; `src/gauge/ui-pipeline.ts`; `tests/gauge-pipeline.mjs` |
| `SALES-005` | partial | `tests/gauge-project-scenario-scope.mjs`; `tests/gauge-project-scenarios.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs` |
| `RATE-002` | done | `src/gauge/rate-cards.ts`; `src/gauge/ui-rate-cards.ts`; `src/gauge/time.ts`; `src/gauge/reports.ts`; `tests/gauge-rate-cards.mjs`; `tests/gauge-currency.mjs` |
| `BUDGET-002` | done | `tests/gauge-invoices.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-base-portability.mjs` |
| `RETAINER-001` | done | `src/gauge/retainer-periods.ts`; `src/gauge/retainers.ts`; `src/gauge/retainer-consumption.ts`; `src/gauge/retainer-eligibility.ts`; `src/gauge/ui-retainers.ts`; `tests/gauge-retainers.mjs`; `tests/gauge-base-portability.mjs`; `src/gauge/retainer-fees.ts`; `tests/gauge-portfolio.mjs` |
| `RETAINER-002` | done | `src/gauge/retainer-rules.ts`; `src/gauge/retainer-consumption.ts`; `src/gauge/retainer-overages.ts`; `src/gauge/ui-retainer-rules.ts`; `src/gauge/billing.ts`; `tests/gauge-retainer-rules.mjs`; `tests/gauge-base-portability.mjs` |
| `RETAINER-003` | done | `src/gauge/retainer-statements.ts`; `src/gauge/retainer-consumption.ts`; `src/gauge/retainer-allocation.ts`; `src/gauge/retainer-source-lock.ts`; `src/gauge/ui-retainer-statement.ts`; `src/gauge/ui-retainer-allocation.ts`; `src/gauge/report-lineage-retainers.ts`; `tests/gauge-retainer-statements.mjs`; `tests/gauge-retainers.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-retainer-close.mjs` |
| `RETAINER-004` | done | `src/gauge/retainer-close.ts`; `src/gauge/retainer-adjustments.ts`; `src/gauge/retainer-consumption.ts`; `src/gauge/ui-retainer-close.ts`; `tests/gauge-retainer-close.mjs`; `tests/gauge-base-portability.mjs` |
| `RETAINER-005` | done | `tests/gauge-retainer-rules.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs` |
| `RESOURCE-001` | done | `src/gauge/resource-profiles.ts`; `src/gauge/resource-candidates.ts`; `src/gauge/resources.ts`; `src/gauge/ui-resources.ts`; `tests/gauge-resources.mjs` |
| `RESOURCE-002` | done | `src/gauge/schedule-preview.ts`; `src/gauge/schedule.ts`; `src/gauge/ui-schedule.ts`; `src/gauge/ui-capacity.ts`; `tests/gauge-schedule.mjs` |
| `RESOURCE-003` | done | `tests/gauge-schedule.mjs`; `tests/gauge-utilization.mjs`; `src/gauge/work-calendar.ts`; `src/gauge/leave-approvals.ts`; `src/gauge/ui-leave.ts`; `src/gauge/audit.ts` |
| `RESOURCE-004` | done | `src/gauge/utilization.ts`; `src/gauge/ui-utilization.ts`; `src/gauge/report-lineage-utilization.ts`; `tests/gauge-utilization.mjs` |
| `RESOURCE-005` | done | `src/gauge/demand-forecast.ts`; `src/gauge/demand-scenarios.ts`; `src/gauge/ui-demand.ts`; `src/gauge/reports.ts`; `migrations/core/0034_gauge_demand_scenarios.sql`; `tests/gauge-demand-forecast.mjs` |
| `RESOURCE-006` | missing |  |
| `DELIVERY-001` | done | `src/gauge/tasks.ts`; `src/gauge/ui-tasks.ts`; `src/gauge/expenses.ts`; `tests/gauge-tasks.mjs`; `tests/gauge-base-portability.mjs` |
| `DELIVERY-002` | done | `src/gauge/delivery-engine.ts`; `src/gauge/delivery-schedule.ts`; `src/gauge/ui-delivery-schedule.ts`; `tests/gauge-delivery.mjs`; `tests/gauge-base-portability.mjs` |
| `DELIVERY-003` | done | `src/gauge/delivery-templates.ts`; `src/gauge/ui-delivery-templates.ts`; `src/gauge/delivery-engine.ts`; `migrations/core/0026_gauge_delivery_templates.sql`; `tests/gauge-delivery-templates.mjs`; `tests/gauge-delivery.mjs`; `tests/gauge-base-portability.mjs` |
| `DELIVERY-004` | partial | `src/gauge/catalog.ts`; `src/gauge/harvest.ts` |
| `DELIVERY-005` | done | `tests/gauge-milestone-delivery.mjs`; `tests/gauge-delivery.mjs`; `tests/gauge-base-portability.mjs` |
| `DELIVERY-006` | done | `tests/gauge-delivery-templates.mjs`; `tests/gauge-delivery.mjs`; `tests/gauge-milestone-delivery.mjs` |
| `TIME-003` | done | `src/gauge/timesheets.ts`; `src/gauge/time-favorites.ts`; `src/gauge/time-policy.ts`; `src/gauge/ui-timesheets.ts`; `src/gauge/import-targets.ts`; `tests/gauge-timesheets.mjs`; `tests/gauge-base-portability.mjs` |
| `TIME-004` | done | `src/gauge/time-policy.ts`; `src/gauge/time-review.ts`; `src/gauge/time.ts`; `src/gauge/reports.ts`; `src/gauge/ui-time-policy.ts`; `tests/gauge-time-review.mjs`; `tests/gauge-timesheets.mjs`; `tests/gauge-base-portability.mjs` |
| `TIME-005` | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `TIME-006` | partial | `src/gauge/time.ts`; `tests/gauge.mjs` |
| `COST-002` | done | `tests/gauge-handoffs.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-handoffs.mjs` |
| `COST-003` | missing |  |
| `FINANCE-001` | done | `src/gauge/margin.ts`; `src/gauge/report-lineage-margin.ts`; `src/gauge/ui-margin.ts`; `src/gauge/finance-forecast.ts`; `tests/gauge-finance-forecast.mjs`; `tests/gauge-invoices.mjs` |
| `FINANCE-002` | done | `src/gauge/cash-forecast.ts`; `src/gauge/report-lineage-cash.ts`; `src/gauge/ui-cash.ts`; `src/gauge/catalog.ts`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-invoices.mjs` |
| `FINANCE-003` | done | `src/gauge/project-scenarios.ts`; `src/gauge/project-scenario-scope.ts`; `src/gauge/project-scenario-rates.ts`; `src/gauge/project-scenario-deadlines.ts`; `src/gauge/forecast-allocation-pricing.ts`; `tests/gauge-project-scenarios.mjs`; `tests/gauge-project-scenario-scope.mjs`; `tests/gauge-project-scenario-pricing.mjs`; `tests/gauge-project-scenario-rates.mjs`; `tests/gauge-project-scenario-deadlines.mjs` |
| `FINANCE-004` | done | `tests/gauge-invoices.mjs`; `tests/gauge-base-portability.mjs` |
| `FINANCE-005` | partial | `tests/gauge-handoffs.mjs` |
| `FINANCE-006` | done | `src/gauge/finance-forecast.ts`; `src/gauge/report-lineage-forecast.ts`; `src/gauge/rate-cards.ts`; `src/gauge/ui-forecast.ts`; `migrations/core/0033_gauge_rate_withdrawals.sql`; `tests/gauge-finance-forecast.mjs` |
| `FINANCE-007` | partial | `src/gauge/cash-forecast.ts`; `src/gauge/report-lineage-cash.ts`; `tests/gauge-expected-cash.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-portfolio.mjs` |
| `INVOICE-001` | partial | `src/gauge/billing.ts`; `tests/gauge.mjs`; `tests/gauge-currency.mjs`; `src/gauge/invoices.ts`; `src/gauge/ui-invoices.ts`; `tests/gauge-invoices.mjs` |
| `INVOICE-002` | done | `tests/gauge-progress.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-retainer-rules.mjs`; `tests/gauge-retainers.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs` |
| `INVOICE-003` | partial | `tests/gauge-invoices.mjs`; `tests/gauge-invoice-delivery.mjs`; `tests/live/invoice-delivery.mjs`; `tests/gauge-base-portability.mjs`; `src/gauge/invoice-delivery.ts`; `src/gauge/invoice-delivery-readback.ts`; `src/gauge/invoice-mail-provider.mjs` |
| `INVOICE-004` | done | `tests/gauge-invoice-corrections.mjs`; `tests/gauge-base-portability.mjs`; `src/gauge/invoice-corrections.ts`; `src/gauge/invoice-standing.ts`; `migrations/core/0039_gauge_invoice_corrections.sql` |
| `INVOICE-005` | missing |  |
| `INVOICE-006` | done | `src/gauge/receipts.ts`; `src/gauge/receivables.ts`; `src/gauge/invoices.ts`; `src/gauge/ui-invoices.ts`; `src/gauge/cash-forecast.ts`; `migrations/core/0040_gauge_client_receipts.sql`; `tests/gauge-receipts.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-cash-forecast.mjs` |
| `INVOICE-007` | missing |  |
| `INVOICE-008` | done | `tests/gauge-invoices.mjs`; `tests/gauge-cash-forecast.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs`; `tests/gauge-invoice-corrections.mjs`; `tests/gauge-retainer-rules.mjs` |
| `PAYMENT-001` | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/gauge-cash-forecast.mjs` |
| `PAYMENT-002` | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/fixtures/stripe-archive.mjs`; `tests/journeys/stripe-native.mjs` |
| `PAYMENT-003` | missing |  |
| `REPORT-001` | done | `src/gauge/portfolio.ts`; `src/gauge/portfolio-labor.ts`; `src/gauge/retainer-fees.ts`; `src/gauge/ui-portfolio.ts`; `tests/gauge-portfolio.mjs`; `tests/gauge-report-lineage.mjs`; `tests/gauge-base-portability.mjs` |
| `REPORT-002` | done | `src/gauge/billability.ts`; `src/gauge/ui-performance.ts`; `tests/gauge-realization.mjs` |
| `REPORT-003` | partial | `src/gauge/revenue-dashboard.ts`; `src/gauge/ui-revenue-dashboard.ts`; `src/gauge/report-lineage-revenue.ts`; `tests/gauge-revenue-dashboard.mjs`; `tests/gauge-cash-forecast.mjs` |
| `REPORT-004` | partial | `src/gauge/custom-fields.ts`; `src/gauge/custom-report.ts`; `src/gauge/saved-report-export.ts`; `src/gauge/ui-custom-fields.ts`; `tests/gauge-saved-reports.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-report-lineage.mjs` |
| `REPORT-005` | done | `src/gauge/report-lineage.ts`; `src/gauge/report-export.ts`; `src/gauge/ui-report-evidence.ts`; `tests/gauge-report-lineage.mjs`; `src/gauge/report-lineage-demand.ts`; `src/gauge/ui-demand.ts`; `tests/gauge-demand-forecast.mjs` |
| `CLIENT-001` | done | `tests/gauge-milestone-delivery.mjs`; `tests/gauge-delivery.mjs`; `.github/workflows/verify.yml` |
| `CLIENT-002` | missing |  |
| `CLIENT-003` | missing |  |
| `CLIENT-004` | missing |  |
| `CONNECT-001` | missing |  |
| `CONNECT-002` | missing |  |
| `CONNECT-003` | missing |  |
| `CONNECT-004` | missing |  |
| `CONNECT-005` | missing |  |
| `CONNECT-006` | missing |  |
| `CONNECT-007` | partial | `tests/gauge-github.mjs`; `tests/live/github.mjs`; `src/gauge/github.ts`; `API.md` |
| `CONNECT-008` | missing |  |
| `CONNECT-009` | missing |  |
| `CONNECT-010` | missing |  |
| `CONNECT-011` | missing |  |
| `CONNECT-012` | missing |  |
| `CONNECT-013` | partial | `src/gauge/harvest.ts`; `src/gauge/forecast.ts`; `tests/gauge-forecast.mjs` |
| `CONNECT-014` | missing |  |
| `CONNECT-015` | missing |  |
| `CONNECT-016` | partial | `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs` |
| `CONNECT-017` | missing |  |
| `CONNECT-018` | missing |  |
| `CONNECT-019` | partial | `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-commercial-proposals.mjs` |
| `CONNECT-020` | partial | `tests/gauge-app-api.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-utilization.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs`; `API.md` |
| `FOLLOWUP-001` | partial | `src/gauge/reports.ts`; `src/gauge/time.ts`; `tests/gauge.mjs` |
| `FOLLOWUP-002` | partial | `src/gauge/operational-cases.ts`; `src/gauge/ui-operational-cases.ts`; `tests/gauge-commercial-proposals.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs` |
| `FOLLOWUP-003` | missing |  |
| `FOLLOWUP-004` | partial | `tests/gauge-retainer-rules.mjs`; `tests/gauge-commercial-proposals.mjs`; `tests/gauge-provider-custody.mjs`; `tests/gauge-base-portability.mjs` |
| `MIGRATE-001` | done | `tests/gauge.mjs`; `tests/gauge-currency.mjs`; `tests/gauge-forecast.mjs`; `tests/gauge-kantata.mjs`; `tests/fixtures/scoro-journey.mjs`; `tests/gauge-scoro.mjs`; `tests/gauge-teamwork.mjs`; `tests/gauge-productive.mjs`; `tests/gauge-rocketlane.mjs`; `tests/gauge-float.mjs`; `tests/fixtures/scoro-restore.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs`; `tests/fixtures/harvest-finance.mjs`; `tests/gauge.mjs`; `tests/fixtures/source-custom-fields.mjs`; `tests/gauge.mjs`; `tests/gauge-currency.mjs`; `tests/fixtures/source-custom-fields.mjs`; `tests/gauge-currency.mjs`; `tests/gauge.mjs` |
| `MIGRATE-002` | partial | `src/gauge/harvest.ts`; `src/gauge/harvest-workbook.ts`; `src/gauge/harvest-time.ts`; `src/gauge/harvest-rates.ts`; `tests/gauge-harvest-history.mjs`; `tests/gauge.mjs`; `tests/gauge-currency.mjs` |
| `MIGRATE-003` | done | `src/gauge/forecast.ts`; `src/gauge/forecast-source.ts`; `tests/gauge-forecast.mjs`; `tests/gauge-base-portability.mjs`; `MOVE-IN.md` |
| `MIGRATE-004` | partial | `src/gauge/kantata-package.ts`; `src/gauge/kantata.ts`; `src/gauge/kantata-native.ts`; `src/gauge/ui-kantata.ts`; `tests/gauge-kantata.mjs`; `tests/gauge-harvest-history.mjs` |
| `MIGRATE-005` | done | `src/gauge/scoro.ts`; `src/gauge/scoro-common.ts`; `src/gauge/scoro-import.ts`; `src/gauge/scoro-native.ts`; `src/gauge/ui-scoro.ts`; `tests/gauge-scoro.mjs` |
| `MIGRATE-006` | done | `src/gauge/teamwork.ts`; `src/gauge/ui-teamwork.ts`; `tests/gauge-teamwork.mjs` |
| `MIGRATE-007` | done | `src/gauge/productive.ts`; `src/gauge/ui-productive.ts`; `tests/gauge-productive.mjs` |
| `MIGRATE-008` | partial | `src/gauge/rocketlane.ts`; `src/gauge/rocketlane-cutover.ts`; `src/gauge/ui-rocketlane.ts`; `tests/gauge-rocketlane.mjs` |
| `MIGRATE-009` | done | `tests/gauge-float.mjs`; `tests/fixtures/float-native-journey.mjs`; `tests/fixtures/float-deletion-journey.mjs`; `tests/fixtures/scoro-restore.mjs` |
| `MIGRATE-010` | partial | `src/gauge/harvest.ts`; `src/gauge/imports.ts`; `tests/gauge.mjs` |
| `GOVERN-001` | done | `src/gauge/approval-policy.ts`; `src/gauge/catalog.ts`; `tests/gauge-approvals.mjs` |
| `GOVERN-002` | done | `src/gauge/store.ts`; `src/gauge/reports.ts`; `src/gauge/time-review.ts`; `tests/gauge.mjs` |
| `GOVERN-003` | partial | `tests/gauge-handoffs.mjs`; `migrations/core/0085_gauge_client_roles.sql`; `tests/gauge-client-roles.mjs`; `tests/gauge-handoffs.mjs` |
| `GOVERN-004` | missing |  |
| `GOVERN-005` | done | `src/gauge/audit.ts`; `src/gauge/ui-audit.ts`; `src/gauge/store.ts`; `src/gauge/http.ts`; `migrations/core/0036_gauge_audit.sql`; `tests/gauge-audit.mjs` |
| `GOVERN-006` | partial | `src/gauge/privacy.ts`; `src/gauge/ui-privacy.ts`; `tests/gauge-privacy.mjs`; `tests/gauge-audit.mjs` |
| `GOVERN-007` | done | `tests/gauge-agent.mjs`; `tests/journeys/agent-custody-browser.mjs` |
| `GOVERN-008` | done | `tests/gauge-provider-custody.mjs`; `tests/gauge-pipeline.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-portability.mjs`; `tests/gauge.mjs` |
| `MOBILE-001` | partial | `src/gauge/ui.ts`; `src/gauge/ui-time.ts`; `tests/fresh-clone.mjs`; `src/gauge/ui-invoices.ts`; `tests/gauge-invoices.mjs` |
| `MOBILE-002` | missing |  |
| `MOBILE-003` | missing |  |
| `MOBILE-004` | missing |  |
| `BASE-001` | partial | `AGENTS.md`; `SEED-COMMAND-CONTRACT.md`; `src/server.ts`; `tests/gauge-cli-journey.mjs` |
| `BASE-002` | done | `tests/gauge-portability.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge.mjs` |
| `BASE-003` | partial | `base-copies.json`; `edition.json`; `src/modules/operator-auth/README.md`; `SEED-COMMAND-CONTRACT.md` |
| `BASE-004` | partial | `MOVE-IN.md`; `src/gauge/imports.ts`; `tests/gauge.mjs` |
| `BASE-005` | missing |  |
| `RECOVER-001` | partial | `tests/gauge-recovery-feasibility.mjs`; `tests/gauge-agent.mjs`; `src/gauge/recovery-feasibility.ts`; `src/gauge/ui-recovery-feasibility.ts` |
| `RECOVER-002` | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `RECOVER-003` | missing |  |
| `RECOVER-004` | missing |  |
| `RECOVER-005` | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `RECOVER-006` | partial | `tests/gauge-learning.mjs`; `tests/gauge.mjs`; `tests/gauge-base-portability.mjs`; `src/gauge/learning.ts`; `src/gauge/learning-score.ts`; `src/gauge/ui-learning.ts` |
| `RECOVER-007` | partial | `src/gauge/proposals.ts`; `tests/gauge-agent.mjs` |
| `RECOVER-008` | partial | `tests/gauge-analyst.mjs`; `tests/fixtures/analyst-portability.mjs`; `src/gauge/analyst.ts`; `src/gauge/analyst-discrepancies.ts`; `src/gauge/analyst-snapshots.ts`; `src/gauge/ui-analyst.ts` |
| `RECOVER-009` | partial | `src/gauge/imports.ts`; `src/gauge/harvest.ts`; `tests/gauge.mjs` |
| `BOUNDARY-001` | done | `src/gauge/specialist-handoff.ts`; `src/gauge/ui-specialist-handoff.ts`; `tests/gauge-handoffs.mjs`; `tests/gauge-base-portability.mjs`; `tests/gauge-invoices.mjs` |
| `BOUNDARY-002` | partial | `tests/fixtures/stripe-journey.mjs`; `tests/gauge-invoices.mjs`; `tests/fixtures/stripe-archive.mjs` |
| `BOUNDARY-003` | missing |  |
