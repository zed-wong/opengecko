---
name: regression-gate-worker
description: Restore and promote the mission’s repository validation gates for the trust-slice hardening mission.
---

# Regression Gate Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the work procedure.

## When to Use This Skill

Use this skill for features that repair or promote the validation gate:
- failing trust-slice regression suites
- `tests/frontend-contract-script.test.ts` harness repair
- `.factory/services.yaml` test-command promotion from targeted gate to full suite
- endpoint smoke command fixes for the scoped slice
- final repository gate restoration (`full_test`, `build`, `typecheck`, `lint`)

## Required Skills

None.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, the assigned feature, `.factory/services.yaml`, and `.factory/library/user-testing.md`.
2. Reproduce the failing gate first with the exact command named in the feature or manifest. Do not start editing until you have a concrete failing signal.
3. If the failure reveals a behavior gap rather than only a harness problem, write or tighten the failing test first. If it is purely harness/config/manifest work, capture the failing command as the red signal and then add automated coverage if the feature changes runtime behavior.
4. Fix the narrowest cause of the failure. Do not silently skip tests, weaken assertions, or downgrade the gate without explicit feature scope.
5. Re-run the directly affected tests until they pass, then run the broader milestone gate required by the feature:
   - trust-slice regression repair features must finish with `commands.test`
   - final gate-promotion features must finish with `commands.full_test`, `commands.build`, `commands.typecheck`, and `commands.lint`
6. If you change shell smoke scripts or manifest commands, verify them against the mission API on `3001` and record the exact command and base URL used.
7. If a failure is caused by an external outage or off-limits environment dependency, stop and return to the orchestrator instead of baking in a workaround.
8. Stage only the files attributable to the feature, including manifest or script updates when applicable.
9. In the handoff, separate “reproduced blocker”, “implemented fix”, and “final promoted gate” evidence so the orchestrator can tell whether the gate is truly restored.

## Example Handoff

```json
{
  "salientSummary": "Repaired the frontend contract harness and promoted the mission gate from the targeted trust-slice suite to the full repository test command. Full test, build, typecheck, lint, and trust-slice smoke now pass.",
  "whatWasImplemented": "Reproduced the `spawn bash ENOENT` failure in `tests/frontend-contract-script.test.ts`, fixed the script invocation path used by the contract runner, updated `.factory/services.yaml` so the manifest `test` command now points at the full suite, and verified the scoped endpoint smoke scripts against the mission API on port 3001.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "bun run test -- tests/frontend-contract-script.test.ts --maxWorkers=2",
        "exitCode": 0,
        "observation": "The frontend contract script test passes with the repaired shell invocation."
      },
      {
        "command": "TMPDIR=/home/whoami/dev/opengecko/openGecko/data bun run test -- --maxWorkers=2",
        "exitCode": 0,
        "observation": "Full repository suite passes under the promoted mission gate."
      },
      {
        "command": "bun run build && bun run typecheck && bun run lint",
        "exitCode": 0,
        "observation": "Build, typecheck, and lint all pass."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Started the mission API on port 3001 and ran `BASE_URL=http://localhost:3001 /usr/bin/env bash scripts/modules/simple/simple.sh`.",
        "observed": "Trust-slice simple endpoint smoke passed against the mission-managed API."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/frontend-contract-script.test.ts",
        "cases": [
          {
            "name": "uses an explicit shell path when executing the contract smoke runner",
            "verifies": "The harness works in the mission environment instead of failing with ENOENT."
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The failing gate depends on an off-limits port or a missing external service you cannot restore
- The full suite still fails after feature-scope fixes and the remaining failures are outside the mission scope
- Promoting the manifest gate would seal a milestone against a known failing command that still lacks a tracked fix feature
- Repairing the harness would require changing mission boundaries or validation tooling beyond the approved plan
