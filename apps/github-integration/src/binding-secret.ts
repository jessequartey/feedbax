import { integrationSecret } from "../../../packages/feedback/src/integration-auth";
export function bindingSecret(
  master: string,
  binding: {
    installation_id: string;
    origin: string;
    github_installation_id: number;
    repository_id: number;
    key_version: number;
  },
  direction: "portal" | "service",
) {
  return integrationSecret(
    master,
    JSON.stringify([
      binding.installation_id,
      binding.origin,
      binding.github_installation_id,
      binding.repository_id,
    ]),
    direction,
    binding.key_version,
  );
}
