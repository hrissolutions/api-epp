// Helper function to group data by specified field
export const groupDataByField = (data: any[], groupBy: string) => {
	const grouped: { [key: string]: any[] } = {};

	data.forEach((item) => {
		const groupValue = item[groupBy] || "unassigned";
		if (!grouped[groupValue]) {
			grouped[groupValue] = [];
		}
		grouped[groupValue].push(item);
	});

	return grouped;
};
