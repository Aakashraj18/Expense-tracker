#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Step 3 End-to-End Test
# Tests: Aggregation pipelines + recurring transaction trigger
# ─────────────────────────────────────────────────────────────────────────────

BASE="http://localhost:3001/api/v1"
# Run as: DEV_API_KEY=sk_live_... bash test_step3.sh
API_KEY="${DEV_API_KEY:-your_dev_api_key_here}"
PASS=0; FAIL=0
TS=$(date +%s)

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1 — $2\033[0m"; }
blue()  { echo -e "\033[34m── $1\033[0m"; }

check() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    green "$label"; PASS=$((PASS+1))
  else
    red "$label" "expected: $expected"
    echo "   Got: $(echo $actual | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

# ── Setup: Register + Login ───────────────────────────────────────────────
blue "Setup: Register user"
REG=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{\"firstName\":\"Charlie\",\"lastName\":\"Step3\",\"email\":\"charlie_$TS@test.com\",\"password\":\"SecurePass123\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])" 2>/dev/null)
WALLET_ID=$(curl -s "$BASE/wallets" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['wallets'][0]['id'])" 2>/dev/null)

echo "   Wallet ID: $WALLET_ID"

# ── Seed some transactions ────────────────────────────────────────────────
blue "Seeding transactions"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -s -X POST "$BASE/wallets/$WALLET_ID/transactions" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY" \
  -d "{\"type\":\"income\",\"amount\":3000,\"category\":\"Salary\",\"date\":\"$NOW\"}" > /dev/null
curl -s -X POST "$BASE/wallets/$WALLET_ID/transactions" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY" \
  -d "{\"type\":\"expense\",\"amount\":800,\"category\":\"Rent\",\"merchant\":\"LandLord Inc\",\"date\":\"$NOW\"}" > /dev/null
curl -s -X POST "$BASE/wallets/$WALLET_ID/transactions" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY" \
  -d "{\"type\":\"expense\",\"amount\":120,\"category\":\"Groceries\",\"merchant\":\"Supermart\",\"date\":\"$NOW\"}" > /dev/null
curl -s -X POST "$BASE/wallets/$WALLET_ID/transactions" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY" \
  -d "{\"type\":\"expense\",\"amount\":15,\"category\":\"Subscriptions\",\"merchant\":\"Netflix\",\"date\":\"$NOW\"}" > /dev/null
green "Transactions seeded"

# ── 1. Running Balance ─────────────────────────────────────────────────────
blue "1. GET /reports/balance"
BAL=$(curl -s "$BASE/wallets/$WALLET_ID/reports/balance" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Balance endpoint returns success" '"status":"success"' "$BAL"
check "netBalance is computed" '"netBalance"' "$BAL"
check "totalIncome is 3000" '"totalIncome":3000' "$BAL"
check "totalExpenses is 935" '"totalExpenses":935' "$BAL"

# ── 2. Category Breakdown ──────────────────────────────────────────────────
blue "2. GET /reports/categories"
CATS=$(curl -s "$BASE/wallets/$WALLET_ID/reports/categories" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Categories endpoint returns success" '"status":"success"' "$CATS"
check "Rent category present" '"category":"Rent"' "$CATS"
check "Percentage field present" '"percentage"' "$CATS"

# ── 3. Burn Rate Trend ─────────────────────────────────────────────────────
blue "3. GET /reports/trend"
TREND=$(curl -s "$BASE/wallets/$WALLET_ID/reports/trend?months=3" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Trend endpoint returns success" '"status":"success"' "$TREND"
check "Period field present" '"period"' "$TREND"

# ── 4. Budget Status ───────────────────────────────────────────────────────
blue "4. GET /reports/budget"
BUD=$(curl -s "$BASE/wallets/$WALLET_ID/reports/budget" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Budget endpoint returns success" '"status":"success"' "$BUD"
check "Spent field present" '"spent"' "$BUD"

# ── 5. Top Merchants ──────────────────────────────────────────────────────
blue "5. GET /reports/merchants"
MERCH=$(curl -s "$BASE/wallets/$WALLET_ID/reports/merchants" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Merchants endpoint returns success" '"status":"success"' "$MERCH"
check "LandLord Inc present" 'LandLord' "$MERCH"

# ── 6. Full Summary ────────────────────────────────────────────────────────
blue "6. GET /reports/summary (all pipelines in one)"
SUM=$(curl -s "$BASE/wallets/$WALLET_ID/reports/summary" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Summary returns balance" '"balance"' "$SUM"
check "Summary returns categories" '"categories"' "$SUM"
check "Summary returns trend" '"trend"' "$SUM"
check "Summary returns budget" '"budget"' "$SUM"
check "Summary returns topMerchants" '"topMerchants"' "$SUM"

# ── 7. Create Recurring Transaction ───────────────────────────────────────
blue "7. Create recurring transaction template"
PAST=$(date -u -v-1d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -u -d "yesterday" +%Y-%m-%dT00:00:00Z)
REC_TX=$(curl -s -X POST "$BASE/wallets/$WALLET_ID/transactions" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY" \
  -H "X-Idempotency-Key: rec-$TS" \
  -d "{\"type\":\"expense\",\"amount\":9.99,\"category\":\"Subscriptions\",\"merchant\":\"Spotify\",\"date\":\"$PAST\",\"recurrence\":{\"isRecurring\":true,\"frequency\":\"monthly\"}}")
check "Recurring template created" '"isTemplate":true' "$REC_TX"
check "nextRunDate set" '"nextRunDate"' "$REC_TX"

# ── 8. Trigger Recurring Worker ────────────────────────────────────────────
blue "8. POST /reports/trigger-recurring (manual trigger)"
TRIG=$(curl -s -X POST "$BASE/wallets/$WALLET_ID/reports/trigger-recurring" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Recurring worker triggered" '"status":"success"' "$TRIG"

# ── 9. Verify child transaction was created ───────────────────────────────
blue "9. Check child transaction created by worker"
sleep 1
TX_LIST=$(curl -s "$BASE/wallets/$WALLET_ID/transactions?category=Subscriptions" \
  -H "Authorization: Bearer $TOKEN" -H "X-API-Key: $API_KEY")
check "Child transaction in list" 'auto-generated' "$TX_LIST"
check "Tagged as recurring" '"recurring"' "$TX_LIST"

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────"
echo "  PASSED: $PASS  |  FAILED: $FAIL"
echo "─────────────────────────────────────"
