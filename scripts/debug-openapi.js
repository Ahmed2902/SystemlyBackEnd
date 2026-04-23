/* eslint-disable no-console */
const path = require("path");

const app = require(path.resolve(__dirname, "../dist/app.js")).default;
const stack = app._router?.stack ?? [];
console.log("router stack length:", stack.length);
for (let i = 0; i < stack.length; i++) {
  const layer = stack[i];
  const hasRoute = !!layer.route;
  const routePath = layer.route ? layer.route.path : undefined;
  const methods = layer.route
    ? Object.keys(layer.route.methods || {})
    : undefined;
  const name = layer.name;
  const hasHandleStack = Array.isArray(layer.handle?.stack);
  const regexpSource = layer.regexp ? layer.regexp.source : undefined;
  console.log(i, {
    name,
    hasRoute,
    routePath,
    methods,
    hasHandleStack,
    regexpSource,
  });
}
