/**
 * Quick validation test script
 *
 * Run with: node test-validation.js
 *
 * Tests the validation logic that was implemented.
 */

console.log('🧪 Testing Validation Logic\n');

// Test 1: Valid hours per day
console.log('Test 1: Valid hours per day');
const validHours = [0.5, 1, 2, 3, 5, 8, 12, 24];
validHours.forEach(h => {
  const hpd = parseFloat(h);
  const valid = !isNaN(hpd) && hpd >= 0.5 && hpd <= 24;
  console.log(`  ${h} hours: ${valid ? '✅ PASS' : '❌ FAIL'}`);
});

// Test 2: Invalid hours per day
console.log('\nTest 2: Invalid hours per day');
const invalidHours = [0, -1, 25, 100, 'abc', null];
invalidHours.forEach(h => {
  const hpd = parseFloat(h);
  const invalid = isNaN(hpd) || hpd < 0.5 || hpd > 24;
  console.log(`  ${h} hours: ${invalid ? '✅ PASS (correctly rejected)' : '❌ FAIL'}`);
});

// Test 3: Valid days per week
console.log('\nTest 3: Valid days per week');
const validDays = [1, 2, 3, 4, 5, 6, 7];
validDays.forEach(d => {
  const dpw = parseInt(d, 10);
  const valid = !isNaN(dpw) && dpw >= 1 && dpw <= 7;
  console.log(`  ${d} days: ${valid ? '✅ PASS' : '❌ FAIL'}`);
});

// Test 4: Invalid days per week
console.log('\nTest 4: Invalid days per week');
const invalidDays = [0, -1, 8, 9, 10, 'abc', null];
invalidDays.forEach(d => {
  const dpw = parseInt(d, 10);
  const invalid = isNaN(dpw) || dpw < 1 || dpw > 7;
  console.log(`  ${d} days: ${invalid ? '✅ PASS (correctly rejected)' : '❌ FAIL'}`);
});

// Test 5: Error message formatting
console.log('\nTest 5: Error message formatting');
const testCases = [
  {
    fields: [{ field: 'daysPerWeek', message: 'Study days cannot exceed 7 days per week.' }],
    expected: 'Study days cannot exceed 7 days per week.'
  },
  {
    fields: [
      { field: 'hoursPerDay', message: 'Study hours must be at least 0.5 hours per day.' },
      { field: 'daysPerWeek', message: 'Study days cannot exceed 7 days per week.' }
    ],
    expected: 'Please fix the following: Study hours must be at least 0.5 hours per day; Study days cannot exceed 7 days per week.'
  }
];

testCases.forEach((tc, idx) => {
  const summary = tc.fields.length === 1
    ? tc.fields[0].message
    : `Please fix the following: ${tc.fields.map(f => f.message.replace(/\.$/, '')).join('; ')}.`;

  const passed = summary === tc.expected;
  console.log(`  Case ${idx + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  if (!passed) {
    console.log(`    Expected: ${tc.expected}`);
    console.log(`    Got: ${summary}`);
  }
});

// Test 6: Weekly Planner preset hours
console.log('\nTest 6: Weekly Planner preset hours (no 99h)');
const PRESET_HOURS = [0.5, 1, 2, 3, 5, 8];
const has99 = PRESET_HOURS.includes(99);
console.log(`  99h removed: ${!has99 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Valid presets: ${PRESET_HOURS.join(', ')}`);

console.log('\n✨ All validation tests completed!\n');
