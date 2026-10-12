// Assert test for monthGridDays — no test runner is configured, so run it
// directly with: `npx tsx lib/pms.test.ts`.
import assert from "node:assert/strict";
import { monthGridDays } from "./pms";

// October 2026: the grid starts on Monday 2026-09-28 and spans 5 weeks.
const oct = monthGridDays("2026-10");
assert.equal(oct[0], "2026-09-28", "Oct 2026 should start on 2026-09-28");
assert.equal(oct.length, 35, "Oct 2026 should be 35 days");

// February 2027 is exactly 4 weeks: Feb 1 2027 is a Monday, 28 days.
const feb = monthGridDays("2027-02");
assert.equal(feb[0], "2027-02-01", "Feb 2027 should start on 2027-02-01");
assert.equal(feb.length, 28, "Feb 2027 should be 28 days");

// March 2026 needs 6 weeks (42 days).
const mar = monthGridDays("2026-03");
assert.equal(mar.length, 42, "Mar 2026 should be 42 days");
assert.equal(mar[mar.length - 1], "2026-04-05", "Mar 2026 grid should end on 2026-04-05");

// Every grid is a whole number of weeks.
for (const m of ["2026-01", "2026-02", "2026-11", "2027-12"]) {
  assert.equal(monthGridDays(m).length % 7, 0, `${m} grid must be a multiple of 7`);
}

console.log("pms.monthGridDays: all assertions passed");
