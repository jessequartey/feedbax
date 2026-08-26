export function isCapabilityAuthorizationFailure(error: unknown) {
  return error instanceof Error && error.message.includes("did not authorize");
}
