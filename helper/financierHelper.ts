/**
 * Resolve the interest rate (%) for a given installment count using the financier config's
 * installment rate configuration. Example: 3 installments → 1.5%, 6 → 2%, 12 → 3%.
 */

export type InstallmentRateTier = { installmentCount: number; rate: number };

/**
 * Get the rate for a given installment count from installmentRateConfig.
 * - If a tier with matching installmentCount exists, returns that rate.
 * - Otherwise returns 0.
 */
export function getRateForInstallmentCount(
	installmentCount: number,
	config: {
		installmentRateConfig?: InstallmentRateTier[] | null;
	},
): number {
	const tiers = Array.isArray(config.installmentRateConfig) ? config.installmentRateConfig : [];
	const tier = tiers.find((t) => t.installmentCount === installmentCount);
	if (tier != null && typeof tier.rate === "number") {
		return tier.rate;
	}
	return 0;
}
