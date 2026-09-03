const Task = require("../models/Task");

exports.getTaskProgress = async (req, res) => {
  try {
    const tasks = await Task.find();

    const now = new Date();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
    const endOfLastYear = new Date(now.getFullYear(), 0, 1);

    const calculate = (taskList) => {
      const target = taskList.length;

      const completed = taskList.filter(
        (task) => task.status === "Completed"
      ).length;

      const remaining = target - completed;

      const percentage =
        target === 0
          ? 0
          : Math.round((completed / target) * 100);

      return {
        percentage,
        target,
        completed,
        remaining,
      };
    };

    const recent = calculate(tasks);

    const thisMonth = calculate(
      tasks.filter((task) => task.createdAt >= startOfMonth)
    );

    const thisYear = calculate(
      tasks.filter((task) => task.createdAt >= startOfYear)
    );

    const lastYear = calculate(
      tasks.filter(
        (task) =>
          task.createdAt >= startOfLastYear &&
          task.createdAt < endOfLastYear
      )
    );

    res.json({
      recent,
      thisMonth,
      thisYear,
      lastYear,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};