// craco.config.js
const path = require("path");
require("dotenv").config();

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === "true",
  enableVisualEdits: process.env.REACT_APP_ENABLE_VISUAL_EDITS === "true",
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load visual editing modules only if enabled
let babelMetadataPlugin;
let setupDevServer;

if (config.enableVisualEdits) {
  babelMetadataPlugin = require("./plugins/visual-edits/babel-metadata-plugin");
  setupDevServer = require("./plugins/visual-edits/dev-server-setup");
}

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

const webpackConfig = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Disable hot reload completely if environment variable is set
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });

        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      } else {
        // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
          ],
        };
      }

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }

      // Don't run source-map-loader over node_modules. Some packages (e.g. lucide-react 1.x
      // ESM) ship sourceMappingURL comments that reference source files not published to npm,
      // which makes source-map-loader throw ENOENT and fail the dev build. We only need source
      // maps for our own code.
      webpackConfig.module.rules.forEach((rule) => {
        if (rule.enforce === 'pre' && rule.loader && rule.loader.includes('source-map-loader')) {
          rule.exclude = /node_modules/;
        }
      });
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings || []),
        /Failed to parse source map/,
      ];

      // react-select (via react-timezone-select) imports @babel/runtime helpers, which CRA's
      // ModuleScopePlugin incorrectly rejects as "outside src". Drop that guard (standard fix).
      if (webpackConfig.resolve) {
        webpackConfig.resolve.plugins = (webpackConfig.resolve.plugins || []).filter(
          (p) => p && p.constructor && p.constructor.name !== 'ModuleScopePlugin',
        );
      }

      return webpackConfig;
    },
  },
};

// Only add babel plugin if visual editing is enabled
if (config.enableVisualEdits) {
  webpackConfig.babel = {
    plugins: [babelMetadataPlugin],
  };
}

// Setup dev server: always keep the benign "ResizeObserver loop" notice out of the error
// overlay, plus visual edits / health check when those are enabled.
webpackConfig.devServer = (devServerConfig) => {
  // Apply visual edits dev server setup if enabled
  if (config.enableVisualEdits && setupDevServer) {
    devServerConfig = setupDevServer(devServerConfig);
  }

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  // The ResizeObserver "loop completed with undelivered notifications" message is a benign
  // browser notice (Radix poppers measuring long lists). Filter it out of the dev overlay so
  // it doesn't surface as a fatal runtime error.
  const prevOverlay = (devServerConfig.client && devServerConfig.client.overlay) || {};
  devServerConfig.client = {
    ...(devServerConfig.client || {}),
    overlay: {
      ...(typeof prevOverlay === 'object' ? prevOverlay : {}),
      runtimeErrors: (error) => !(error && /ResizeObserver loop/.test(error.message || '')),
    },
  };

  return devServerConfig;
};

module.exports = webpackConfig;
