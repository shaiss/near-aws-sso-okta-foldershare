## Hybrid Web3 Architecture: NEARFS/FastFS + Filecoin via NEAR Chain Signatures (with Okta)

### TL;DR
- Use NEARFS/FastFS for small, hot, and critical static assets (HTML/CSS/JS, small images) to showcase on-chain storage and Web4.
- Use Filecoin for large and binary assets (media, datasets) and sign storage transactions from a NEAR account using Chain Signatures. Record resulting CIDs and a manifest on NEAR for integrity and versioning.
- Keep Okta as the enterprise SSO/authorization layer. Gate write operations and apply quotas/policies based on Okta groups/claims.

References:
- Chain Signatures overview and getting started: [docs.near.org/chain-abstraction/chain-signatures](https://docs.near.org/chain-abstraction/chain-signatures/) · [Getting started](https://docs.near.org/build/chain-abstraction/chain-signatures/getting-started) · [Mainnet launch](https://pages.near.org/blog/chain-signatures-mainnet-launches/) · [EdDSA/ECDSA support](https://pages.near.org/blog/chain-signatures-adds-eddsa-support-cross-chain-signing-for-solana-ton-stellar-sui-aptos/)
- NEARFS/FastFS integration examples: [FastFS Integration Examples](https://hackmd.io/@fastnear/fastfs-docs#Integration-Examples.md)
- Web4 deploy tooling: [web4-deploy](https://github.com/vgrichina/web4-deploy)
- NEAR–Filecoin bridge deprecation context: [near.storage](https://near.storage/docs/)
- Filecoin ecosystem background: [NEAR × Filecoin collaboration](https://pages.near.org/blog/filecoin-launches-collaboration-with-near-to-accelerate-the-growth-of-the-web3-stack/)

---

## Goals
- Demonstrate NEAR Chain Signatures by initiating and authorizing Filecoin storage deals directly from a NEAR account/contract.
- Showcase a pragmatic hybrid where small assets live on NEARFS/FastFS, and large assets live on Filecoin, with a single manifest anchored on NEAR.
- Maintain enterprise-grade authentication and authorization using Okta; no IPFS node hosting and no reliance on the deprecated NEAR–Filecoin bridge.

## Non-goals
- Re-implementing Filecoin deal-making protocols or custom retrieval networks.
- Using the deprecated NEAR–Filecoin bridge.
- Using IPFS as a primary storage tier (we avoid requiring our own IPFS node).

## Constraints and Assumptions
- Chain Signatures provide cross-chain signing (ECDSA/EdDSA) and MPC-backed key management. We target Filecoin via FEVM/EVM-compatible flows or native Filecoin signing as supported by Chain Signatures.
- Retrieval for Filecoin CIDs can use decentralized/public retrieval networks and clients (e.g., Saturn or Lassie) without us running an IPFS node. We do not store content on IPFS as a primary tier.
- Web4 contract continues to front the site, using a manifest stored on NEAR to resolve paths to either NEARFS or Filecoin.
- Okta provides OIDC-based SSO; our backend validates JWTs and enforces quotas and policies.

## Architecture Overview

```mermaid
graph TD
    U["User (Browser)"] -->|OIDC| OKTA[Okta]
    U --> FE[Frontend Web App]
    FE --> API[Upload / Deploy API]
    API -->|small assets| NEARFS[NEARFS / FastFS]
    API -->|large assets| CONTRACT[NEAR Contract\n(Manifest + Policy + CS orchestration)]
    CONTRACT --> CS[Chain Signatures]
    CS --> RELAYER[Relayer]
    RELAYER --> FIL[Filecoin Storage Providers]
    FIL --> RETRIEVE[Decentralized Retrieval\n(e.g., Saturn/Lassie)]
    CONTRACT --> STATE[Manifest & Metadata on NEAR]
    FE --> WEB4[Web4 Contract]
    WEB4 --> CDN[Gateway/CDN]
    CDN -->|path -> NEARFS| NEARFS
    CDN -->|path -> CID| RETRIEVE
```

### Components
- Frontend: Static SPA served via Web4; interacts with the Upload/Deploy API for authenticated operations.
- Okta: OIDC SSO provider; supplies JWTs with roles/claims used for authorization and quotas.
- Upload/Deploy API: Validates Okta JWTs, applies policy, routes small assets to NEARFS and large assets to the NEAR contract for Filecoin deal-making.
- NEAR Contract (Web4 + Manifest Registry):
  - Stores the active manifest (path → {nearfsRef|filecoinCID}).
  - Enforces role- and size-based policies.
  - Coordinates Chain Signatures requests to sign Filecoin deal messages.
  - Emits events for observability (deploy started/completed, version switched).
- Chain Signatures: MPC-based cross-chain signing; derives/controls a Filecoin-compatible address from a NEAR account and signs Filecoin transactions.
- Relayer: Broadcasts Chain Signatures–produced transactions to the Filecoin network; tracks confirmations and deal status.
- NEARFS/FastFS: On-chain storage for small/hot assets; integrated via `web4-deploy`.
- Retrieval: For Filecoin CIDs, use decentralized/public retrieval networks or clients (no self-hosted IPFS node).

## Data Model (On-Chain)

```json
{
  "version": "2025-03-01T12:00:00Z",
  "routes": [
    { "path": "/index.html", "type": "nearfs", "ref": "nearfs://..." },
    { "path": "/app.js",     "type": "nearfs", "ref": "nearfs://..." },
    { "path": "/assets/video.mp4", "type": "filecoin", "cid": "bafy..." }
  ],
  "hash": "sha256:...",       
  "createdBy": "account.near",
  "policyId": "default",
  "notes": "Hybrid manifest: small on NEARFS, large on Filecoin"
}
```

Contract storage keys (illustrative):
- `manifest:active` → latest manifest blob (or reference + content hash)
- `manifest:history:<id>` → historical manifests (versioned)
- `policy:<id>` → size/type thresholds, allowed paths, RBAC mapping
- `quota:<principal>` → per user/org quotas (bytes/day, total bytes, file count)

## Flows

### 1) Authenticated Upload & Deploy (Hybrid)

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant OKTA as Okta
    participant API as Upload API
    participant NEAR as NEAR Contract
    participant CS as Chain Signatures
    participant R as Relayer
    participant FIL as Filecoin
    participant NFS as NEARFS/FastFS

    U->>OKTA: Login (OIDC)
    OKTA-->>FE: ID/Access Token (JWT)
    FE->>API: Upload artifacts + JWT
    API->>API: Classify assets by policy (size/type)
    API->>NFS: Put small assets (NEARFS)
    NFS-->>API: nearfs:// refs
    API->>NEAR: Request deal for large assets (metadata, CAR/cids)
    NEAR->>CS: Sign Filecoin deal tx
    CS-->>NEAR: Signature
    NEAR->>R: Submit signed tx for broadcast
    R->>FIL: Broadcast deal; monitor status
    FIL-->>R: Deal accepted; CID(s)
    R-->>NEAR: Confirmed; return CID(s)
    NEAR->>NEAR: Update manifest draft
    NEAR-->>API: Draft manifest refs
    API->>NEAR: Commit/activate manifest version
    NEAR-->>FE: Active version id
```

### 2) Retrieval
- Web4 receives a request path.
- If the route is `nearfs`, serve directly from NEARFS.
- If the route is `filecoin`, return a content-addressed URL (or stream) via decentralized retrieval (e.g., Saturn/Lassie), without requiring our own IPFS node.

## Policies and Routing
- Thresholds: files > X MB or matching media types → Filecoin; otherwise NEARFS.
- Atomicity: contract supports draft → activate; a version switch is a single transaction after confirming Filecoin deals.
- Rollback: keep previous manifest versions; allow reverting the active version.
- Quotas: enforce per-user/org limits from Okta claims (e.g., `maxBytesPerDay`, `maxFileSizeMb`).

## Security and IAM
- Authentication: Okta OIDC; backend validates JWTs and extracts roles/claims.
- Authorization: Contract checks caller and policy; backend enforces pre-checks before invoking contract.
- Chain Signatures: MPC-backed signing; no long-lived Filecoin private keys on our servers.
- Encryption (optional): Client-side encrypt large assets; store keys via an access-controlled service; decrypt on client for authorized users.
- Auditability: Contract events for deploys; relayer logs for deal submissions; append-only manifest history on NEAR.

## Operational Considerations
- Deal Monitoring: relayer tracks deal states and retries; alarms on failures/timeouts.
- Retrieval Health: synthetic probes for Filecoin CID fetch success rate and latency.
- Cost Control: policies to cap daily bytes and max file size; automatic rejection with clear errors.
- Backpressure: rate limit uploads by user/org; exponential backoff on relayer.

## Demo Plan & Milestones
1. Scaffolding
   - Minimal NEAR contract with: set/get manifest, draft→activate, policy checks, Chain Signatures hook.
   - Upload API: Okta JWT validation, asset classification, NEARFS put, contract calls for Filecoin deals.
2. Chain Signatures → Filecoin
   - Derive Filecoin-compatible address; sign a sample deal; relay and confirm; record CID on NEAR.
3. Hybrid Deploy
   - Build demo site; route small assets to NEARFS (via `web4-deploy`); route a large media file to Filecoin; publish manifest.
4. Retrieval
   - Implement retrieval path for CIDs via decentralized retrieval (no self-hosted IPFS); validate end-to-end.
5. RBAC & Quotas
   - Map Okta groups to policy (`developers`, `editors`, `viewers`); enforce size/volume limits; add audit events.

## Interfaces (Illustrative)

```ts
// Upload API (authenticated by Okta)
POST /api/deploy
Body: {
  files: FormData,
  policyId?: string
}
Response: {
  version: string,
  summary: { nearfsCount: number, filecoinCount: number }
}
```

```rust
// NEAR contract (high-level)
pub fn begin_deploy(&mut self, metadata: DeployMetadata) -> VersionId {}
pub fn put_nearfs_refs(&mut self, version: VersionId, refs: Vec<NearfsRef>) {}
pub fn request_filecoin_deals(&mut self, version: VersionId, items: Vec<FilecoinItem>) {}
pub fn activate_version(&mut self, version: VersionId) {}
pub fn get_manifest(&self) -> Manifest {}
```

## Risks & Mitigations
- Chain coverage nuances: validate FEVM/native Filecoin signing formats against Chain Signatures capabilities; build conformance tests.
- Retrieval variance: cache headers and use multiple public retrieval endpoints; monitor and fail over.
- Cost spikes: protective quotas and per-file size cap; compress assets.
- User experience: background deal-making; show progress and only flip manifest when ready.

## References
- Chain Signatures: [Overview](https://docs.near.org/chain-abstraction/chain-signatures/) · [Getting Started](https://docs.near.org/build/chain-abstraction/chain-signatures/getting-started) · [Mainnet Launch](https://pages.near.org/blog/chain-signatures-mainnet-launches/) · [EdDSA/ECDSA Support](https://pages.near.org/blog/chain-signatures-adds-eddsa-support-cross-chain-signing-for-solana-ton-stellar-sui-aptos/)
- FastFS Integration Examples: [HackMD](https://hackmd.io/@fastnear/fastfs-docs#Integration-Examples.md)
- Web4 Deploy: [GitHub](https://github.com/vgrichina/web4-deploy)
- Bridge deprecation context: [near.storage docs](https://near.storage/docs/)
- Filecoin retrieval: investigate [Saturn](https://saturn.tech/) and [Lassie](https://github.com/filecoin-project/lassie)


