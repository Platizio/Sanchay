# Runbook: Worker down

Owner: on-call developer (Dev A primary, Dev B secondary; rota per G-B12). Gate: G-E8 item 7.

## When to use
- `sanchay-{env}-worker-heartbeat-stale` (heartbeat older than 120 s, twice) or `sanchay-{env}-job-queue-age`
  (oldest job older than 120 s, twice): the worker role is not processing pg-boss jobs.
- API section: `sanchay-{env}-alb-5xx` (more than 10 target 5xx in 5 minutes) or `sanchay-{env}-target-unhealthy`
  (an unhealthy target for 3 minutes).

While the worker is down nothing reaches FP, MSG91 delivery reports are not synced and emails queue. No
money is at risk: jobs are idempotent and resume where they stopped.

## Detect

```
aws ecs describe-services --cluster sanchay-<env> --services sanchay-<env>
aws ecs list-tasks --cluster sanchay-<env> --desired-status STOPPED
curl.exe -s https://api.sanchay.in/api/v1/health
```

For a stopped task, `aws ecs describe-tasks --cluster sanchay-<env> --tasks <taskArn>` gives `stoppedReason`.
Then read the container log in CloudWatch: a boot refusal names the env invariant that failed.

## Act
1. Boot refusal (an env invariant, a secret shape): fix the task definition or secret; if a rotation just ran,
   roll back per [Credential rotation](credential-rotation.md).
2. Out of memory or a crash loop: force a new deployment once; if it repeats, roll back to the previous task
   definition revision.

```
aws ecs update-service --cluster sanchay-<env> --service sanchay-<env> --force-new-deployment
```

3. Database unreachable (health reports the DB down): check the RDS instance state and the security group;
   a Multi-AZ failover takes a few minutes and needs no action.
4. Never run a job handler by hand and never edit pg-boss tables; restarting the worker is enough.

## Verify
- `describe-services` shows `runningCount` equal to `desiredCount` on the new deployment.
- Both heartbeat and queue-age alarms are `OK` and the queue drains within 15 minutes.
- `/api/v1/health` returns 200; `sanchay-{env}-alb-5xx` is `OK`.

## Escalate
- Not healthy within 30 minutes: second developer joins; if money jobs were stuck more than 2 hours, follow
  [Stuck RECONCILING](stuck-reconciling.md) for the affected ids.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-worker-down.md`: alarm times, `stoppedReason`, task definition revisions,
  actions taken, time to recovery.
