// Helper function to group data by specified field.
// Resolution order for the groupBy key:
//   1. Top-level field on the item (e.g. item["status"])
//   2. One level deep inside any nested plain-object value
//      (e.g. item.order.status when groupBy="status", or item.item.itemType when groupBy="itemType")
// This handles both flat documents and enriched document-mode responses where the
// primary record is nested under a sub-key (order, item, transaction, etc.).
export const groupDataByField = (data: any[], groupBy: string) => {
	const grouped: { [key: string]: any[] } = {};

	data.forEach((item) => {
		let raw = item[groupBy];

		// Fall back: search one level deep in nested plain objects when not found at root
		if ((raw === undefined || raw === null) && item && typeof item === "object") {
			for (const subKey of Object.keys(item)) {
				const sub = item[subKey];
				if (sub && typeof sub === "object" && !Array.isArray(sub) && sub[groupBy] !== undefined) {
					raw = sub[groupBy];
					break;
				}
			}
		}

		// Use nullish coalescing so only null/undefined → "unassigned"; false, 0, "" stay as group keys
		const groupValue = raw === undefined || raw === null ? "unassigned" : String(raw);
		if (!grouped[groupValue]) {
			grouped[groupValue] = [];
		}
		grouped[groupValue].push(item);
	});

	return grouped;
};
