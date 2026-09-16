export type TypesenseSearchParameters = Record<
  string,
  boolean | number | string | undefined
>;

export interface TypesenseRequestOptions {
  abortSignal?: AbortSignal;
}

interface TypesenseSearchClientConfiguration {
  apiKey: string;
  nodes: Array<{
    host: string;
    port: number;
    protocol: string;
  }>;
}

interface TypesenseMultiSearchRequest {
  searches: TypesenseSearchParameters[];
}

interface TypesenseSearchResponse<TDocument> {
  facet_counts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>;
  found?: number;
  grouped_hits?: unknown[];
  hits?: Array<Record<string, unknown> & { document: TDocument }>;
  page?: number;
}

export class TypesenseSearchClient {
  private readonly _baseUrl: string;

  readonly multiSearch = {
    perform: <T = unknown>(
      request: TypesenseMultiSearchRequest,
      parameters: TypesenseSearchParameters = {},
      options: TypesenseRequestOptions = {},
    ): Promise<T> =>
      this._request<T>("/multi_search", parameters, options, request),
  };

  constructor(
    private readonly _configuration: TypesenseSearchClientConfiguration,
  ) {
    const node = _configuration.nodes[0];
    if (!node) throw new Error("Typesense requires at least one node.");
    const defaultPort =
      (node.protocol === "https" && node.port === 443) ||
      (node.protocol === "http" && node.port === 80);
    this._baseUrl = `${node.protocol}://${node.host}${defaultPort ? "" : `:${node.port}`}`;
  }

  collections<TDocument = Record<string, unknown>>(collection: string) {
    return {
      documents: () => ({
        search: (
          parameters: TypesenseSearchParameters,
          options: TypesenseRequestOptions = {},
        ): Promise<TypesenseSearchResponse<TDocument>> =>
          this._request<TypesenseSearchResponse<TDocument>>(
            `/collections/${encodeURIComponent(collection)}/documents/search`,
            parameters,
            options,
          ),
      }),
    };
  }

  private async _request<T>(
    path: string,
    parameters: TypesenseSearchParameters,
    options: TypesenseRequestOptions,
    body?: TypesenseMultiSearchRequest,
  ): Promise<T> {
    const url = new URL(path, this._baseUrl);
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "X-TYPESENSE-API-KEY": this._configuration.apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Typesense request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}
