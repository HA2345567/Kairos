import { API_ENDPOINTS } from "./api-endpoints";
import type {
  HealthResponse,
  HealthzResponse,
  QuoteResponse,
  PreparePositionRequest,
  PreparePositionResponse,
  SubmitPositionRequest,
  SubmitPositionResponse,
  Execution,
  PositionsResponse,
  Position,
  AuthNonceResponse,
  AuthVerifyResponse,
  AuthRefreshResponse,
  FaucetAirdropResponse,
  AdminKillSwitchResponse,
  BasketsResponse,
  BasketBySlugResponse,
  BasketPublishProposal,
  BasketVersion,
  TokenRegistryResponse,
  RebalancesResponse,
  ErrorResponse,
  NotFoundError,
  AppErrorCode
} from "./api-types";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: AppErrorCode | string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class KairosApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private refreshToken: string | null = null;
  private authWallet: string | null = null;

  constructor(baseUrl: string = import.meta.env.VITE_API_URL || '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    if (typeof window !== "undefined") {
      this.authToken = window.sessionStorage.getItem("kairos.auth.token");
      this.refreshToken = window.sessionStorage.getItem("kairos.auth.refresh");
      this.authWallet = window.sessionStorage.getItem("kairos.auth.wallet");
    }
  }

  setAuth(token: string, refreshToken?: string, walletAddress?: string) {
    this.authToken = token;
    this.refreshToken = refreshToken ?? null;
    this.authWallet = walletAddress ?? this.authWallet;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("kairos.auth.token", token);
      if (this.refreshToken) window.sessionStorage.setItem("kairos.auth.refresh", this.refreshToken);
      if (this.authWallet) window.sessionStorage.setItem("kairos.auth.wallet", this.authWallet);
    }
  }

  clearAuth() {
    this.authToken = null;
    this.refreshToken = null;
    this.authWallet = null;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("kairos.auth.token");
      window.sessionStorage.removeItem("kairos.auth.refresh");
      window.sessionStorage.removeItem("kairos.auth.wallet");
    }
  }

  isAuthenticatedFor(walletAddress: string): boolean {
    if (!this.authToken || this.authWallet !== walletAddress) return false;
    try {
      const encoded = (this.authToken.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(encoded + "=".repeat((4 - (encoded.length % 4)) % 4))) as { exp?: number };
      return Number.isFinite(payload.exp) && Number(payload.exp) > Math.floor(Date.now() / 1000) + 15;
    } catch {
      return false;
    }
  }

  async refreshAuth(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const result = await this.refresh(this.refreshToken);
      this.setAuth(result.token, result.refreshToken, this.authWallet ?? undefined);
      return true;
    } catch {
      this.clearAuth();
      return false;
    }
  }

  private getHeaders(additional: Record<string, string> = {}): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return { ...headers, ...additional };
  }

  private idempotencyHeaders(idempotencyKey: string): Record<string, string> {
    return { 'Idempotency-Key': idempotencyKey };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json();

    if (!response.ok) {
      // Handle API error responses
      if (data.error && typeof data.error === 'string') {
        throw new ApiError(
          response.status,
          data.error as AppErrorCode,
          data.message || 'Unknown error'
        );
      }

      throw new ApiError(
        response.status,
        'UNKNOWN_ERROR',
        data.message || 'Unknown error'
      );
    }

    return data as T;
  }

  async get<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(headers),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(headers),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }

  // Health endpoints
  async health(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health');
  }

  async healthz(): Promise<HealthzResponse> {
    return this.get<HealthzResponse>('/healthz');
  }

  // Auth endpoints
  async getNonce(walletAddress: string): Promise<AuthNonceResponse> {
    return this.post<AuthNonceResponse>(API_ENDPOINTS.AUTH_NONCE, {
      walletAddress
    });
  }

  async verify(walletAddress: string, signature: string, message: string): Promise<AuthVerifyResponse> {
    return this.post<AuthVerifyResponse>(API_ENDPOINTS.AUTH_VERIFY, {
      walletAddress,
      signature,
      message
    });
  }

  async refresh(refreshToken: string): Promise<AuthRefreshResponse> {
    return this.post<AuthRefreshResponse>(API_ENDPOINTS.AUTH_REFRESH, {
      refreshToken
    });
  }

  // Catalog endpoints
  async getTokens(): Promise<TokenRegistryResponse> {
    return this.get<TokenRegistryResponse>(API_ENDPOINTS.TOKENS);
  }

  async getBaskets() {
    return this.get<BasketsResponse>(API_ENDPOINTS.BASKETS);
  }

  async getBasketBySlug(slug: string) {
    return this.get<BasketBySlugResponse>(API_ENDPOINTS.BASKET_BY_SLUG(slug));
  }

  async getBasketPerformance(slug: string, window?: string) {
    const endpoint = API_ENDPOINTS.BASKET_PERFORMANCE(slug, window);
    return this.get(endpoint);
  }

  async getBasketRebalances(slug: string) {
    return this.get<RebalancesResponse>(API_ENDPOINTS.BASKET_REBALANCES(slug));
  }

  // Trade/Quotes endpoints
  async getQuote(basket: string, usdcAmount: number): Promise<QuoteResponse> {
    return this.post<QuoteResponse>(API_ENDPOINTS.QUOTES, {
      basket,
      usdcAmount
    });
  }

  // Positions endpoints
  async preparePosition(request: PreparePositionRequest): Promise<PreparePositionResponse> {
    return this.post<PreparePositionResponse>(
      API_ENDPOINTS.POSITIONS_PREPARE,
      request,
      this.idempotencyHeaders(request.idempotencyKey),
    );
  }

  async submitPosition(request: SubmitPositionRequest): Promise<SubmitPositionResponse> {
    return this.post<SubmitPositionResponse>(
      API_ENDPOINTS.POSITIONS_SUBMIT,
      request,
      this.idempotencyHeaders(request.idempotencyKey ?? `submit:${request.executionId}`),
    );
  }

  async getExecution(id: string): Promise<Execution> {
    const response = await this.get<{ execution: Execution }>(API_ENDPOINTS.EXECUTIONS(id));
    return response.execution;
  }

  async retryExecution(id: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const response = await this.post<{ execution: Execution }>(API_ENDPOINTS.EXECUTIONS_RETRY(id), {
      idempotencyKey,
      walletAddress
    }, this.idempotencyHeaders(idempotencyKey));
    return response.execution;
  }

  async unwindExecution(id: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const response = await this.post<{ execution: Execution }>(API_ENDPOINTS.EXECUTIONS_UNWIND(id), {
      idempotencyKey,
      walletAddress
    }, this.idempotencyHeaders(idempotencyKey));
    return response.execution;
  }

  async getPositions(walletAddress: string): Promise<PositionsResponse> {
    return this.get<PositionsResponse>(API_ENDPOINTS.POSITIONS(walletAddress));
  }

  async getPosition(id: string): Promise<Position> {
    return (await this.get<{ position: Position }>(API_ENDPOINTS.POSITION_BY_ID(id))).position;
  }

  async prepareRebalance(id: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const response = await this.post<{ execution: Execution }>(API_ENDPOINTS.POSITION_REBALANCE_PREPARE(id), {
      idempotencyKey,
      walletAddress
    }, this.idempotencyHeaders(idempotencyKey));
    return response.execution;
  }

  async prepareClosePreview(id: string) {
    return this.post(
      API_ENDPOINTS.POSITION_CLOSE_PREPARE(id),
      {},
      this.idempotencyHeaders(`close-preview:${id}`),
    );
  }

  async submitCloseExecution(id: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const response = await this.post<{ execution: Execution }>(API_ENDPOINTS.POSITION_CLOSE_PREPARE(id), {
      idempotencyKey,
      walletAddress
    }, this.idempotencyHeaders(idempotencyKey));
    return response.execution;
  }

  async setAutoRebalance(id: string, enabled: boolean, policy?: any): Promise<Position> {
    const response = await this.put<{ position: Position }>(API_ENDPOINTS.POSITION_AUTO_REBALANCE(id), {
      enabled,
      policy
    });
    return response.position;
  }

  // Admin endpoints (require x-admin-token header - handled separately)
  async toggleKillSwitch(active: boolean, reason?: string): Promise<AdminKillSwitchResponse> {
    return this.post<AdminKillSwitchResponse>(API_ENDPOINTS.ADMIN_KILL_SWITCH, {
      active,
      reason
    });
  }

  async getKillSwitchStatus(): Promise<AdminKillSwitchResponse> {
    return this.get<AdminKillSwitchResponse>(API_ENDPOINTS.ADMIN_KILL_SWITCH);
  }

  async toggleBasketStatus(slug: string, status: 'active' | 'paused' | 'deprecated') {
    return this.post(API_ENDPOINTS.ADMIN_BASKET_STATUS(slug), { status });
  }

  async setTokenTradingStatus(mint: string, tradingStatus: 'active' | 'halted' | 'market_closed') {
    return this.post(API_ENDPOINTS.ADMIN_TOKEN_STATUS(mint), { tradingStatus });
  }

  async proposeBasketVersion(
    slug: string,
    version: number,
    changelog: string,
    legs: Array<{
      mint: string;
      weightBps: number;
      legType?: string;
      venueHint?: string;
      slippageBps?: number
    }>,
    adminToken: string
  ): Promise<{ proposal: BasketPublishProposal }> {
    return this.post<{ proposal: BasketPublishProposal }>(
      API_ENDPOINTS.ADMIN_BASKET_PUBLISH(slug),
      { version, changelog, legs },
      { 'x-admin-token': adminToken }
    );
  }

  async getBasketPublishProposals(approverToken: string) {
    return this.get<{ proposals: BasketPublishProposal[] }>(API_ENDPOINTS.ADMIN_PUBLISH_PROPOSALS, {
      'x-admin-approver-token': approverToken,
    });
  }

  async prepareBasketPublishTransaction(id: string, adminToken: string, approvalAddress: string) {
    return this.post<{ transaction: string; admin: string; approval: string; lastValidBlockHeight: number }>(
      API_ENDPOINTS.ADMIN_PUBLISH_TRANSACTION(id),
      { approvalAddress },
      { 'x-admin-token': adminToken }
    );
  }

  async approveBasketPublishProposal(
    id: string,
    approverToken: string,
    signedTransaction: string,
    approvalAddress: string,
    note = ""
  ) {
    return this.post<{ proposal: BasketPublishProposal; version: BasketVersion }>(
      API_ENDPOINTS.ADMIN_PUBLISH_APPROVE(id),
      { note, signedTransaction, approvalAddress },
      { 'x-admin-approver-token': approverToken }
    );
  }

  async getExecutions(status?: string, limit?: number) {
    let url = API_ENDPOINTS.ADMIN_EXECUTIONS;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit.toString());
    if (params.toString()) url += `?${params}`;
    return this.get(url);
  }

  async getFees() {
    return this.get(API_ENDPOINTS.ADMIN_FEES);
  }

  async getRelayerInfo() {
    return this.get(API_ENDPOINTS.ADMIN_RELAYER);
  }

  // Faucet endpoints (devnet only)
  async requestFaucetAirdrop(walletAddress: string): Promise<FaucetAirdropResponse> {
    return this.post<FaucetAirdropResponse>(API_ENDPOINTS.FAUCET_AIRDROP, {
      walletAddress
    });
  }
}

// Export a singleton instance
export const kairosApi = new KairosApiClient();

export default kairosApi;
