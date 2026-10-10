const test = require("node:test");
const assert = require("node:assert/strict");
const { moveItem, moveSelection, letterIndex, parseFullName } = require("../DockModel.js");

test("moveItem moves one entry to a new index, leaving the rest in order", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("moveItem clamps the target and ignores a bad source", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 99), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, -5), ["c", "a", "b"]);
  assert.deepEqual(moveItem(["a", "b"], 5, 0), ["a", "b"]);
  assert.deepEqual(moveItem(null, 0, 1), []);
});

test("moveItem does not change its input", () => {
  const list = ["a", "b", "c"];
  moveItem(list, 0, 2);
  assert.deepEqual(list, ["a", "b", "c"]);
});

const counts = (pinned, recent) => ({ pinned, recent });
const at = (section, index) => ({ section, index });

test("with nothing selected any arrow key selects the first pinned app, else the first recent", () => {
  assert.deepEqual(moveSelection(at("", -1), "down", counts(10, 4)), at("pinned", 0));
  assert.deepEqual(moveSelection(at("", -1), "right", counts(0, 4)), at("recent", 0));
  assert.deepEqual(moveSelection(at("", -1), "down", counts(0, 0)), at("", -1));
});

test("in the six-column Pinned grid, left/right step by one and up/down by a row", () => {
  assert.deepEqual(moveSelection(at("pinned", 0), "right", counts(18, 0)), at("pinned", 1));
  assert.deepEqual(moveSelection(at("pinned", 1), "left", counts(18, 0)), at("pinned", 0));
  assert.deepEqual(moveSelection(at("pinned", 0), "left", counts(18, 0)), at("pinned", 0));
  assert.deepEqual(moveSelection(at("pinned", 17), "right", counts(18, 0)), at("pinned", 17));
  assert.deepEqual(moveSelection(at("pinned", 2), "down", counts(18, 0)), at("pinned", 8));
  assert.deepEqual(moveSelection(at("pinned", 8), "up", counts(18, 0)), at("pinned", 2));
  assert.deepEqual(moveSelection(at("pinned", 2), "up", counts(18, 0)), at("pinned", 2));
});

test("down from the last Pinned row enters Recommended, and up returns", () => {
  assert.deepEqual(moveSelection(at("pinned", 1), "down", counts(6, 4)), at("recent", 0));
  assert.deepEqual(moveSelection(at("pinned", 4), "down", counts(6, 4)), at("recent", 1));
  assert.deepEqual(moveSelection(at("pinned", 4), "down", counts(6, 1)), at("recent", 0));
  assert.deepEqual(moveSelection(at("pinned", 4), "down", counts(6, 0)), at("pinned", 4));
  assert.deepEqual(moveSelection(at("recent", 0), "up", counts(8, 4)), at("pinned", 7));
  assert.deepEqual(moveSelection(at("recent", 1), "up", counts(8, 4)), at("pinned", 7));
  assert.deepEqual(moveSelection(at("recent", 0), "up", counts(0, 4)), at("recent", 0));
});

test("in the two-column Recommended grid, left/right switch column and up/down step a row", () => {
  assert.deepEqual(moveSelection(at("recent", 0), "right", counts(0, 4)), at("recent", 1));
  assert.deepEqual(moveSelection(at("recent", 1), "left", counts(0, 4)), at("recent", 0));
  assert.deepEqual(moveSelection(at("recent", 1), "right", counts(0, 4)), at("recent", 1));
  assert.deepEqual(moveSelection(at("recent", 0), "down", counts(0, 4)), at("recent", 2));
  assert.deepEqual(moveSelection(at("recent", 2), "down", counts(0, 4)), at("recent", 2));
});

test("a stale selection past the end is pulled back inside the lists", () => {
  assert.deepEqual(moveSelection(at("pinned", 30), "left", counts(5, 0)), at("pinned", 3));
  assert.deepEqual(moveSelection(at("recent", 9), "left", counts(0, 3)), at("recent", 2));
});

test("letterIndex maps each letter to the first flat index with that letter", () => {
  const flat = [{ letter: "#" }, { letter: "A" }, { letter: "A" }, { letter: "C" }, { letter: "C" }, { letter: "Z" }];
  assert.deepEqual(letterIndex(flat), { "#": 0, A: 1, C: 3, Z: 5 });
  assert.deepEqual(letterIndex([]), {});
  assert.deepEqual(letterIndex(null), {});
});

test("parseFullName takes the account's real name, else falls back", () => {
  assert.equal(parseFullName("bernard:x:1000:1000:Bernard Maltais,,,:/home/bernard:/bin/bash", "Bernard"), "Bernard Maltais");
  assert.equal(parseFullName("bernard:x:1000:1000::/home/bernard:/bin/bash", "Bernard"), "Bernard");
  assert.equal(parseFullName("bernard:x:1000:1000:  :/home/bernard:/bin/bash", "Bernard"), "Bernard");
  assert.equal(parseFullName("", "Bernard"), "Bernard");
  assert.equal(parseFullName(null, "Bernard"), "Bernard");
  assert.equal(parseFullName("a:x:1:1:Ann Lee:/home/a:/bin/sh\n", "a"), "Ann Lee");
});
