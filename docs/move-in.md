Gauge can bring your history across from a Harvest export, so you can try it beside Harvest and keep Harvest until you are sure. Nothing changes in Gauge until you apply a preview you have reviewed.

The importer follows Harvest's documented export format and has been tested with synthetic files only; no real agency export has been through it yet. Compare its totals with Harvest's own reports before you rely on them.

## What you upload

On **Imports**, **Preview source package** takes:

- `clients.csv`, `people.csv`, `projects.csv` and `time.csv` from Harvest, and optionally `forecast.csv` (a Forecast project schedule with periods in columns) and archived invoice PDFs;
- a manifest in JSON that names the account, the timezone, the column mapping, each project's lead and reviewed members, one historical rate per person, and your own client and month totals to reconcile against.

The repository's `MOVE-IN.md` gives every manifest field, and `tests/fixtures/harvest` holds a complete synthetic example.

## Preview, then apply

**Preview** makes no changes. It shows the records it found, the client and month totals, the reviewed project members and what it leaves out, and it refuses a package whose totals disagree with yours.

**Apply first bounded batch** applies that exact reviewed preview in small, journaled batches; **Resume bounded work** continues it. Imported time arrives as drafts, to be submitted and approved in Gauge. Imported people get no sign-in or role.

## Change your mind

- **Roll back partial import** reverses an import that has not finished.
- **Undo untouched imported records** reverses a completed import, as long as nobody has edited, approved or billed the imported records since; otherwise it refuses and names what depends on them.
- Importing the same export again reuses what is already there instead of duplicating it.

**Download retained originals and manifest** gives back the exact files you uploaded.
