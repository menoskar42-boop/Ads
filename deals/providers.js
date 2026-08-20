'use strict';

const PROVIDERS = {
  MANUAL: { label: 'Manual', enabled: true, requiresCredentials: false },
  AMAZON_API: { label: 'Amazon Creators API', enabled: false, requiresCredentials: true },
  ALIEXPRESS_API: { label: 'AliExpress', enabled: false, requiresCredentials: true },
  ALIBABA_API: { label: 'Alibaba', enabled: false, requiresCredentials: true },
  EBAY_API: { label: 'eBay', enabled: false, requiresCredentials: true },
  NOON_API: { label: 'Noon', enabled: false, requiresCredentials: true },
};

function listProviders() {
  return Object.entries(PROVIDERS).map(([id, value]) => ({ id, ...value }));
}

function assertProviderAllowed(source) {
  const provider = PROVIDERS[source];
  if (!provider) throw new Error('Unknown product source');
  if (!provider.enabled) throw new Error(`${provider.label} is not enabled yet`);
}

module.exports = { PROVIDERS, listProviders, assertProviderAllowed };