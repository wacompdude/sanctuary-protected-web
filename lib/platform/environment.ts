export function getDeployedEnvironmentLabel(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local";
}

export function isProductionEnvironment(): boolean {
  const value = getDeployedEnvironmentLabel().toLowerCase();
  return value === "production";
}
