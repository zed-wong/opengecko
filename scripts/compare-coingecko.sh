#!/usr/bin/env bash
# Compare OpenGecko vs CoinGecko real API responses
# Usage: OPENGECKO_URL=http://localhost:3000 bash scripts/compare-coingecko.sh
#
# Only tests endpoints that don't require API keys on CoinGecko free tier.

set -euo pipefail

OPENGECKO="${OPENGECKO_URL:-http://localhost:3000}"
COINGECKO="https://api.coingecko.com/api/v3"
DIFF_DIR="/tmp/opengecko-diff"

mkdir -p "$DIFF_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=0

compare() {
  local label="$1"
  local path="$2"
  local jq_filter="${3:-.}"
  TOTAL=$((TOTAL + 1))

  local cg_body og_body

  # Fetch from CoinGecko (with rate limit respect)
  cg_body=$(curl -s --max-time 15 "${COINGECKO}${path}" 2>/dev/null) || cg_body="{}"
  sleep 1.5  # respect rate limits

  # Fetch from OpenGecko
  og_body=$(curl -s --max-time 10 "${OPENGECKO}${path}" 2>/dev/null) || og_body="{}"

  # Apply jq filter and normalize (sort keys, compact)
  local cg_norm og_norm
  cg_norm=$(echo "$cg_body" | jq -S "$jq_filter" 2>/dev/null) || cg_norm="PARSE_ERROR"
  og_norm=$(echo "$og_body" | jq -S "$jq_filter" 2>/dev/null) || og_norm="PARSE_ERROR"

  # Save for inspection
  echo "$cg_norm" > "${DIFF_DIR}/${label//\//_}_cg.json"
  echo "$og_norm" > "${DIFF_DIR}/${label//\//_}_og.json"

  if [[ "$cg_norm" == "$og_norm" ]]; then
    echo -e "  ${GREEN}✅ MATCH${NC} ${label}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}⚠️  DIFF${NC} ${label}"
    echo -e "     ${CYAN}${path}${NC}"
    # Show structural diff (keys only)
    local cg_keys og_keys
    cg_keys=$(echo "$cg_body" | jq 'paths(scalars) as $p | $p | join(".")' 2>/dev/null | sort | uniq || echo "")
    og_keys=$(echo "$og_body" | jq 'paths(scalars) as $p | $p | join(".")' 2>/dev/null | sort | uniq || echo "")

    local missing_in_og extra_in_og
    missing_in_og=$(comm -23 <(echo "$cg_keys") <(echo "$og_keys") | head -10)
    extra_in_og=$(comm -13 <(echo "$cg_keys") <(echo "$og_keys") | head -10)

    if [[ -n "$missing_in_og" ]]; then
      echo -e "     ${RED}Missing in OpenGecko:${NC}"
      echo "$missing_in_og" | sed 's/^/       /'
    fi
    if [[ -n "$extra_in_og" ]]; then
      echo -e "     ${YELLOW}Extra in OpenGecko:${NC}"
      echo "$extra_in_og" | sed 's/^/       /'
    fi
    if [[ -z "$missing_in_og" && -z "$extra_in_og" ]]; then
      echo -e "     ${YELLOW}Same keys, different values${NC}"
    fi
    FAIL=$((FAIL + 1))
  fi
}

compare_keys() {
  local label="$1"
  local path="$2"
  local jq_filter="${3:-keys}"
  TOTAL=$((TOTAL + 1))

  local cg_body og_body
  cg_body=$(curl -s --max-time 15 "${COINGECKO}${path}" 2>/dev/null) || cg_body="{}"
  sleep 1.5
  og_body=$(curl -s --max-time 10 "${OPENGECKO}${path}" 2>/dev/null) || og_body="{}"

  local cg_keys og_keys
  cg_keys=$(echo "$cg_body" | jq -r "$jq_filter | sort | .[]" 2>/dev/null) || cg_keys=""
  og_keys=$(echo "$og_body" | jq -r "$jq_filter | sort | .[]" 2>/dev/null) || og_keys=""

  local missing extra
  missing=$(comm -23 <(echo "$cg_keys") <(echo "$og_keys"))
  extra=$(comm -13 <(echo "$cg_keys") <(echo "$og_keys"))

  if [[ -z "$missing" && -z "$extra" ]]; then
    echo -e "  ${GREEN}✅ KEYS MATCH${NC} ${label}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}⚠️  KEY DIFF${NC} ${label}"
    echo -e "     ${CYAN}${path}${NC}"
    if [[ -n "$missing" ]]; then
      echo -e "     ${RED}Missing:${NC}"
      echo "$missing" | sed 's/^/       /'
    fi
    if [[ -n "$extra" ]]; then
      echo -e "     ${YELLOW}Extra:${NC}"
      echo "$extra" | sed 's/^/       /'
    fi
    FAIL=$((FAIL + 1))
  fi
}

echo
echo -e "${BOLD}OpenGecko vs CoinGecko Comparison${NC}"
echo -e "OpenGecko: ${CYAN}${OPENGECKO}${NC}"
echo -e "CoinGecko: ${CYAN}${COINGECKO}${NC}"
echo -e "Diff dir:  ${CYAN}${DIFF_DIR}${NC}"
echo -e "Time:      $(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%0.s─' {1..72}; echo

echo
echo -e "${BOLD}🏥 Health${NC}"
compare "ping" "/ping"

echo
echo -e "${BOLD}💰 Simple${NC}"
compare_keys "supported_vs_currencies" "/simple/supported_vs_currencies"
compare "simple/price" "/simple/price?ids=bitcoin&vs_currencies=usd" 'to_entries | .[0].value | keys | sort'
compare "exchange_rates keys" "/exchange_rates" '.data | keys | sort'

echo
echo -e "${BOLD}🪙 Coins${NC}"
compare_keys "coins/list" "/coins/list" '.[].id'
compare "coins/list format" "/coins/list" '.[0] | keys | sort'

# Coin detail — compare top-level keys
compare_keys "coins/bitcoin top-level" "/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false"
compare "coins/bitcoin market_data keys" "/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false" '.market_data | keys | sort'

# Markets — compare first item keys
compare_keys "coins/markets item keys" "/coins/markets?vs_currency=usd&per_page=1" '.[0] | keys'

# Market chart keys
compare_keys "market_chart keys" "/coins/bitcoin/market_chart?vs_currency=usd&days=1"

# OHLC
compare "ohlc format" "/coins/bitcoin/ohlc?vs_currency=usd&days=1" 'if type == "array" and length > 0 then (.[0] | length) else "empty_or_error" end'

# Tickers
compare_keys "coins/bitcoin/tickers top-level" "/coins/bitcoin/tickers"

# Categories
compare_keys "categories/list" "/coins/categories/list" '.[].id'
compare_keys "categories[0] keys" "/coins/categories" '.[0] | keys'

echo
echo -e "${BOLD}🏦 Exchanges${NC}"
compare_keys "exchanges/list" "/exchanges/list" '.[].id'
compare_keys "exchanges[0] keys" "/exchanges?per_page=1" '.[0] | keys'
compare_keys "exchanges/binance top-level" "/exchanges/binance"
compare_keys "exchange tickers top-level" "/exchanges/binance/tickers?per_page=1"

echo
echo -e "${BOLD}📉 Derivatives${NC}"
compare_keys "derivatives[0] keys" "/derivatives" '.[0] | keys'
compare_keys "derivatives_exchanges[0] keys" "/derivatives/exchanges?per_page=1" '.[0] | keys'
compare_keys "derivatives_exchanges/list" "/derivatives/exchanges/list" '.[].id'

echo
echo -e "${BOLD}🔍 Search${NC}"
compare_keys "search top-level keys" "/search?query=bitcoin"
compare "search coins count" "/search?query=bitcoin" '.coins | length'

echo
echo -e "${BOLD}🌍 Global${NC}"
compare_keys "global top-level" "/global"
compare_keys "global.data keys" "/global" '.data | keys'

echo
echo -e "${BOLD}📁 Results${NC}"
printf '%0.s─' {1..72}; echo
echo -e "  ${GREEN}✅ Match:    ${PASS}${NC}"
echo -e "  ${YELLOW}⚠️  Diff:     ${FAIL}${NC}"
echo -e "  ${BOLD}   Total:    ${TOTAL}${NC}"
echo
echo -e "Inspect diffs: ${CYAN}ls ${DIFF_DIR}/${NC}"
echo -e "  *_cg.json = CoinGecko reference"
echo -e "  *_og.json = OpenGecko response"
echo
