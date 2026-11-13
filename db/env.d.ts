declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    TOKEN_ENCRYPTION_KEY?: string;
    META_APP_ID?: string;
    META_APP_SECRET?: string;
    META_GRAPH_VERSION?: string;
    META_COMMENTS_ENABLED?: string;
    PUBLIC_APP_URL?: string;
    LOCAL_GATEWAY_TOKEN?: string;
  }
}
