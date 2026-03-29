---
name: onchain-api-worker
description: Implement GeckoTerminal-style onchain endpoints, JSON:API resources, and onchain-specific contract tests.
---

# Onchain API Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the work procedure.

## When to Use This Skill

Use this skill for `/onchain/*` endpoints, DeFiLlama-backed discovery/enrichment, Subsquid-backed trade or OHLCV paths, fixture-honesty hardening for onchain analytics, and any feature touching `src/modules/onchain.ts` or related provider modules.

## Work Procedure

1. Read `mission.md`, `AGENTS.md`, the assigned feature, and all assigned onchain assertions in `validation-contract.md`.
2. Read `.factory/research/onchain-data-sources.md` for DeFiLlama, Subsquid, and any other already-approved onchain source details.
3. Inspect `src/modules/onchain.ts`, related schema/data helpers, and any existing onchain tests before making changes.
4. For any arithmetic you introduce or change in onchain pricing, volume, reserve, OHLCV, or percentage paths, use `bignumber.js` rather than raw JavaScript number math. Keep precision-sensitive calculations in `BigNumber` form until storage or API serialization requires primitives.
5. Write failing tests first for the exact route family you are touching. Cover both happy-path and negative-path behavior. Mock external API responses (DeFiLlama, Subsquid, or other already-approved sources) in tests — never call live APIs.
6. Implement the route and response-shaping changes while preserving JSON:API-style `data`, `included`, `relationships`, and `meta` semantics.
7. For provider modules: implement with graceful error handling. All provider functions must catch errors, log them, and return null/empty results rather than throwing. Route handlers must fall back only to the contract-approved seeded/cached behavior when providers fail.
8. Verify network, dex, pool, and token relationship integrity explicitly.
9. Run targeted onchain tests until they pass.
10. If the manifest-wide baseline test command fails only on issues already listed in `AGENTS.md` as pre-existing, continue with scoped work; record that baseline failure in the handoff.
11. Start the local API if needed and manually verify at least one valid request plus one invalid request with curl. Prefer port 3102.
12. Run `bun run typecheck` before finishing. If your changes affect shared onchain routing or schemas, run the most relevant broader test slice too.
13. In the handoff, record exact ids/addresses/networks used in verification so follow-up workers and validators can reproduce the checks.

## Example Handoff

```json
{
  "salientSummary": "Implemented DeFiLlama provider module and wired pool list/detail endpoints to live data with graceful fallback to seeded data. Added 8 new tests covering live data paths, fallback behavior, and error handling.",
  "whatWasImplemented": "Created src/providers/defillama.ts with functions for fetching pool data (TVL, volume) and token prices from api.llama.fi. Updated onchain route handlers to call DeFiLlama first and fall back to seeded SQLite data on failure. Added mock-based tests for provider success/failure/timeout paths.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "bun test tests/app.test.ts --test-name-pattern 'onchain'",
        "exitCode": 0,
        "observation": "All onchain route tests pass including new live-data and fallback tests."
      },
      {
        "command": "bun run typecheck",
        "exitCode": 0,
        "observation": "No type regressions after adding DeFiLlama provider."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Started API on port 3102 and curled GET /onchain/networks/eth/pools",
        "observed": "Returns JSON:API pool resources. With CCXT_EXCHANGES='' the data comes from seeds."
      },
      {
        "action": "Curled GET /onchain/networks/eth/pools/not-a-pool",
        "observed": "Returns 404 with {error: 'not_found'} envelope."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/app.test.ts",
        "cases": [
          {
            "name": "onchain pool list falls back to seeded data when DeFiLlama unavailable",
            "verifies": "Graceful degradation when live provider fails."
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The endpoint requires an onchain dataset/provider not yet selected in mission state.
- JSON:API response-shape expectations are ambiguous and cannot be resolved from existing planning docs or fixtures.
- The route cannot be completed without widening infrastructure boundaries or introducing unapproved external dependencies.
- DeFiLlama, Subsquid, or another already-approved onchain source has changed in ways not reflected in `.factory/research/onchain-data-sources.md`.
