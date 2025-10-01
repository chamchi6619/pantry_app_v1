const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Fix for web builds and Supabase
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'mjs'];

// Add alias for Supabase auth-js resolution
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@supabase/auth-js/lib/types': path.resolve(__dirname, 'node_modules/@supabase/auth-js/dist/main/lib/types.js'),
  '@supabase/auth-js/lib/errors': path.resolve(__dirname, 'node_modules/@supabase/auth-js/dist/main/lib/errors.js'),
};

// Fix for Supabase auth-js module resolution
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix Supabase auth-js imports
  if (context.originModulePath && context.originModulePath.includes('@supabase/auth-js')) {
    if (moduleName === './lib/types') {
      const typesPath = path.resolve(__dirname, 'node_modules/@supabase/auth-js/dist/main/lib/types.js');
      return {
        type: 'sourceFile',
        filePath: typesPath,
      };
    }
    if (moduleName === './lib/errors') {
      const errorsPath = path.resolve(__dirname, 'node_modules/@supabase/auth-js/dist/main/lib/errors.js');
      return {
        type: 'sourceFile',
        filePath: errorsPath,
      };
    }
    if (moduleName === './lib/locks') {
      const locksPath = path.resolve(__dirname, 'node_modules/@supabase/auth-js/dist/main/lib/locks.js');
      return {
        type: 'sourceFile',
        filePath: locksPath,
      };
    }
  }

  // Use default resolver
  return context.resolveRequest(context, moduleName, platform);
};

// Handle import.meta
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_fnames: true,
    mangle: {
      keep_fnames: true,
    },
  },
};

module.exports = config;