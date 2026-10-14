import {
  BrowserCapabilityAuthorizationError,
  VoteEligibilityError,
} from "@feedbax/feedback";

export async function runSafePublicRead<Value>(
  operation: () => Promise<Value>,
): Promise<Value> {
  try {
    return await operation();
  } catch {
    throw new Error("Public feedback is temporarily unavailable.");
  }
}

export class ActionablePortalFailure extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ActionablePortalFailure";
  }
}

export async function runSafePortalMutation<Value>(
  operation: () => Promise<Value>,
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof ActionablePortalFailure ||
      error instanceof BrowserCapabilityAuthorizationError ||
      error instanceof VoteEligibilityError
    ) {
      throw error;
    }
    throwSafePortalMutationFailure();
  }
}

function throwSafePortalMutationFailure(): never {
  throw new Error("Public feedback mutation is temporarily unavailable.");
}
