module.exports = {
  "extends": "ash-nazg/sauron-node",
  "parserOptions": {
      "sourceType": "module"
  },
  "settings": {
      "polyfills": [
          "Array.from",
          "Array.isArray",
          "console",
          "document.body",
          "Error",
          "JSON",
          "Object.defineProperty",
          "Object.entries",
          "Object.getPrototypeOf",
          "Object.keys",
          "Promise",
          "Set",
          "Symbol",
          "URL"
      ]
  },
  "rules": {
    "indent": ["error", 4, {"outerIIFEBody": 0}],
    // Todo: Reenable when apparent bug fixed
    'unicorn/no-unsafe-regex': 0,
    // Todo: Reenable when PR fix may address
    'jsdoc/check-types': 0,
    // Todo: Reenable and fix/inline-disable
    'promise/prefer-await-to-then': 0,
    'promise/prefer-await-to-callbacks': 0
  }
};
