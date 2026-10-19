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
  BasketMarketDataResponse,
  BasketMarketNavHistoryResponse,
  BasketPublishProposal,
  BasketVersion,
  TokenRegistryResponse,
  RebalancesResponse,
  SimulationRequest,
  SimulationResponse,
  BasketCompositionResponse,
  AppConfigResponse,
  NotificationsResponse,
  ExecutionStatusResponse,
  AuthLogoutResponse,
  StreamSliceResponse,
  EligibilityResponse,
  NotificationPreferences,
  NotificationPreferencesResponse,
  AnnotationsResponse,
  RegistryVerificationResponse,
  LabsBasketsResponse,
  LabsBasket,
  LabsBasketResponse,
  LabsVoteResponse,
  LabsCommentsResponse,
  LabsCommentRow,
  BasketBacktestResponse,
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
    // FE-03: no token is ever read from or written to browser storage. The
    // session lives in an httpOnly cookie set by the API; the in-memory copy
    // only mirrors it for the Authorization header, and any legacy keys left by
    // an older build are purged here.
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("kairos.auth.token");
      window.sessionStorage.removeItem("kairos.auth.refresh");
      window.sessionStorage.removeItem("kairos.auth.wallet");
      window.localStorage.removeItem("kairos.auth.token");
      window.localStorage.removeItem("kairos.auth.refresh");
    }
  }

  setAuth(token: string, refreshToken?: string, walletAddress?: string) {
    this.authToken = token;
    this.refreshToken = refreshToken ?? null;
    this.authWallet = walletAddress ?? this.authWallet;
  }

  clearAuth() {
    this.authToken = null;
    this.refreshToken = null;
    this.authWallet = null;
  }

  /** FE-03: remember which wallet the cookie session belongs to (no secret). */
  setSessionWallet(walletAddress: string) {
    this.authWallet = walletAddress;
  }

  getSessionWallet(): string | null {
    return this.authWallet;
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
    const body = await response.text();
    let data: Record<string, unknown> = {};
    if (body) {
      try {
        data = JSON.parse(body) as Record<string, unknown>;
      } catch {
        if (response.ok) {
          throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server returned an invalid response.');
        }
      }
    }

    if (!response.ok) {
      // Handle API error responses
      if (data.error && typeof data.error === 'string') {
        const fallbackMessages: Record<string, string> = {
          BASKET_NOT_ACTIVE: "This basket is paused until its Devnet assets are initialized and funded.",
          BLOCKHASH_EXPIRED: "The prepared Devnet transactions expired before submission. No transaction was sent. Reopen Invest to prepare and sign a fresh batch.",
          INVALID_SIGNATURE: "The signed batch failed verification before submission. No Solana transaction was sent. Reconnect your wallet and prepare a fresh batch.",
          PROGRAM_NOT_DEPLOYED: "The Kairos router is not deployed on this Solana cluster yet. No transaction was prepared or sent.",
          ROUTER_REGISTRY_NOT_READY: "This basket version is not published in the on-chain router registry. No transaction was prepared or sent.",
        };
        throw new ApiError(
          response.status,
          data.error as AppErrorCode,
          (typeof data.message === 'string' ? data.message : undefined) || fallbackMessages[data.error] || data.error
        );
      }

      throw new ApiError(
        response.status,
        response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR',
        response.status >= 500
          ? 'The service is temporarily unavailable. Please try again.'
          : (typeof data.message === 'string' ? data.message : 'The request could not be completed.')
      );
    }

    return data as T;
  }

  /** FE-03: every call carries the httpOnly session cookie when one exists. */
  private get fetchOptions(): RequestInit {
    return { credentials: 'include' };
  }

  async get<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...this.fetchOptions,
      method: 'GET',
      headers: this.getHeaders(headers),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...this.fetchOptions,
      method: 'POST',
      headers: this.getHeaders(headers),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...this.fetchOptions,
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...this.fetchOptions,
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

  // Runtime config (cluster, USDC mint, fees) — replaces hardcoded constants.
  async getConfig(): Promise<AppConfigResponse> {
    return this.get<AppConfigResponse>(API_ENDPOINTS.CONFIG);
  }

  // Catalog endpoints
  async getTokens(): Promise<TokenRegistryResponse> {
    return this.get<TokenRegistryResponse>(API_ENDPOINTS.TOKENS);
  }

  async getBaskets(options?: { category?: string; limit?: number; after?: string }) {
    const query = new URLSearchParams();
    if (options?.category) query.set("category", options.category);
    if (options?.limit) query.set("limit", String(options.limit));
    if (options?.after) query.set("after", options.after);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.get<BasketsResponse>(`${API_ENDPOINTS.BASKETS}${suffix}`);
  }

  /**
   * FR-26 custom-allocation simulation. Returns a hypothetical series rebased to
   * 1000 plus an explicitly unavailable benchmark state when no verified
   * benchmark history exists — callers must render that state, not invent one.
   */
  async simulateGraph(request: SimulationRequest): Promise<SimulationResponse> {
    return this.post<SimulationResponse>(API_ENDPOINTS.SIMULATE_GRAPH, request);
  }

  async composeBasket(idea: string): Promise<BasketCompositionResponse> {
    return this.post<BasketCompositionResponse>(API_ENDPOINTS.COMPOSE_BASKET, { idea });
  }

  async getBasketBySlug(slug: string) {
    return this.get<BasketBySlugResponse>(API_ENDPOINTS.BASKET_BY_SLUG(slug));
  }

  async getBasketMarketData(slug: string): Promise<BasketMarketDataResponse> {
    return this.get<BasketMarketDataResponse>(API_ENDPOINTS.BASKET_MARKET_DATA(slug));
  }

  async getBasketMarketNavHistory(slug: string, window: string): Promise<BasketMarketNavHistoryResponse> {
    return this.get<BasketMarketNavHistoryResponse>(API_ENDPOINTS.BASKET_MARKET_NAV_HISTORY(slug, window));
  }

  async getBasketPerformance(slug: string, window: string): Promise<BasketBacktestResponse> {
    const endpoint = API_ENDPOINTS.BASKET_PERFORMANCE(slug, window);
    return this.get<BasketBacktestResponse>(endpoint);
  }

  async getBasketRebalances(slug: string) {
    return this.get<RebalancesResponse>(API_ENDPOINTS.BASKET_REBALANCES(slug));
  }

  // Trade/Quotes endpoints
  async getQuote(basket: string, amount: number, fundingAsset: "SOL" | "USDC" = "SOL"): Promise<QuoteResponse> {
    return this.post<QuoteResponse>(API_ENDPOINTS.QUOTES, {
      basket,
      ...(fundingAsset === "SOL" ? { solAmount: amount } : { usdcAmount: amount }),
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

  /** Compact status + stream cursor for resume after a refresh. */
  async getExecutionStatus(id: string): Promise<ExecutionStatusResponse> {
    return this.get<ExecutionStatusResponse>(API_ENDPOINTS.EXECUTION_STATUS(id));
  }

  /** PRD §10 stream contract; `afterSeq: 0` returns the current tail. */
  async getExecutionStream(id: string, afterSeq = 0): Promise<StreamSliceResponse> {
    return this.get<StreamSliceResponse>(API_ENDPOINTS.STREAM_EXECUTION(id, afterSeq));
  }

  /** FR-18: delivered notifications for the signed-in wallet. */
  async getNotifications(): Promise<NotificationsResponse> {
    return this.get<NotificationsResponse>(API_ENDPOINTS.NOTIFICATIONS);
  }

  /** FE-03: cookie-session probe (no token is readable by JS). */
  async getSession(): Promise<{ walletAddress: string; userId: string; cookieSession: boolean }> {
    return this.get(API_ENDPOINTS.AUTH_SESSION);
  }

  // ---- FR-04 eligibility / §13.1 age gate ----
  async getEligibility(): Promise<EligibilityResponse> {
    return this.get<EligibilityResponse>(API_ENDPOINTS.ELIGIBILITY);
  }

  async confirmEligibility(ageConfirmed: boolean, region?: string): Promise<EligibilityResponse> {
    return this.post<EligibilityResponse>(API_ENDPOINTS.ELIGIBILITY_CONFIRM, { ageConfirmed, region });
  }

  // ---- FR-18 notification preferences ----
  async getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
    return this.get<NotificationPreferencesResponse>(API_ENDPOINTS.NOTIFICATION_PREFERENCES);
  }

  async updateNotificationPreferences(
    patch: Partial<Omit<NotificationPreferences, "walletAddress" | "updatedAt">>,
  ): Promise<NotificationPreferencesResponse> {
    return this.put<NotificationPreferencesResponse>(API_ENDPOINTS.NOTIFICATION_PREFERENCES, patch);
  }

  // ---- FR-27 annotations / FR-24 registry verification ----
  async getBasketAnnotations(slug: string): Promise<AnnotationsResponse> {
    return this.get<AnnotationsResponse>(API_ENDPOINTS.BASKET_ANNOTATIONS(slug));
  }

  async getBasketRegistry(slug: string): Promise<RegistryVerificationResponse> {
    return this.get<RegistryVerificationResponse>(API_ENDPOINTS.BASKET_REGISTRY(slug));
  }

  // ---- FR-25 Labs (durable, moderated) ----
  async getLabsBaskets(status?: string): Promise<LabsBasketsResponse> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.get<LabsBasketsResponse>(`${API_ENDPOINTS.LABS_BASKETS}${suffix}`);
  }

  async getLabsBasket(slug: string, viewerAddress?: string): Promise<LabsBasketResponse> {
    const query = viewerAddress ? `?viewerAddress=${encodeURIComponent(viewerAddress)}` : "";
    return this.get<LabsBasketResponse>(`${API_ENDPOINTS.LABS_BASKET(slug)}${query}`);
  }

  async getLabsBasketMarketNavHistory(slug: string, window: BasketMarketNavHistoryResponse["window"]): Promise<BasketMarketNavHistoryResponse> {
    return this.get<BasketMarketNavHistoryResponse>(API_ENDPOINTS.LABS_BASKET_MARKET_NAV_HISTORY(slug, window));
  }

  async createLabsBasket(input: {
    name: string;
    thesis?: string;
    category?: string;
    coverImageDataUrl?: string;
    allocations: Array<{ mint: string; weightBps: number }>;
  }): Promise<LabsBasketResponse> {
    return this.post<LabsBasketResponse>(API_ENDPOINTS.LABS_BASKETS, input);
  }

  async voteLabsBasket(slug: string): Promise<LabsVoteResponse> {
    return this.post<LabsVoteResponse>(API_ENDPOINTS.LABS_VOTE(slug), {});
  }

  async removeLabsVote(slug: string): Promise<{ labsBasket: LabsBasket; removed: boolean }> {
    return this.delete<{ labsBasket: LabsBasket; removed: boolean }>(API_ENDPOINTS.LABS_VOTE(slug));
  }

  async getLabsComments(slug: string): Promise<LabsCommentsResponse> {
    return this.get<LabsCommentsResponse>(API_ENDPOINTS.LABS_COMMENTS(slug));
  }

  async commentLabsBasket(slug: string, body: string): Promise<{ comment: LabsCommentRow }> {
    return this.post<{ comment: LabsCommentRow }>(API_ENDPOINTS.LABS_COMMENTS(slug), { body });
  }

  /**
   * PRD §4.5: one-click revoke of the embedded/delegated signing key. The
   * server clears the stored policy; auto-rebalance re-reads the flag per leg.
   */
  async setDelegatedSigning(
    walletAddress: string,
    enabled: boolean,
  ): Promise<{ wallet: { address: string; delegatedSigning: boolean } }> {
    return this.post(API_ENDPOINTS.DELEGATED_SIGNING, { walletAddress, enabled });
  }

  /** FE-09: fire-and-forget anonymized page view; never blocks a render. */
  async recordPageView(name: string, path: string): Promise<void> {
    try {
      await this.post(API_ENDPOINTS.ANALYTICS_PAGE_VIEW, { name, path });
    } catch {
      /* analytics must never surface an error to the user */
    }
  }

  /**
   * PRD §4.5 one-click revoke. Revokes the refresh token server-side before
   * clearing local state, so a copied token cannot outlive the session.
   */
  async logout(): Promise<AuthLogoutResponse> {
    const refreshToken = this.refreshToken;
    try {
      if (refreshToken) {
        return await this.post<AuthLogoutResponse>(API_ENDPOINTS.AUTH_LOGOUT, { refreshToken });
      }
      return { revoked: false };
    } finally {
      this.clearAuth();
    }
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

  /** Execution history — the authoritative activity ledger (not localStorage). */
  async getWalletExecutions(walletAddress: string): Promise<{ executions: Execution[] }> {
    return this.get<{ executions: Execution[] }>(
      `${API_ENDPOINTS.EXECUTIONS_LIST}?walletAddress=${encodeURIComponent(walletAddress)}`,
    );
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
