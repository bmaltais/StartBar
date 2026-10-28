// Lets Node load the repo's JS modules that use QML's `.import "X.js" as X`
// (a syntax error under Node): each such line becomes `var X = require("./X.js")`.
// Require this first in a test file that loads one of them.
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const original = Module._extensions[".js"];

Module._extensions[".js"] = function (module, filename) {
  if (path.dirname(filename) !== root) return original(module, filename);
  const compile = module._compile;
  module._compile = function (source, name) {
    const patched = source.replace(/^\.import "([^"]+)" as (\w+)[ \t]*$/gm, (_, file, alias) => `var ${alias} = require("./${file}");`);
    return compile.call(this, patched, name);
  };
  return original(module, filename);
};
