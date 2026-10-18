Gauge runs on your own computer with `rer`, the Run Edit Run command. It runs on macOS, Linux or Windows with WSL2, and brings the Node and pnpm versions it needs.

## Get Gauge and start it

Install `rer` once. It installs `rer` for you alone, with its own Node if you have no Node 22 or later, and changes no shell settings: if its last line puts `rer` on your PATH, run that line before the next step.

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
```

Then start Gauge:

```sh
rer dev just-every/run-gauge
```

`rer` clones Gauge into a `run-gauge` folder, installs everything, makes you the owner and starts it. A first start can take a few minutes. When it is ready it prints a `RER_OPEN` link: open it on this computer and Gauge opens signed in as you. Keep that link private, because it signs you in. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-gauge` does both steps in one line. To start it again later, run `cd run-gauge && rer dev`.

To stop Gauge, run `rer dev --stop`. Run `rer dev` again whenever you want to use it; your records stay where they were.

## Finish setup

The first time you open Gauge it shows **Finish setup**. Check your name and email, choose your **Agency currency** and **Work timezone**, tick **I confirm this owner account is ready to use.** and choose **Finish setup**. Gauge opens on **Review**, which is empty until you add work.

New agencies default to USD and `America/Los_Angeles`. Setup also supports AUD, CAD, EUR, GBP, NZD, CHF and SGD. All supported currencies use two decimal places. New engagements and rates use the saved agency currency; existing records retain their stored currency. Gauge does not convert money.

After setup, the address Gauge prints shows a small page with **Sign in**. Gauge itself lives at `/app`.

## Add your first engagement

Gauge starts with no records; nothing is made up for you. As the owner you hold finance authority, so you can set everything up yourself.

1. On **Engagements**, add a **Client** and each **Person** who records time, with their work timezone. Tick **Contractor** for contractors.
2. Add an **Engagement**: its name, client, responsible lead, assigned people, agreed scope and work timezone.
3. Open the engagement and add **New terms / change order**: hourly or fixed fee, the budget, the estimated effort and the reason. Choose **Approve terms**. Time can only be approved against approved terms.
4. Add the engagement's tasks under **Task and remaining effort**, and any fixed-fee milestones.
5. On **Rates**, add cost and bill rates for each person, or for a service.

Enter amounts in the currency shown beside the field and durations in hours. Budgets, expenses and billing packets follow their engagement currency; a currency mismatch is refused.

## Bring in your team

On **Access**, invite each person by email. Once they accept, connect their sign-in to their person record and give them a role. Read [People and access](/docs/access) for what each role can do.

## Next

- [Time and approvals](/docs/time): record, submit and approve time.
- [Week in review](/docs/week-in-review): the page you open each Friday.
- [Move in from Harvest](/docs/move-in): bring your history across.
- [Back up and restore](/docs/backup-and-restore): keep a copy of everything.
