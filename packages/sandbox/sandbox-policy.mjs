const MUTATION_REASONS = new Set(["external_or_mutating_action"]);
const BLOCK_REASONS = new Set(["blocked_sensitive_or_destructive"]);

export const defaultPolicy = {
  name: "grand-default",
  allowAutoRun: ["read_or_draft_work"],
  requireApproval: ["external_or_mutating_action", "unclear_intent"],
  block: ["blocked_sensitive_or_destructive"]
};

export function evaluateTaskPolicy(task, policy = defaultPolicy) {
  const reasons = new Set(task.risk.reasons);

  for (const reason of reasons) {
    if (BLOCK_REASONS.has(reason) || policy.block.includes(reason)) {
      return {
        decision: "block",
        reason
      };
    }
  }

  for (const reason of reasons) {
    if (MUTATION_REASONS.has(reason) || policy.requireApproval.includes(reason)) {
      if (task.approval.approvedAt) {
        return {
          decision: "run",
          reason: "approved_mutation"
        };
      }

      return {
        decision: "wait_for_approval",
        reason
      };
    }
  }

  return {
    decision: "run",
    reason: "safe_auto_run"
  };
}
