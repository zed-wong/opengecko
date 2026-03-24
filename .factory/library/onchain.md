# Onchain

Onchain-specific knowledge for GeckoTerminal-style parity work.

**What belongs here:** JSON:API response conventions, network/dex/pool/token identity rules, include/relationship behavior, onchain search/ranking notes.

---

- Onchain endpoints should preserve JSON:API-style `data`, `included`, `relationships`, and `meta` shapes where applicable.
- Network and dex relationships are first-class and must stay internally consistent across list/detail endpoints.
- Avoid treating address casing differences as separate entities unless the contract explicitly requires rejection.
- Ranking/search/trending endpoints need deterministic behavior plus explicit invalid-param handling.


- When synthetic pool volume breakdown is needed for toggle-driven responses and only total 24h volume exists, split the volume evenly into buy/sell halves rather than inventing asymmetric data.
- For batch address endpoints, keep DB queries deterministic and then map the result rows back to request order so callers receive stable request-order output.
- Token/pool reciprocity testing should verify both directions: token-pools includes pools where the token appears as base or quote, and pool resources still reference that token address correctly.
