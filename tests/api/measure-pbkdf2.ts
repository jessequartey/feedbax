// Local diagnostic only. See PBKDF2.md for the live Workers Free CPU gate.
import { hashPassword, verifyPassword, PASSWORD_ITERATIONS } from "../../src/server/password.ts";

const samples = 30;
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
async function measure(label: string, run: () => Promise<unknown>) {
  const cpu: number[] = [],
    wall: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now(),
      usage = process.cpuUsage();
    await run();
    const elapsed = process.cpuUsage(usage);
    cpu.push((elapsed.user + elapsed.system) / 1000);
    wall.push(performance.now() - start);
  }
  return {
    operation: label,
    samples,
    iterations: PASSWORD_ITERATIONS,
    cpuP50Ms: percentile(cpu, 0.5).toFixed(3),
    cpuP95Ms: percentile(cpu, 0.95).toFixed(3),
    wallP50Ms: percentile(wall, 0.5).toFixed(3),
    wallP95Ms: percentile(wall, 0.95).toFixed(3),
  };
}
const password = "local measurement password";
const hash = await hashPassword(password);
console.log(
  JSON.stringify(
    [
      await measure("hash", () => hashPassword(password)),
      await measure("verify", () => verifyPassword({ hash, password })),
    ],
    null,
    2,
  ),
);
