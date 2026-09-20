# Weekly Planner Time-Budget Filter - Manual Test Plan

## Test Environment
- Frontend: http://localhost:3001
- Backend: http://localhost:5000
- Test Date: 2026-09-20 (Saturday)

## What Was Fixed

### ROOT CAUSE IDENTIFIED:
1. **Date Calculation Issue**: The backend was correctly calculating today's day name, but the state update in the frontend was creating a race condition where the filtered tasks weren't properly reflected in the UI.

2. **State Synchronization Issue**: The frontend was trying to manually update the plan state after filtering, but this created stale state because the backend had already saved the filtered plan. The fix reloads the entire plan from the backend after filtering to ensure consistency.

### Changes Made:

#### Backend (`weeklyPlannerService.js`):
- Added clearer comments explaining the date index conversion (JavaScript's Sunday=0 to DAY_NAMES Monday=0)
- Improved task filtering to only include tasks that fit at least 5 minutes (prevents tiny task fragments)
- Added explicit variable `now` for current date and clearer variable names
- Fixed plan saving to properly update the correct day index

#### Frontend (`WeeklyPlanner.jsx`):
- Changed `applyHoursFilter` to reload the entire plan after filtering instead of manually merging state
- This ensures the UI always reflects what the backend saved, eliminating state synchronization bugs
- Added error handling to clear filterInfo on error

## Manual Test Cases

### Test 1: 0.5h Filter (30 minutes)
1. Navigate to `/weekly-planner`
2. Note the current tasks shown for today (Saturday, Sep 20)
3. Enter `0.5` in the input field OR click the "0.5h" quick button
4. Click "Filter Today"
5. **Expected Result**:
   - Banner shows: "Time Budget Applied for Saturday"
   - Shows: "X planned of 0.5h (30m) available budget"
   - Saturday's task list shows ONLY tasks totaling ≤ 30 minutes
   - Task count and duration should match the banner

### Test 2: 1h Filter (60 minutes)
1. Clear previous filter OR refresh page
2. Enter `1` in the input field OR click the "1h" quick button
3. Click "Filter Today"
4. **Expected Result**:
   - Banner shows tasks totaling ≤ 60 minutes for Saturday
   - More tasks than 0.5h test (if available)
   - Total duration ≤ 1h

### Test 3: 2h Filter (120 minutes)
1. Enter `2` OR click "2h"
2. Click "Filter Today"
3. **Expected Result**:
   - Banner shows tasks totaling ≤ 120 minutes
   - More tasks than 1h test (if available)

### Test 4: 5h Filter (300 minutes)
1. Enter `5` OR click "5h"
2. Click "Filter Today"
3. **Expected Result**:
   - Shows all available priority tasks up to 5 hours
   - If total pending tasks < 5h, banner says "All Available Priority Tasks Selected"
   - Shows actual allocated time vs requested time

### Test 5: 8h Filter (480 minutes)
1. Enter `8` OR click "8h"
2. Click "Filter Today"
3. **Expected Result**:
   - Shows maximum available tasks (up to 8 hours)
   - Does NOT invent tasks to fill the budget
   - Banner clearly shows allocated vs requested time

### Test 6: Sequential Changes (State Update Test)
1. Click "0.5h" → verify tasks update
2. Click "2h" → verify MORE tasks appear immediately
3. Click "1h" → verify tasks REDUCE immediately
4. Click "5h" → verify tasks INCREASE immediately
5. **Expected Result**:
   - Each click should immediately update the visible task list
   - No need to refresh the page between clicks
   - Each state change should be reflected in the UI

### Test 7: Reset Filter
1. Apply any filter (e.g., "2h")
2. Click "Reset Filter" button
3. **Expected Result**:
   - Returns to the normal weekly schedule
   - All days show their original allocations
   - Filter banner disappears

### Test 8: Page Refresh (Persistence Test)
1. Apply a filter (e.g., "3h")
2. Refresh the browser (F5)
3. **Expected Result**:
   - Filter should NOT persist (returns to normal weekly view)
   - No corrupted data
   - Can apply new filters normally

### Test 9: Correct Day Verification
1. Check the system date/time
2. Apply any filter
3. **Expected Result**:
   - Banner should show the correct day name (Saturday, Sep 20, 2026)
   - The correct day in the schedule should be highlighted with "TODAY" badge
   - Tasks should be filtered for the actual current day, not Monday or Sunday

### Test 10: Edge Cases

#### No Pending Tasks Available:
1. Complete all tasks OR test with a roadmap that has no pending tasks
2. Apply any filter
3. **Expected**: Banner shows "No pending tasks available for today"

#### Very Low Time Budget:
1. Enter `0.25` (15 minutes)
2. **Expected**: Only shows tasks that fit in 15 minutes OR shows "No tasks fit in this budget"

#### Invalid Input:
1. Enter `-1` → Should show error: "Available hours must be greater than 0"
2. Enter `50` → Should show error: "Available hours cannot exceed 24 hours per day"
3. Enter `abc` → Should show error: "Please enter a valid number"

## Verification Checklist

After running all tests, verify:

- [ ] Time filter correctly calculates today as Saturday (not Sunday or Monday)
- [ ] Each hour value (0.5h, 1h, 2h, 3h, 5h, 8h) produces DIFFERENT task allocations
- [ ] Changing from low to high hours shows MORE tasks
- [ ] Changing from high to low hours shows FEWER tasks
- [ ] Total allocated minutes never exceeds requested budget
- [ ] Banner shows correct day name
- [ ] "TODAY" badge appears on the correct day
- [ ] Reset filter restores original weekly schedule
- [ ] No JavaScript errors in browser console
- [ ] No network errors in browser DevTools Network tab
- [ ] Backend logs show successful API calls to `/api/agent/today?hours=X`

## Browser Console Check

Open DevTools (F12) and check:
1. No errors in Console tab
2. Network tab shows successful requests to `/api/agent/today?hours=X`
3. Response payload contains filtered tasks matching the requested budget

## Files Changed

1. **server/src/services/weeklyPlannerService.js** - Fixed getTodayTasks() function
2. **client/src/pages/WeeklyPlanner.jsx** - Fixed applyHoursFilter() function

## Summary

The fix addresses two critical issues:
1. **Date calculation clarity** - Added detailed comments and explicit variables
2. **State synchronization** - Changed from manual state merging to full plan reload after filtering

This ensures the time-budget filter now properly recalculates task allocation based on the selected daily budget and displays the results correctly in the UI.
