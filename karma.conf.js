/* eslint-env node */

"use strict";

const path = require("path");
const { ConfigBuilder, lintConfig } = require("karma-browserstack-config");

const { env: { CONTINUOUS_INTEGRATION } } = process;

module.exports = function configure(config) {
  const coverage =
        !config.debug ? ["karma-coverage-istanbul-instrumenter"] : [];

  const customLaunchers = new ConfigBuilder({ mobile: true }).getConfigs({
    excludes: [/^IE/, "Safari9"],
  });
  lintConfig(customLaunchers);

  const options = {
    basePath: "",
    frameworks: ["mocha", "source-map-support"],
    middleware: ["serve-static-map"],
    files: [
      "node_modules/systemjs/dist/system.js",
      "test/karma-main.js",
      { pattern: "src/*.ts", included: false },
      { pattern: "test/*.ts", included: false },
    ],
    client: {
      mocha: {
        grep: config.grep,
      },
    },
    serveStaticMap: [
      { fsPath: "./node_modules", baseURL: "/base/node_modules/" },
    ],
    preprocessors: {
      "src/*.ts": ["typescript"].concat(coverage),
      "test/*.ts": ["typescript"],
    },
    typescriptPreprocessor: {
      tsconfigPath: "./test/tsconfig.json",
      compilerOptions: {
        // eslint-disable-next-line global-require
        typescript: require("typescript"),
      },
      sourcemapOptions: {
        sourceRoot: "..",
      },
    },
    reporters: ["mocha", "coverage-istanbul"],
    mochaReporter: {
      showDiff: true,
    },
    coverageIstanbulReporter: {
      // If we are running in Travis the HTML results are not useful, but
      // we want to provide coverage information for Coveralls.
      reports: CONTINUOUS_INTEGRATION ? ["lcovonly"] : ["html"],
      dir: path.join(__dirname, "coverage/"),
    },
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ["ChromeHeadless", "FirefoxHeadless"],
    browserStack: {
      project: "dom-movement",
    },
    customLaunchers,
    singleRun: false,
  };

  // Minimal localConfig if there is not one locally.
  let localConfig = {
    browserStack: {},
  };

  if (CONTINUOUS_INTEGRATION) {
    // Running on Travis. The user id and key are taken from the environment.
    localConfig.browserStack.startTunnel = true;
  }
  else {
    // Running outside Travis: we get our configuration from ./local-config, if
    // it exists.
    try {
      //
      // We need to keep turning off import/no-unresolved because localConfig
      // may not always be present.
      //
      // eslint-disable-next-line import/no-unresolved, global-require
      localConfig = require("./localConfig");
    }
    catch (ex) {} // eslint-disable-line no-empty
  }

  // Bring in the options from the localConfig file.
  Object.assign(options.browserStack, localConfig.browserStack);

  const { browsers } = config;
  if (browsers.length === 1 && browsers[0] === "all") {
    const newList =
          options.browsers.concat(Object.keys(options.customLaunchers));

    // Yes, we must modify this array in place.
    browsers.splice(0, browsers.length, ...newList);
  }

  config.set(options);
};
