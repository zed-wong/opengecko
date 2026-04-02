---
name: trust-slice-worker
description: Implement trust-slice runtime, diagnostics, and route-contract features for the scoped OpenGecko mission.
---

# Trust Slice Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the work procedure.

## When to Use This Skill

Use this skill for features that change the scoped trust slice:
- shared runtime-state and snapshot-admissibility behavior
- `/diagnostics/runtime` truthfulness and validation-mode controls
- `/simple/price`
- `/coins/markets`
- `/coins/{id}`
- cross-surface cache/state coherence for the same hot-market snapshot

## Required Skills

None.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, the assigned feature, `validation-contract.md`, and `.factory/library/{architecture,user-testing,environment,runtime}.md`.
2. Identify the exact assertion IDs in the feature’s `fulfills` list and trace which source files and tests currently exercise them. Read the existing route/runtime tests before editing code.
3. Preserve the mission boundary: route-local fixes are not enough if the behavior comes from shared freshness/runtime helpers. Prefer central changes in runtime/admissibility code before route shims.
4. Write the red test first. Add or tighten failing coverage for the assigned assertions before implementation unless an existing test already fails for the exact required behavior; if you reuse an existing failing repro, record that explicitly in the handoff.
5. Implement the smallest shared change that makes the trust state truthful across the scoped surfaces. Do not widen scope into unrelated routes or providers.
6. Re-run the narrowest relevant tests until they pass. Expand only to adjacent trust-slice suites touched by shared helpers.
7. Run `bun run typecheck` before finishing every feature.
8. If the feature affects HTTP behavior, perform manual verification with `curl`:
   - use port `3001` for normal route behavior
   - use port `3102` only when the assertion requires validation-only override routes
   - verify at least one valid request plus one negative or state-transition request
9. If the feature changes cache/state transitions, confirm the affected surfaces change together after the transition instead of drifting.
10. Do not treat full-suite failures outside the assigned milestone gate as success criteria unless the feature explicitly requires them. Follow `AGENTS.md` and `.factory/services.yaml` for the current milestone gate.
11. Stage only feature-attributable files. If unrelated dirty hunks block safe staging, return to the orchestrator instead of bundling them.
12. In the handoff, map tests and manual checks back to the exact assertions fulfilled.

## Example Handoff

```json
{
  "salientSummary": "Aligned runtime diagnostics and hot-route gating for stale-disallowed and stale-allowed modes. Added failing tests first, then made `/simple/price`, `/coins/markets`, and diagnostics agree on the same shared snapshot state.",
  "whatWasImplemented": "Updated the shared runtime/admissibility helpers so stale-disallowed mode omits or nulls hot-market data consistently, while stale-allowed mode preserves stale values with explicit diagnostics metadata. Tightened diagnostics override success envelopes and added targeted trust-slice coverage for the affected transitions.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "bun run test -- tests/runtime-diagnostics.test.ts tests/stale-data.test.ts tests/simple-price-parity.test.ts tests/coins-markets-parity.test.ts --maxWorkers=2",
        "exitCode": 0,
        "observation": "Targeted trust-slice suites passed after the shared runtime-state change."
      },
      {
        "command": "bun run typecheck",
        "exitCode": 0,
        "observation": "Typecheck stayed clean."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Started the validation API on port 3102, posted degraded_state=stale_disallowed, then curled `/diagnostics/runtime`, `/simple/price`, and `/coins/markets`.",
        "observed": "Diagnostics reported the stale-disallowed state, `/simple/price` omitted stale values, and `/coins/markets` retained the row shell with null market-bearing fields."
      },
      {
        "action": "Started the mission API on port 3001 and curled GET `/coins/bitcoin` and GET `/diagnostics/runtime` without validation overrides.",
        "observed": "The detail route returned the metadata shell and market data consistent with the runtime state reported by diagnostics."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/runtime-diagnostics.test.ts",
        "cases": [
          {
            "name": "reports stale-live and zero-live completed-boot source classes truthfully",
            "verifies": "Diagnostics readiness/source-class state matches the trust-slice contract."
          }
        ]
      },
      {
        "file": "tests/app.test.ts",
        "cases": [
          {
            "name": "coins markets and simple price stay coherent across degraded-state transitions",
            "verifies": "Hot-route behavior matches the same runtime override state."
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The assigned assertions require a new public override mode or contract shape not present in `validation-contract.md`
- A required change would introduce new infrastructure, credentials, or off-limits ports
- Shared dirty working-tree state prevents an isolated feature commit
- The feature depends on a broader unrelated route family or provider redesign
