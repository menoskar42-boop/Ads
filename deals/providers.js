'use strict';

const { getConfig } = require('./amazon');

const PROVIDERS = {
  MANUAL: { label: 'Manual', enabled: true, requiresCredentials: false },
  AMAZON_API: { label: 'Amazon Creators API', requiresCredentials: true },
  ALIEXPRESS_API: { label: 'AliExpress', enabled: false, requiresCredentials: true },
  ALIBABA_API: { label: 'Alibaba', enabled: false, requiresCredentials: true },
  EBAY_API: { label: 'eBay', enabled: false, requiresCredentials: true },
  NOON_API: { label: 'Noon', enabled: false, requiresCredentials: true },
};

function listProviders() {
  const amazonEnabled = getConfig().configured;
  return Object.entries(PROVIDERS).map(([id, value]) => ({
    id,
    ...value,
    enabled: id === 'AMAZON_API' ? amazonEnabled : Boolean(value.enabled),
  }));
}

function assertProviderAllowed(source) {
  const provider = PROVIDERS[source];
  if (!provider) throw new Error('Unknown product source');
  const enabled = source === 'AMAZON_API' ? getConfig().configured : provider.enabled;
  if (!enabled) throw new Error(`${provider.label} is not enabled yet`);
}

module.exports = { PROVIDERS, listProviders, assertProviderAllowed };