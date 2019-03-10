/* global SystemJS */
(function main() {
  "use strict";

  const allTestFiles = [];
  const TEST_REGEXP = /test\/(?!karma-main).*\.js$/i;

  // Cancel the autorun.
  window.__karma__.loaded = function loaded() {};

  Object.keys(window.__karma__.files).forEach((file) => {
    if (TEST_REGEXP.test(file)) {
      const normalizedTestModule = file.replace(/^\/base\/|\.js$/g, "");
      allTestFiles.push(normalizedTestModule);
    }
  });

  SystemJS.config({
    baseURL: "/base/",
    paths: {
      "npm:": "node_modules/",
      "*": "npm:*",
    },
    map: {
      chai: "npm:chai/chai",
      sinon: "npm:sinon/pkg/sinon",
      "sinon-chai": "npm:sinon-chai",
    },
    packages: {
      "": {},
    },
    packageConfigPaths: [
      "npm:*/package.json",
    ],
  });

  SystemJS.amdDefine("mocha.js", [], {});

  Promise.all(allTestFiles.map(SystemJS.import.bind(SystemJS)))
    .then(window.__karma__.start);
}());
