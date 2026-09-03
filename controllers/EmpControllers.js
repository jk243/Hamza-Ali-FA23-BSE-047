const Task = require("../models/Task");

// Employee Task Status Chart
// Returns monthly task counts for the current year + previous year
// so "This Month", "Last Month", "This Year" and "Last Year" all
// have real data to filter against on the frontend.
exports.getTaskStatusChart = async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = currentYear - 1;

    const rangeStart = new Date(startYear, 0, 1);
    const rangeEnd = new Date(currentYear + 1, 0, 1); // exclusive upper bound

    // Single aggregation query instead of looping 24 months x 3 status queries
    const results = await Task.aggregate([
      {
        $match: {
          createdAt: { $gte: rangeStart, $lt: rangeEnd },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Pre-fill every month in the range with zeros so the chart never
    // has gaps, and so the frontend's period filter always has a row
    // to match against.
    const chartMap = {};
    for (let y = startYear; y <= currentYear; y++) {
      const lastMonth = y === currentYear ? now.getMonth() : 11;
      for (let m = 0; m <= lastMonth; m++) {
        const key = `${y}-${String(m + 1).padStart(2, "0")}`;
        chartMap[key] = {
          month: key, // "YYYY-MM" so the frontend can tell years apart
          completed: 0,
          pending: 0,
          overdue: 0,
          totaltask: 0,
        };
      }
    }

    // Fill in real counts from the aggregation
    results.forEach((r) => {
      const key = `${r._id.year}-${String(r._id.month).padStart(2, "0")}`;
      if (!chartMap[key]) return; // outside the generated range, ignore

      const count = r.count;
      chartMap[key].totaltask += count;

      if (r._id.status === "Completed") {
        chartMap[key].completed += count;
      } else if (r._id.status === "Pending" || r._id.status === "In Progress") {
        chartMap[key].pending += count;
      } else if (r._id.status === "Overdue") {
        chartMap[key].overdue += count;
      }
    });

    const chartData = Object.values(chartMap).sort((a, b) =>
      a.month > b.month ? 1 : -1
    );

    res.status(200).json(chartData);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch task status chart",
    });
  }
};