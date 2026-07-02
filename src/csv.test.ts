import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvToObjects } from "./csv.js";

test("parseCsv: simple rows", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,2,3\n"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("parseCsv: quoted fields with commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('name,note\n"Ride with, comma ""quoted""",plain\n'), [
    ["name", "note"],
    ['Ride with, comma "quoted"', "plain"],
  ]);
});

test("parseCsv: newline inside quoted field", () => {
  assert.deepEqual(parseCsv('a,b\n"line1\nline2",x\n'), [
    ["a", "b"],
    ["line1\nline2", "x"],
  ]);
});

test("parseCsv: CRLF line endings", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("parseCsv: empty fields preserved", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,,3\n"), [
    ["a", "b", "c"],
    ["1", "", "3"],
  ]);
});

test("parseCsv: no trailing empty row", () => {
  assert.equal(parseCsv("a,b\n1,2\n\n").length, 2);
});

test("csvToObjects: maps headers to values", () => {
  const rows = parseCsv("Name,Type\nMorning Ride,Ride\n");
  assert.deepEqual(csvToObjects(rows), [{ Name: "Morning Ride", Type: "Ride" }]);
});

test("csvToObjects: duplicate headers get numeric suffixes", () => {
  const rows = parseCsv("Distance,Speed,Distance\n15.31,4.7,15310.5\n");
  assert.deepEqual(csvToObjects(rows), [
    { Distance: "15.31", Speed: "4.7", "Distance 2": "15310.5" },
  ]);
});

test("csvToObjects: short rows fill missing columns with empty strings", () => {
  const rows = parseCsv("a,b,c\n1,2\n");
  assert.deepEqual(csvToObjects(rows), [{ a: "1", b: "2", c: "" }]);
});

test("csvToObjects: empty input", () => {
  assert.deepEqual(csvToObjects([]), []);
});
