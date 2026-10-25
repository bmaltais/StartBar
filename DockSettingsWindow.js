// The settings window's own behaviour (docs/SPEC.md "Settings window";
// vocabulary in CONTEXT.md). No Quickshell or QML imports, so the exact same
// file loads as a JS import inside the shell and via `require` under Node for
// the test suite.
//
// Search over the groups DockConfig.js's `settingsSchema` returns, and whether
// a field can be changed right now.

// The settings window's search: the groups of `groups` (settingsSchema())
// cut down to the fields matching `query`, groups with none dropped. Every
// word of the query must appear, in any order and any case, in the field's
// label, hint, choice-option label or group title, so "start" finds the whole Start menu page and
// "delay hide" finds the hide delay. A blank query matches nothing here: the
// window shows the chosen page then.
function searchSettings(groups, query) {
  var words = String(query || "").toLowerCase().split(/\s+/).filter(function (w) { return w !== ""; });
  if (words.length === 0) return [];
  var found = [];
  for (var g = 0; g < groups.length; g++) {
    var fields = groups[g].fields.filter(function (field) {
      var options = (field.options || []).map(function (option) { return option.label; }).join(" ");
      var text = (field.label + " " + (field.hint || "") + " " + options + " " + groups[g].title).toLowerCase();
      return words.every(function (word) { return text.indexOf(word) !== -1; });
    });
    if (fields.length > 0) found.push({ title: groups[g].title, fields: fields });
  }
  return found;
}

// Whether a settings-window field can be changed now: a field with
// `enabledWhen: { key, is }` is dimmed while that other setting differs
// (a delay while auto-hide is off). `values` is effectiveView(...).values.
function fieldEnabled(field, values) {
  var rule = field && field.enabledWhen;
  if (!rule) return true;
  return !!(values && values[rule.key]) === rule.is;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    searchSettings: searchSettings,
    fieldEnabled: fieldEnabled,
  };
}
