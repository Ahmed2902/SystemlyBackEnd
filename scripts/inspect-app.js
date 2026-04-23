/* eslint-disable no-console */
const util = require("util");
const path = require("path");
const app = require(path.resolve(__dirname, "../dist/app.js")).default;
console.log("app keys:", Object.keys(app));
console.log("\n_app keys:", Object.keys(app._router || {}));
console.log("\napp._router (inspect):");
console.log(util.inspect(app._router, { depth: 2, colors: false }));

const stack = app._router?.stack ?? [];
console.log("\nstack length:", stack.length);
stack.forEach((layer, i) => {
  console.log("\nLayer", i);
  console.log("  name:", layer.name);
  console.log("  handle keys:", Object.keys(layer.handle || {}));
  console.log("  route present:", !!layer.route);
  if (layer.route)
    console.log(
      "  route.path:",
      layer.route.path,
      "methods:",
      Object.keys(layer.route.methods || {})
    );
  console.log("  regexp:", layer.regexp?.source?.slice(0, 200));
});
