#!/bin/bash

# Quick verification script for the time-budget filter fix

echo "=========================================="
echo "Weekly Planner Time-Budget Filter Fix"
echo "Verification Script"
echo "=========================================="
echo ""

# Check servers are running
echo "1. Checking servers..."
echo ""

echo "   Backend (port 5000):"
BACKEND=$(curl -s http://localhost:5000/api/health 2>&1)
if [[ $BACKEND == *"status"* ]]; then
    echo "   ✅ Backend is running"
else
    echo "   ❌ Backend is NOT running"
    echo "   Start with: cd server && npm start"
    exit 1
fi

echo ""
echo "   Frontend (port 3001):"
FRONTEND=$(curl -s http://localhost:3001 2>&1)
if [[ $FRONTEND == *"html"* ]]; then
    echo "   ✅ Frontend is running"
else
    echo "   ❌ Frontend is NOT running"
    echo "   Start with: cd client && npm run dev"
    exit 1
fi

echo ""
echo "2. Files modified:"
echo "   ✅ server/src/services/weeklyPlannerService.js"
echo "   ✅ client/src/pages/WeeklyPlanner.jsx"

echo ""
echo "3. Key changes:"
echo "   ✅ Backend: Improved date calculation and task filtering"
echo "   ✅ Frontend: Changed to reload plan after filtering (fixes state sync)"
echo "   ✅ Added minimum 5-minute task duration"
echo "   ✅ Improved error handling"

echo ""
echo "4. Current date/time:"
date

echo ""
echo "=========================================="
echo "✅ System is ready for manual testing!"
echo "=========================================="
echo ""
echo "Open in browser: http://localhost:3001/weekly-planner"
echo ""
echo "Test the following scenarios:"
echo ""
echo "  1. Click '0.5h' → Verify tasks show ≤ 30 minutes"
echo "  2. Click '1h'   → Verify MORE tasks appear"
echo "  3. Click '2h'   → Verify even MORE tasks appear"
echo "  4. Click '5h'   → Verify maximum tasks up to 5h"
echo "  5. Click '8h'   → Verify maximum tasks up to 8h"
echo "  6. Change 5h → 1h → Verify tasks REDUCE immediately"
echo "  7. Click 'Reset Filter' → Verify normal schedule returns"
echo "  8. Check banner shows correct day: Saturday, Sep 20"
echo ""
echo "For detailed test plan, see: test-time-filter.md"
echo "For fix explanation, see: FIX-SUMMARY.md"
echo ""
