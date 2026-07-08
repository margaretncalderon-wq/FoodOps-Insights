#!/usr/bin/env bash
# Regression suite — runs all extraction / refactor tests + bug-fix tests.
# Total runtime ~30s. Exit code non-zero if ANY test fails.
#
# Multi-tenant safety net: run this before every deploy so ImportError-class
# regressions never reach a live tenant. Called by pre_deploy_regression hook.
set -euo pipefail
cd /app/backend

TESTS=(
  tests/test_p1_refactor_verification.py
  tests/test_p2_purchase_lists_extraction.py
  tests/test_p2_section_templates_extraction.py
  tests/test_p2_financials_cost_health_extraction.py
  tests/test_p2_bugfix_proposal_number.py
)

echo "🧪 Running $((${#TESTS[@]})) regression suites (148 tests baseline)..."
python -m pytest "${TESTS[@]}" --tb=line -q --no-header
echo "✅ All regression suites green."
