import test from "ava";
import fs from "fs";
import path from "path";
import rimraf from "rimraf";
import { satisfies } from "semver";
import webpack from "webpack";
import createTestDirectory from "./helpers/createTestDirectory";
import { parseSourceMap } from "../src/index";

const outputDir = path.join(__dirname, "output/loader");
const babelLoader = path.join(__dirname, "../lib");
const globalConfig = {
  mode: "development",
  entry: path.join(__dirname, "fixtures/basic.js"),
  module: {
    rules: [
      {
        test: /\.jsx?/,
        loader: babelLoader,
        options: {
          presets: ["@babel/preset-env"],
        },
        exclude: /node_modules/,
      },
    ],
  },
};

// Create a separate directory for each test so that the tests
// can run in parallel
test.beforeEach.cb(t => {
  createTestDirectory(outputDir, t.title, (err, directory) => {
    if (err) return t.end(err);
    t.context.directory = directory;
    t.end();
  });
});

test.afterEach.cb(t => rimraf(t.context.directory, t.end));

test.cb("should transpile the code snippet", t => {
  const config = Object.assign({}, globalConfig, {
    output: {
      path: t.context.directory,
    },
  });

  webpack(config, (err, stats) => {
    t.is(err, null);
    t.deepEqual(stats.compilation.errors, []);
    t.deepEqual(stats.compilation.warnings, []);

    fs.readdir(t.context.directory, (err, files) => {
      t.is(err, null);
      t.true(files.length === 1);
      fs.readFile(path.resolve(t.context.directory, files[0]), (err, data) => {
        t.is(err, null);
        const test = "var App = function App()";
        const subject = data.toString();

        t.not(subject.indexOf(test), -1);

        t.end();
      });
    });
  });
});

test.cb("should not throw error on syntax error", t => {
  const config = Object.assign({}, globalConfig, {
    entry: path.join(__dirname, "fixtures/syntax.js"),
    output: {
      path: t.context.directory,
    },
  });

  webpack(config, (err, stats) => {
    t.true(stats.compilation.errors.length === 1);
    t.true(stats.compilation.errors[0] instanceof Error);
    t.deepEqual(stats.compilation.warnings, []);

    t.end();
  });
});

test.cb("should not throw without config", t => {
  const config = {
    mode: "development",
    entry: path.join(__dirname, "fixtures/basic.js"),
    output: {
      path: t.context.directory,
    },
    module: {
      rules: [
        {
          test: /\.jsx?/,
          use: babelLoader,
          exclude: /node_modules/,
        },
      ],
    },
  };

  webpack(config, (err, stats) => {
    t.is(err, null);
    t.deepEqual(stats.compilation.errors, []);
    t.deepEqual(stats.compilation.warnings, []);

    t.end();
  });
});

test.cb(
  "should return compilation errors with the message included in the stack trace",
  t => {
    const config = Object.assign({}, globalConfig, {
      entry: path.join(__dirname, "fixtures/syntax.js"),
      output: {
        path: t.context.directory,
      },
    });
    webpack(config, (err, stats) => {
      t.is(err, null);
      t.deepEqual(stats.compilation.warnings, []);
      const moduleBuildError = stats.compilation.errors[0];
      const babelLoaderError = moduleBuildError.error;
      t.regex(babelLoaderError.stack, /Unexpected token/);
      t.end();
    });
  },
);

test.cb("should load ESM config files", t => {
  const config = Object.assign({}, globalConfig, {
    entry: path.join(__dirname, "fixtures/constant.js"),
    output: {
      path: t.context.directory,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: babelLoader,
          exclude: /node_modules/,
          options: {
            // Use relative path starting with a dot to satisfy module loader.
            // https://github.com/nodejs/node/issues/31710
            // File urls doesn't work with current resolve@1.12.0 package.
            extends: (
              "." +
              path.sep +
              path.relative(
                process.cwd(),
                path.resolve(__dirname, "fixtures/babelrc.mjs"),
              )
            ).replace(/\\/g, "/"),
            babelrc: false,
          },
        },
      ],
    },
  });

  webpack(config, (err, stats) => {
    t.is(err, null);
    // Node supports ESM without a flag starting from 12.13.0 and 13.2.0.
    if (satisfies(process.version, `^12.13.0 || >=13.2.0`)) {
      t.deepEqual(
        stats.compilation.errors.map(e => e.message),
        [],
      );
    } else {
      t.is(stats.compilation.errors.length, 1);
      const moduleBuildError = stats.compilation.errors[0];
      const babelLoaderError = moduleBuildError.error;
      t.true(babelLoaderError instanceof Error);
      // Error messages are slightly different between versions:
      // "modules aren't supported" or "modules not supported".
      t.regex(babelLoaderError.message, /supported/i);
    }
    t.deepEqual(stats.compilation.warnings, []);
    t.end();
  });
});

// passing source map json to loader
const sampleSourceMapJson = {
  version: 3,
  sources: ["/home/aqua/coding/atri/src/app/app.tsx"],
  names: [],
  mappings: ";;;AAAA",
  sourcesContent: [
    'ReactDOM.render(, document.body.querySelector("#root"))\\n',
  ],
};

const sourceMapJsonTestAssetsPass = [
  [JSON.stringify(sampleSourceMapJson), sampleSourceMapJson],
  [undefined, undefined],
  ["kaljsdfkl", "kaljsdfkl"],
  [false, false],
  [{}, {}],
];

test("passing source map json to loader", t => {
  sourceMapJsonTestAssetsPass.forEach(([input, expected]) => {
    t.deepEqual(parseSourceMap(input), expected);
  });
});
