#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

COIN_ID="${COIN_ID:-bitcoin}"
VS_CURRENCY="${VS_CURRENCY:-usd}"
MARKET_CHART_RANGE_FROM="${MARKET_CHART_RANGE_FROM:-1773446400}"
MARKET_CHART_RANGE_TO="${MARKET_CHART_RANGE_TO:-1773964800}"

module_title "OpenGecko Mr.Market Frontend Contract Checks"

module_section "List Contract"
check_status "GET /coins/markets responds" "/coins/markets?vs_currency=${VS_CURRENCY}&per_page=10&page=1"
check_json_expr "markets returns frontend-required list fields" "/coins/markets?vs_currency=${VS_CURRENCY}&per_page=10&page=1" 'length > 0 and (.[0] | has("id") and has("symbol") and has("image") and has("market_cap_rank") and has("market_cap") and has("current_price") and has("price_change_percentage_24h"))' "first market row contains the fields required by the frontend list view"
check_json_expr "markets returns sortable numeric-or-null values" "/coins/markets?vs_currency=${VS_CURRENCY}&per_page=10&page=1" 'length > 0 and ((.[0].market_cap_rank == null or (.[0].market_cap_rank | type) == "number") and (.[0].current_price == null or (.[0].current_price | type) == "number") and (.[0].price_change_percentage_24h == null or (.[0].price_change_percentage_24h | type) == "number"))' "list sorting fields are numeric when present"

module_section "Detail Contract"
check_status "GET /coins/:id responds" "/coins/${COIN_ID}"
check_json_expr "coin detail returns frontend-required header and info fields" "/coins/${COIN_ID}" 'has("id") and has("symbol") and has("name") and (.image | type) == "object" and (.image | has("thumb")) and ((.image.thumb == null) or ((.image.thumb | type) == "string")) and (.description | type) == "object" and (.description | has("en")) and has("genesis_date") and (.market_data | type) == "object" and (.market_data | has("current_price")) and (.market_data.current_price | has("usd")) and (.market_data.current_price.usd == null or (.market_data.current_price.usd | type) == "number") and (.market_data.price_change_percentage_24h == null or (.market_data.price_change_percentage_24h | type) == "number") and (.market_data.price_change_24h == null or (.market_data.price_change_24h | type) == "number") and (.tickers | type) == "array"' "coin detail payload contains the fields required by the frontend detail page"
check_json_expr "coin detail returns ticker market identifiers for pair sorting" "/coins/${COIN_ID}" '(.tickers | type) == "array" and ((.tickers | length) == 0 or ([.tickers[].market.identifier | type] | all(. == "string")))' "every ticker exposes market.identifier when tickers are present"

module_section "Chart Contract"
check_status "GET /coins/:id/market_chart responds" "/coins/${COIN_ID}/market_chart?vs_currency=${VS_CURRENCY}&days=7"
check_json_expr "market chart returns frontend-required prices series" "/coins/${COIN_ID}/market_chart?vs_currency=${VS_CURRENCY}&days=7" '(.prices | type) == "array" and ((.prices | length) == 0 or ([.prices[] | (length == 2 and (.[0] | type) == "number" and (.[1] == null or (.[1] | type) == "number"))] | all(.)))' "market_chart returns prices as [timestamp, price] pairs"
check_status "GET /coins/:id/market_chart/range responds" "/coins/${COIN_ID}/market_chart/range?vs_currency=${VS_CURRENCY}&from=${MARKET_CHART_RANGE_FROM}&to=${MARKET_CHART_RANGE_TO}"
check_json_expr "market chart range returns frontend-required prices series" "/coins/${COIN_ID}/market_chart/range?vs_currency=${VS_CURRENCY}&from=${MARKET_CHART_RANGE_FROM}&to=${MARKET_CHART_RANGE_TO}" '(.prices | type) == "array" and ((.prices | length) == 0 or ([.prices[] | (length == 2 and (.[0] | type) == "number" and (.[1] == null or (.[1] | type) == "number"))] | all(.)))' "market_chart/range returns prices as [timestamp, price] pairs"

module_section "Ticker Endpoint"
check_status "GET /coins/:id/tickers responds" "/coins/${COIN_ID}/tickers"
check_json_expr "coin tickers endpoint returns frontend-usable pair fields" "/coins/${COIN_ID}/tickers" 'has("tickers") and (.tickers | type) == "array" and ((.tickers | length) == 0 or ([.tickers[] | has("base") and has("target") and has("last") and has("market") and (.market | has("identifier") and has("name"))] | all(.)))' "coin tickers endpoint exposes pair display and sorting fields"

module_summary
