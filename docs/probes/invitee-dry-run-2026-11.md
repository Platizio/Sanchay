# Invitee dry run and kill-switch drill (F27)

Dev stack: Wed 2026-11-25. Prod: Thu 2026-11-26, after the canary is reconciled and before the GO-1 meeting
on Fri 11-27. Invitees start on Mon 11-30 only after a GO-1.

Operator: Dev B. Witness: PO. Every command runs per [ops CLIs](../runbooks/ops-cli.md) as a one-off ECS task
with `SANCHAY_APP_ROLE=ops` (R-16); the local form is shown. Times in IST. This log never holds a mobile
number, a name or an email: refer to invitees by their row number in the PO's private list.

## Pass criteria

| # | Check | Pass when |
|---|---|---|
| D1 | Caps | `app/config` shows `limits.perOrderMax` `100000.00` and `limits.perInvestorPerDayMax` `200000.00`, equal to G-B11 |
| D2 | SIP flag | `flags.sipEnabled` is `false` in prod (R-06) |
| D3 | Invite seed (dev) | `ops:invite` prints only the last 4 digits; one `PILOT_INVITE_ADDED` audit row per invite |
| D4 | Gate (dev) | the invited spare number signs up; a never-invited number sees "invite required" after a correct OTP |
| D5 | Per-order cap (dev) | a ₹1,00,000.01 purchase is refused with the pilot-limit message before any FP call |
| D6 | Kill switch off (dev) | `flags.ordersEnabled` false within 1 minute; Invest shows "New investments are paused"; audit row written |
| D7 | Kill switch on (dev) | `flags.ordersEnabled` true; a ₹500 purchase reaches the consent screen; audit row written |
| D8 | Invite seed (prod) | live invites = rows in the PO's list (G-B11); re-running a row fails without a second audit row |
| D9 | Prod stays off | `flags.ordersEnabled` is `false` in prod until the owner's GO-1 decision |

## Commands

Read the public config (D1, D2, D6, D7, D9; use `api.dev.sanchay.in` on dev):

```
curl.exe -s -H "x-sanchay-client: web" https://api.sanchay.in/api/v1/app/config
```

Invite one number (D3, D8). The `--by` value is the founder's short name, never an email:

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:invite --mobile <mobile> --by <founder> --note pilot-2026-11
SANCHAY_APP_ROLE=ops pnpm ops:invite --mobile <mobile> --by <founder> --note pilot-2026-11
```

Kill switch (D6, D7, D9):

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:kill-switch --off
SANCHAY_APP_ROLE=ops pnpm ops:kill-switch --off
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:kill-switch --on
SANCHAY_APP_ROLE=ops pnpm ops:kill-switch --on
```

Read-only checks as `sanchay_readonly` (D3, D6, D7, D8):

```
SELECT count(*) FILTER (WHERE used_at IS NULL AND expires_at > now()) AS live, count(*) AS total FROM app.pilot_invites;
SELECT action, actor_id, occurred_at FROM app.audit_events WHERE action = 'PILOT_INVITE_ADDED' ORDER BY occurred_at DESC LIMIT 50;
SELECT action, actor_id, occurred_at, data FROM app.audit_events WHERE data->>'reason' = 'ops:kill-switch' ORDER BY occurred_at DESC LIMIT 5;
```

## Results

| # | Env | Time (IST) | Operator | Result | Notes |
|---|---|---|---|---|---|
| D1 | dev | | | | |
| D1 | prod | | | | |
| D2 | prod | | | | |
| D3 | dev | | | | |
| D4 | dev | | | | |
| D5 | dev | | | | |
| D6 | dev | | | | |
| D7 | dev | | | | |
| D8 | prod | | | | |
| D9 | prod | | | | |

## Sign-off

- Dev B: ____ (date)
- PO: ____ (date)

A FAIL row becomes an F26 defect-log row before the GO-1 meeting.
