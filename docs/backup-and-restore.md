Your Gauge data lives on your computer. Export it to keep a copy, to move to another computer, or before you reset.

## Export everything

Stop Gauge first, so nothing writes during the backup, then export:

```sh
rer dev --stop
rer export --output exports/gauge.rer
```

The archive holds every record, the saved agency currency and timezone, every revision history row, every receipt file and every import original, with an integrity receipt. Restoring it preserves stored currencies and amounts; it does not convert them. It leaves out sign-in sessions, credentials and private settings. Keep it somewhere safe: it contains your rates and costs.

## Restore into an empty Gauge

A restore only goes into an empty installation, and it refuses a damaged archive. On a fresh copy of Gauge, or after a reset:

```sh
rer import --input exports/gauge.rer --yes
rer setup --owner-email you@example.com
rer dev
```

Setup makes you the owner again, because sessions are never restored, and then you sign in as usual.

## Reset

`rer reset --yes` removes this copy's local data, owner and settings. Export first if you want to keep anything.

```sh
rer dev --stop
rer export --output exports/gauge.rer
rer reset --yes
```
