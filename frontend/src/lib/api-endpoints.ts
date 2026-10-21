// Paths stay relative; the API client applies the configured origin once.
const BASE_URL = '';

export const API_ENDPOINTS = {
  // Health checks
  HEALTH: `${BASE_URL}/health`,
  HEALTHZ: `${BASE_URL}/healthz`,

  // Auth
  AUTH_NONCE: `${BASE_URL}/v1/auth/nonce`,
  AUTH_VERIFY: `${BASE_URL}/v1/auth/verify`,
  AUTH_REFRESH: `${BASE_URL}/v1/auth/refresh`,

  // Catalog
  TOKENS: `${BASE_URL}/v1/tokens`,
  MARKET_PRICES: (mints: string[]) => `${BASE_URL}/v1/market/prices?mints=${mints.map(encodeURIComponent).join(",")}`,
  BASKETS: `${BASE_URL}/v1/baskets`,
  BASKET_BY_SLUG: (slug: string) => `${BASE_URL}/v1/baskets/${slug}`,
  BASKET_MARKET_DATA: (slug: string) => `${BASE_URL}/v1/baskets/${slug}/market-data`,
  BASKET_MARKET_NAV_HISTORY: (slug: string, window: string) => `${BASE_URL}/v1/baskets/${slug}/market-nav-history?window=${encodeURIComponent(window)}`,
  BASKET_PERFORMANCE: (slug: string, window?: string) => {
    const url = `${BASE_URL}/v1/baskets/${encodeURIComponent(slug)}/performance`;
    return window ? `${url}?window=${window}` : url;
  },
  BASKET_REBALANCES: (slug: string) => `${BASE_URL}/v1/baskets/${slug}/rebalances`,

  // Trade/Quotes
  QUOTES: `${BASE_URL}/v1/quotes`,

  // Analytics
  SIMULATE_GRAPH: `${BASE_URL}/v1/agent/simulate-graph`,
  COMPOSE_BASKET: `${BASE_URL}/v1/agent/compose-basket`,

  // Positions
  POSITIONS_PREPARE: `${BASE_URL}/v1/positions/prepare`,
  POSITIONS_SUBMIT: `${BASE_URL}/v1/positions/submit`,
  EXECUTIONS: (id: string) => `${BASE_URL}/v1/executions/${id}`,
  EXECUTIONS_LIST: `${BASE_URL}/v1/executions`,
  EXECUTIONS_RETRY: (id: string) => `${BASE_URL}/v1/executions/${id}/retry`,
  EXECUTIONS_UNWIND: (id: string) => `${BASE_URL}/v1/executions/${id}/unwind`,
  POSITIONS: (walletAddress: string) => `${BASE_URL}/v1/positions?walletAddress=${encodeURIComponent(walletAddress)}`,
  POSITION_BY_ID: (id: string) => `${BASE_URL}/v1/positions/${id}`,
  POSITION_REBALANCE_PREPARE: (id: string) => `${BASE_URL}/v1/positions/${id}/rebalance/prepare`,
  POSITION_CLOSE_PREPARE: (id: string) => `${BASE_URL}/v1/positions/${id}/close/prepare`,
  POSITION_AUTO_REBALANCE: (id: string) => `${BASE_URL}/v1/positions/${id}/auto-rebalance`,

  // Proposals use x-admin-token; listing and approval use x-admin-approver-token.
  ADMIN_KILL_SWITCH: `${BASE_URL}/v1/admin/kill-switch`,
  ADMIN_BASKET_STATUS: (slug: string) => `${BASE_URL}/v1/admin/baskets/${slug}/status`,
  ADMIN_TOKEN_STATUS: (mint: string) => `${BASE_URL}/v1/admin/tokens/${mint}/trading-status`,
  ADMIN_BASKET_PUBLISH: (slug: string) => `${BASE_URL}/v1/admin/baskets/${slug}/publish`,
  ADMIN_PUBLISH_PROPOSALS: `${BASE_URL}/v1/admin/basket-publish-proposals`,
  ADMIN_PUBLISH_TRANSACTION: (id: string) => `${BASE_URL}/v1/admin/basket-publish-proposals/${id}/transaction`,
  ADMIN_PUBLISH_APPROVE: (id: string) => `${BASE_URL}/v1/admin/basket-publish-proposals/${id}/approve`,
  ADMIN_EXECUTIONS: `${BASE_URL}/v1/admin/executions`,
  ADMIN_FEES: `${BASE_URL}/v1/admin/fees`,
  ADMIN_RELAYER: `${BASE_URL}/v1/admin/relayer`,

  // Runtime config + notifications + stream contract
  CONFIG: `${BASE_URL}/v1/config`,
  NOTIFICATIONS: `${BASE_URL}/v1/notifications`,
  STREAM_EXECUTION: (id: string, afterSeq = 0) =>
    `${BASE_URL}/v1/stream/executions/${id}?afterSeq=${afterSeq}`,
  STREAM_POSITION: (id: string, afterSeq = 0) =>
    `${BASE_URL}/v1/stream/positions/${id}?afterSeq=${afterSeq}`,
  EXECUTION_STATUS: (id: string) => `${BASE_URL}/v1/executions/${id}/status`,
  AUTH_LOGOUT: `${BASE_URL}/v1/auth/logout`,

  // Eligibility (FR-04 / §13.1 age gate)
  ELIGIBILITY: `${BASE_URL}/v1/eligibility`,
  ELIGIBILITY_CONFIRM: `${BASE_URL}/v1/eligibility/confirm`,
  AUTH_SESSION: `${BASE_URL}/v1/auth/session`,
  DELEGATED_SIGNING: `${BASE_URL}/v1/wallets/delegated-signing`,

  // Notification preferences (FR-18)
  NOTIFICATION_PREFERENCES: `${BASE_URL}/v1/notifications/preferences`,

  // Annotations + on-chain registry verification (FR-27, FR-24)
  BASKET_ANNOTATIONS: (slug: string) => `${BASE_URL}/v1/baskets/${slug}/annotations`,
  BASKET_REGISTRY: (slug: string) => `${BASE_URL}/v1/baskets/${slug}/registry`,

  // Labs UGC (FR-25)
  LABS_BASKETS: `${BASE_URL}/v1/labs/baskets`,
  LABS_BASKET: (slug: string) => `${BASE_URL}/v1/labs/baskets/${encodeURIComponent(slug)}`,
  LABS_BASKET_MARKET_NAV_HISTORY: (slug: string, window: string) => `${BASE_URL}/v1/labs/baskets/${encodeURIComponent(slug)}/market-nav-history?window=${encodeURIComponent(window)}`,
  LABS_VOTE: (slug: string) => `${BASE_URL}/v1/labs/baskets/${encodeURIComponent(slug)}/vote`,
  LABS_COMMENTS: (slug: string) => `${BASE_URL}/v1/labs/baskets/${encodeURIComponent(slug)}/comments`,

  // FE-09 anonymized analytics (no PII)
  ANALYTICS_PAGE_VIEW: `${BASE_URL}/v1/analytics/page-view`,

  // Faucet (devnet only)
  FAUCET_AIRDROP: `${BASE_URL}/v1/faucet/airdrop`,
  FAUCET_SOL_AIRDROP: `${BASE_URL}/v1/faucet/sol-airdrop`,
};
