const appJson = require('./app.json');

const BLOCKED_PLUGIN = 'react-native-purchases';

module.exports = ({ config }) => {
  const base = appJson.expo ?? config ?? {};
  const plugins = Array.isArray(base.plugins) ? base.plugins : [];

  return {
    ...base,
    plugins: plugins.filter((entry) => {
      if (typeof entry === 'string') return entry !== BLOCKED_PLUGIN;
      if (Array.isArray(entry)) return entry[0] !== BLOCKED_PLUGIN;
      return true;
    }),
  };
};
