# Validation Fixes - What-If Career Simulator & Weekly Learning Planner

## Summary

Fixed validation issues in the What-If Career Simulator and Weekly Learning Planner that were showing generic "Some fields need fixing" errors without indicating which fields were invalid.

## Changes Made

### 1. Backend Validation (server/src/routes/simulator.routes.js)

**Changed:**
- Updated `hoursPerDay` validation from `max(12)` to `max(24)` to match realistic daily study hours
- Added descriptive error messages to all Zod validation rules:
  - `hoursPerDay`: "Study hours must be at least 0.5 hours per day" / "Study hours cannot exceed 24 hours per day"
  - `daysPerWeek`: "Study days must be at least 1 day per week" / "Study days cannot exceed 7 days per week"

**Impact:**
- Backend now properly validates that `daysPerWeek` is between 1-7 (prevents users from entering 8 days/week)
- Error messages are specific and actionable

### 2. Error Handler Improvements (server/src/middleware/errorHandler.js)

**Changed:**
- Modified Zod error handler to build user-friendly summary messages
- Modified Mongoose validation error handler to build user-friendly summary messages
- Both now return:
  - Single field error: the specific message (e.g., "Study days cannot exceed 7 days per week")
  - Multiple field errors: combined message (e.g., "Please fix the following: Study hours must be at least 0.5 hours per day; Study days cannot exceed 7 days per week")

**Before:**
```json
{
  "error": "Invalid request",
  "message": "Some fields need fixing.",
  "fields": [...]
}
```

**After:**
```json
{
  "error": "Invalid request",
  "message": "Study days cannot exceed 7 days per week.",
  "fields": [
    {
      "field": "daysPerWeek",
      "message": "Study days cannot exceed 7 days per week."
    }
  ]
}
```

### 3. Frontend Validation - What-If Simulator (client/src/pages/CareerSimulator.jsx)

**Added:**
- New state variable `fieldErrors` to track individual field validation errors
- Frontend validation in `runSimulation()` function that validates before making API call:
  - `hoursPerDay`: must be between 0.5 and 24
  - `daysPerWeek`: must be between 1 and 7
- Frontend validation in `handleApplyPath()` function with same rules
- Visual error indicators on input fields (red border with warning icon)
- Error messages displayed directly below invalid fields
- Clear field errors when user starts typing

**HTML input constraints:**
```html
<!-- Hours per day -->
<input
  type="number"
  min="0.5"
  max="24"
  step="0.5"
  className={fieldErrors.hoursPerDay ? 'border-warn ring-1 ring-warn' : ''}
/>

<!-- Days per week -->
<input
  type="number"
  min="1"
  max="7"
  step="1"
  className={fieldErrors.daysPerWeek ? 'border-warn ring-1 ring-warn' : ''}
/>
```

**Error display:**
```jsx
{fieldErrors.daysPerWeek && (
  <p className="text-xs text-warn mt-1 flex items-center gap-1">
    <span>⚠</span>
    <span>{fieldErrors.daysPerWeek}</span>
  </p>
)}
```

**Backend error handling:**
```javascript
if (err.fields && Array.isArray(err.fields)) {
  const backendErrors = {};
  err.fields.forEach(({ field, message }) => {
    backendErrors[field] = message;
  });
  setFieldErrors(backendErrors);
}
```

### 4. Frontend Validation - Weekly Planner (client/src/pages/WeeklyPlanner.jsx)

**Changed:**
- Removed `99h` from `PRESET_HOURS` array (now: `[0.5, 1, 2, 3, 5, 8]`)
- Added new state variable `timeError` to track time constraint validation errors
- Added validation in `applyHoursFilter()`:
  - Must be a valid number
  - Must be greater than 0
  - Cannot exceed 24 hours per day
- Visual error indicator on time input field
- Error message displayed in a Callout component below the form
- Clear error when user starts typing

**Validation logic:**
```javascript
if (isNaN(hoursNum)) {
  setTimeError('Please enter a valid number.');
  return;
}
if (hoursNum <= 0) {
  setTimeError('Available hours must be greater than 0.');
  return;
}
if (hoursNum > 24) {
  setTimeError('Available hours cannot exceed 24 hours per day.');
  return;
}
```

## Test Cases

### What-If Simulator

✅ **Test 1:** Enter `hoursPerDay = 1`, `daysPerWeek = 5` → Simulation succeeds
✅ **Test 2:** Enter `hoursPerDay = 2`, `daysPerWeek = 7` → Simulation succeeds
✅ **Test 3:** Enter `hoursPerDay = 3`, `daysPerWeek = 5` → Simulation succeeds, duration reflects changes
✅ **Test 4:** Enter `daysPerWeek = 8` → Shows error: "Study days cannot exceed 7 days per week"
✅ **Test 5:** Enter `hoursPerDay = 0` → Shows error: "Study hours must be at least 0.5 hours per day"
✅ **Test 6:** Change values and re-run → New values are actually used in simulation

### Weekly Planner

✅ **Test 1:** Enter `3 hours` → Today's task budget = 3h
✅ **Test 2:** Select `1h` quick budget → Today's task budget = 1h
✅ **Test 3:** Select `5h` quick budget → Today's task budget = 5h
✅ **Test 4:** Enter `0` hours → Shows error: "Available hours must be greater than 0"
✅ **Test 5:** Enter `25` hours → Shows error: "Available hours cannot exceed 24 hours per day"
✅ **Test 6:** `99h` option removed from quick budgets

## User Experience Improvements

### Before
- Generic error: "Some fields need fixing"
- No indication of which field is invalid
- Users could enter invalid values (e.g., 8 days/week)
- Backend accepted values up to 12 hours/day only
- Weekly Planner had unrealistic 99h option

### After
- Specific error messages for each field
- Visual indicators (red border) on invalid fields
- Inline error messages below each field
- Frontend validation prevents unnecessary API calls
- Backend validation matches frontend (0.5-24 hours, 1-7 days)
- Realistic quick budget options (0.5h-8h)
- Errors clear when user starts typing
- Both frontend and backend validation work together

## Technical Details

### Data Flow Verification

The simulation correctly uses the current form values:

1. User changes `hoursPerDay` or `daysPerWeek` in UI
2. React state updates immediately
3. Click "Re-run Simulation"
4. Frontend validation runs first (prevents invalid API calls)
5. If valid, `runSimulation()` passes current state values to API:
   ```javascript
   await api.simulator.simulate({
     targetRoleKey: rk,
     hoursPerDay: hpd,
     daysPerWeek: dpw,
     pace: p,
     extraKnownKeys: eks,
     targetDate: td || undefined,
   });
   ```
6. Backend receives and validates the values
7. Backend uses the values in simulation calculation
8. Results reflect the new input values

### Non-Destructive Behavior Preserved

- What-If simulator remains non-destructive
- Running simulations does NOT modify the active roadmap
- Only clicking "Apply This Path" actually changes the user's roadmap
- Simulation results are temporary and can be re-run with different parameters

## Files Modified

1. `server/src/routes/simulator.routes.js` - Backend validation rules
2. `server/src/middleware/errorHandler.js` - Error message formatting
3. `client/src/pages/CareerSimulator.jsx` - Frontend validation and error display
4. `client/src/pages/WeeklyPlanner.jsx` - Time constraint validation and 99h removal

## Build Verification

✅ Frontend build successful (no syntax errors)
✅ All components compile correctly
✅ Bundle size: 452.29 kB (gzipped: 118.50 kB)
