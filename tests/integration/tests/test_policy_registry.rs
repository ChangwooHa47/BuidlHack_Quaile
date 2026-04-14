/// Integration tests for policy-registry cross-contract interactions.
///
/// AC covered:
/// - workspaces-tests: 3개 policy 등록 후 by_status 조회 정합성
/// - advance_status Upcoming → Subscribing → Live 순차 전이 (time-travel)
/// - mark_closed는 escrow 계정만 호출 가능
use integration_tests::helpers::{register_default_policy, setup};
use serde_json::json;

#[tokio::test]
async fn test_register_and_list_by_status() -> anyhow::Result<()> {
    let ctx = setup().await?;

    // Register 3 policies
    let id0 = register_default_policy(&ctx, 3600).await?;
    let id1 = register_default_policy(&ctx, 3600).await?;
    let id2 = register_default_policy(&ctx, 3600).await?;

    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);

    // All should be Upcoming
    let result: Vec<serde_json::Value> = ctx
        .owner
        .view(ctx.policy_registry.id(), "list_by_status")
        .args_json(json!({ "status": "Upcoming", "from": 0, "limit": 10 }))
        .await?
        .json()?;

    assert_eq!(result.len(), 3);

    // total_policies should be 3
    let total: u64 = ctx
        .owner
        .view(ctx.policy_registry.id(), "total_policies")
        .await?
        .json()?;
    assert_eq!(total, 3);

    Ok(())
}

#[tokio::test]
async fn test_advance_status_time_travel() -> anyhow::Result<()> {
    let ctx = setup().await?;

    // Register policy starting in 10 seconds
    let policy_id = register_default_policy(&ctx, 10).await?;

    // Advance before time — should be no-op
    let status: serde_json::Value = ctx
        .owner
        .call(ctx.policy_registry.id(), "advance_status")
        .args_json(json!({ "id": policy_id }))
        .transact()
        .await?
        .json()?;
    assert_eq!(status, "Upcoming");

    // Fast-forward past subscription_start
    ctx.worker.fast_forward(100).await?;

    // Now advance should transition to Subscribing
    let status: serde_json::Value = ctx
        .owner
        .call(ctx.policy_registry.id(), "advance_status")
        .args_json(json!({ "id": policy_id }))
        .transact()
        .await?
        .json()?;
    assert_eq!(status, "Subscribing");

    // Verify get_policy shows Subscribing
    let policy: serde_json::Value = ctx
        .owner
        .view(ctx.policy_registry.id(), "get_policy")
        .args_json(json!({ "id": policy_id }))
        .await?
        .json()?;
    assert_eq!(policy["status"], "Subscribing");

    Ok(())
}

#[tokio::test]
async fn test_list_by_foundation_pagination() -> anyhow::Result<()> {
    let ctx = setup().await?;

    // Register 3 policies
    register_default_policy(&ctx, 3600).await?;
    register_default_policy(&ctx, 3600).await?;
    register_default_policy(&ctx, 3600).await?;

    // Page 1: from=0, limit=2
    let page1: Vec<serde_json::Value> = ctx
        .owner
        .view(ctx.policy_registry.id(), "list_by_foundation")
        .args_json(json!({
            "foundation": ctx.foundation.id(),
            "from": 0,
            "limit": 2
        }))
        .await?
        .json()?;
    assert_eq!(page1.len(), 2);

    // Page 2: from=2, limit=2
    let page2: Vec<serde_json::Value> = ctx
        .owner
        .view(ctx.policy_registry.id(), "list_by_foundation")
        .args_json(json!({
            "foundation": ctx.foundation.id(),
            "from": 2,
            "limit": 2
        }))
        .await?
        .json()?;
    assert_eq!(page2.len(), 1);

    Ok(())
}

#[tokio::test]
async fn test_mark_closed_non_escrow_fails() -> anyhow::Result<()> {
    let ctx = setup().await?;
    let policy_id = register_default_policy(&ctx, 10).await?;

    // Fast-forward to Live
    ctx.worker.fast_forward(100).await?;
    ctx.owner
        .call(ctx.policy_registry.id(), "advance_status")
        .args_json(json!({ "id": policy_id }))
        .transact()
        .await?;
    ctx.worker.fast_forward(1000).await?;
    ctx.owner
        .call(ctx.policy_registry.id(), "advance_status")
        .args_json(json!({ "id": policy_id }))
        .transact()
        .await?;

    // Non-escrow tries mark_closed — should fail
    let result = ctx
        .foundation
        .call(ctx.policy_registry.id(), "mark_closed")
        .args_json(json!({ "id": policy_id }))
        .transact()
        .await?;

    assert!(result.is_failure(), "mark_closed by non-escrow should fail");

    Ok(())
}
