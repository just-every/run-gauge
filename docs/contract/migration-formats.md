# Migration format sources

The destination adapters accept the real source formats below; source permissions, filters, version and units are validated per capture. APIs complement exports when a file omits relationships. Any unavailable object requires a named supplemental capture and a visible exception; missing data is never guessed or treated as zero.

| Source | Official extraction and mapping reference |
| --- | --- |
| Harvest | [API v2 time fields](https://help.getharvest.com/api-v2/timesheets-api/timesheets/time-entries/); [CSV/Excel and PDF ZIP exports](https://support.getharvest.com/hc/en-us/articles/31625325401229-Exporting-data) |
| Forecast | [Project/Team schedule CSV orientations](https://help.getharvest.com/forecast/schedule/analyze/exporting-data/); [Harvest synchronization limits](https://help.getharvest.com/forecast/harvest-and-forecast/faqs/data-sync-harvest-and-forecast/) |
| Kantata | [OX versus SX](https://www.kantata.com/product-choice); [OX time CSV/XLSX](https://knowledge.kantata.com/hc/en-us/articles/360001493714-Export-Time-Entries); [Data Export API](https://developer.kantata.com/kantata/specification/data-exports); [Salesforce CSV ZIP export for SX](https://help.salesforce.com/s/articleView?id=sf.admin_exportdata.htm&language=en_US) |
| Scoro | [CSV/XLS filtered exports](https://support.scoro.com/hc/en-us/articles/12805208507533-Exporting-data-an-overview); [v2 API time/invoice relationships](https://api.scoro.com/api/v2) |
| Teamwork.com | [CSV/Excel timesheets](https://support.teamwork.com/projects/time-tracking/track-and-manage-time-in-my-timesheet); [v3 time JSON](https://apidocs.teamwork.com/docs/teamwork/endpoints-by-object/time-tracking/get-projects-api-v3-time-json); [retainer rules](https://support.teamwork.com/projects/project-budgets/retainer-budgets) |
| Productive | [CSV/XLSX table exports](https://help.productive.io/en/articles/2622585-table-data-export); [API schema](https://developer.productive.io/reference/download_spec?format=json); [invoice attribution distinctions](https://help.productive.io/en/articles/12059035-understanding-the-invoice-and-invoiced-fields-in-reports-budgets-and-projects) |
| Rocketlane | [Time JSON API](https://developer.rocketlane.com/reference/get-all-time-entries); [entry units and work types](https://developer.rocketlane.com/reference/create-time-entry); [resource allocations](https://developer.rocketlane.com/v1.3/reference/resource-allocations) |
| Float | [Schedule/report CSV](https://support.float.com/en/articles/1813316-export-your-data); [allocation and actual APIs](https://developer.float.com/tutorial_assigning_tasks_to_your_team.html); [pagination/deletion export guidance](https://developer.float.com/tutorial_exporting_the_schedule_data.html) |
