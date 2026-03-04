// Helper function to group data by specified field
export const groupDataByField = (data: any[], groupBy: string) => {
	const grouped: { [key: string]: any[] } = {};

	data.forEach((item) => {
		// Use nullish coalescing so only null/undefined → "unassigned"; false, 0, "" stay as group keys
		const raw = item[groupBy];
		const groupValue = raw === undefined || raw === null ? "unassigned" : String(raw);
		if (!grouped[groupValue]) {
			grouped[groupValue] = [];
		}
		grouped[groupValue].push(item);
	});

	return grouped;
};
