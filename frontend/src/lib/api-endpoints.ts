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
  BASKETS: `${BASE_URL}/v1/baskets`,
  BASKET_BY_SLUG: (slug: string) => `${BASE_URL}/v1/baskets/${slug}`,
  BASKET_PERFORMANCE: (slug: string, window?: string) => {
    const url = `${BASE_URL}/v1/baskets/${slug}/performance`;
    return window ? `${url}?window=${window}` : url;
  },
  BASKET_REBALANCES: (slug: string) => `${BASE_URL}/v1/baskets/${slug}/rebalances`,

  // Trade/Quotes
  QUOTES: `${BASE_URL}/v1/quotes`,

  // Positions
  POSITIONS_PREPARE: `${BASE_URL}/v1/positions/prepare`,
  POSITIONS_SUBMIT: `${BASE_URL}/v1/positions/submit`,
  EXECUTIONS: (id: string) => `${BASE_URL}/v1/executions/${id}`,
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

  // Faucet (devnet only)
  FAUCET_AIRDROP: `${BASE_URL}/v1/faucet/airdrop`,
};
