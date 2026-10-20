Gauge can bring your history across from a Harvest export, so you can try it beside Harvest and keep Harvest until you are sure. Nothing changes in Gauge until you apply a preview you have reviewed.

The importer follows Harvest's documented export format and has been tested with synthetic files only; no real agency export has been through it yet. Compare its totals with Harvest's own reports before you rely on them.

## What you upload

On **Imports**, **Preview source package** takes:

- `clients.csv`, `people.csv`, `projects.csv` and `time.csv` from Harvest, and optionally `forecast.csv` (Project or Team, periods in rows or columns) or an authorized `forecast.json` capture with explicit mappings and archived invoice PDFs;
- a required manifest in JSON that names the account, the currency, the timezone, the column mapping, each project's lead and reviewed members, reviewed dated historical rates per person, and your own client and month totals to reconcile against.

New agencies default to USD. The manifest must declare the package's actual currency, and it must match the agency currency saved during setup. An AUD package is refused by a USD agency with a reason such as “Harvest package uses AUD; agency uses USD.” Gauge performs no currency conversion. Imported engagements, rates and time amounts retain the declared currency; existing historical records keep theirs.

The repository's `MOVE-IN.md` gives every manifest field, and `tests/fixtures/harvest` holds a complete synthetic example.

## Preview, then apply

**Preview** makes no changes. Source time controls keep raw hours separate from exported billing rounding, reconcile billed and unbilled hours and costs, and retain invoice references and source approval/lock flags as evidence. Unknown source values stay visible; these flags never approve or lock native work. It shows the records it found, the client and month totals, the reviewed project members and what it leaves out, and it refuses a package whose totals disagree with yours.

**Apply first bounded batch** applies that exact reviewed preview in small, journaled batches; **Resume bounded work** continues it. Imported time arrives as drafts, to be submitted and approved in Gauge. Imported people get no sign-in or role.

## Change your mind

- **Roll back partial import** reverses an import that has not finished.
- **Undo untouched imported records** reverses a completed import, as long as nobody has edited, approved or billed the imported records since; otherwise it refuses and names what depends on them.
- Importing the same export again reuses what is already there instead of duplicating it.

**Download retained originals and manifest** gives back the exact files you uploaded.

Forecast source periods stay labeled on Imports, including unresolved aggregates and placeholders. Reviewed day distributions are planning allocations, not original daily facts. Team totals overlap project totals and are never added to them. See the [complete manifest and API capture mapping](https://github.com/just-every/run-gauge/blob/main/MOVE-IN.md).
