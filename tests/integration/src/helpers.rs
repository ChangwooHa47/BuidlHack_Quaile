use near_workspaces::{Account, Contract, Worker};
use near_workspaces::types::NearToken;
use serde_json::json;

/// Paths to compiled wasm files (built with --target wasm32-unknown-unknown --release)
const POLICY_REGISTRY_WASM: &str = "../../target/wasm32-unknown-unknown/release/policy_registry.wasm";
const ATTESTATION_VERIFIER_WASM: &str = "../../target/wasm32-unknown-unknown/release/attestation_verifier.wasm";
const IDO_ESCROW_WASM: &str = "../../target/wasm32-unknown-unknown/release/ido_escrow.wasm";
const MOCK_FT_WASM: &str = "../../target/wasm32-unknown-unknown/release/mock_ft.wasm";

pub struct TestContext {
    pub worker: Worker<near_workspaces::network::Sandbox>,
    pub owner: Account,
    pub foundation: Account,
    pub investor1: Account,
    pub investor2: Account,
    pub investor3: Account,
    pub policy_registry: Contract,
    pub attestation_verifier: Contract,
    pub ido_escrow: Contract,
    pub mock_ft: Contract,
}

pub async fn setup() -> anyhow::Result<TestContext> {
    let worker = near_workspaces::sandbox().await?;

    // Create accounts
    let owner = worker.dev_create_account().await?;
    let foundation = worker.dev_create_account().await?;
    let investor1 = worker.dev_create_account().await?;
    let investor2 = worker.dev_create_account().await?;
    let investor3 = worker.dev_create_account().await?;

    // Deploy contracts
    let policy_registry_wasm = std::fs::read(POLICY_REGISTRY_WASM)?;
    let verifier_wasm = std::fs::read(ATTESTATION_VERIFIER_WASM)?;
    let escrow_wasm = std::fs::read(IDO_ESCROW_WASM)?;
    let ft_wasm = std::fs::read(MOCK_FT_WASM)?;

    let policy_registry = worker.dev_deploy(&policy_registry_wasm).await?;
    let attestation_verifier = worker.dev_deploy(&verifier_wasm).await?;
    let ido_escrow = worker.dev_deploy(&escrow_wasm).await?;
    let mock_ft = worker.dev_deploy(&ft_wasm).await?;

    // Initialize policy-registry
    owner
        .call(policy_registry.id(), "new")
        .args_json(json!({ "owner": owner.id() }))
        .transact()
        .await?
        .into_result()?;

    // Initialize attestation-verifier with dummy signing address
    let dummy_address: Vec<u8> = vec![0xAB; 20];
    owner
        .call(attestation_verifier.id(), "new")
        .args_json(json!({
            "owner": owner.id(),
            "initial_signing_address": dummy_address,
        }))
        .transact()
        .await?
        .into_result()?;

    // Initialize ido-escrow
    owner
        .call(ido_escrow.id(), "new")
        .args_json(json!({
            "owner": owner.id(),
            "policy_registry": policy_registry.id(),
            "attestation_verifier": attestation_verifier.id(),
        }))
        .transact()
        .await?
        .into_result()?;

    // Set escrow account on policy-registry
    owner
        .call(policy_registry.id(), "set_escrow_account")
        .args_json(json!({ "escrow": ido_escrow.id() }))
        .transact()
        .await?
        .into_result()?;

    // Add foundation to whitelist
    owner
        .call(policy_registry.id(), "add_foundation")
        .args_json(json!({ "foundation": foundation.id() }))
        .transact()
        .await?
        .into_result()?;

    // Initialize mock-ft with large supply
    owner
        .call(mock_ft.id(), "new")
        .args_json(json!({
            "owner_id": owner.id(),
            "total_supply": "1000000000000000000000000",
            "symbol": "IDO",
            "name": "Demo IDO Token",
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(TestContext {
        worker,
        owner,
        foundation,
        investor1,
        investor2,
        investor3,
        policy_registry,
        attestation_verifier,
        ido_escrow,
        mock_ft,
    })
}

/// Register a policy with default valid params. Returns policy_id.
pub async fn register_default_policy(
    ctx: &TestContext,
    subscription_start_offset_sec: u64,
) -> anyhow::Result<u64> {
    let now_ns = ctx.worker.view_block().await?.timestamp();
    let start = now_ns + subscription_start_offset_sec * 1_000_000_000;
    let end = start + 7_200_000_000_000; // +2h
    let live_end = end + 7_200_000_000_000; // +4h

    let result = ctx
        .foundation
        .call(ctx.policy_registry.id(), "register_policy")
        .args_json(json!({
            "natural_language": "This is a test policy with sufficient length for validation purposes here.",
            "ipfs_cid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3ocirgf5de2yjvei",
            "sale_config": {
                "token_contract": ctx.mock_ft.id(),
                "total_allocation": "1000000",
                "price_per_token": "100",
                "payment_token": "Near",
                "subscription_start": start,
                "subscription_end": end,
                "live_end": live_end,
            }
        }))
        .transact()
        .await?
        .into_result()?;

    let policy_id: u64 = result.json()?;
    Ok(policy_id)
}
