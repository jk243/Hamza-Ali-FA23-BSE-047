const Task = require('../models/Task');

// 🟢 CREATE: Create a new task
exports.createTask = async (req, res) => {
  try {
    const newTask = new Task(req.body);
    const savedTask = await newTask.save();
    res.status(201).json(savedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 🔵 READ: Get all tasks (supports optional ?assigneeId query param for filtering)
exports.getAllTask = async (req, res) => {
  try {
    const filter = {};
    if (req.query.assigneeId) {
      filter.assigneeId = req.query.assigneeId;
    }
    const tasks = await Task.find(filter);
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔵 READ: Get a single task by ID
exports.getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🟡 UPDATE: Update an existing task by ID
exports.updateTask = async (req, res) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    if (!updatedTask) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 🔴 DELETE: Remove a task by ID
exports.deleteTask = async (req, res) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) return res.status(404).json({ message: 'Task not found' });
    res.status(200).json({ message: 'Task successfully deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ============================================================================
   CHECKLIST OPERATIONS
   ============================================================================ */

// 🟢 CREATE: Add a checklist item to a task
exports.addChecklistItem = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Checklist item title is required' });
    }
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.checklist.push({ title: title.trim(), completed: false });
    const updatedTask = await task.save();
    res.status(201).json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 🟡 UPDATE: Update a checklist item's title
exports.updateChecklistItem = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Checklist item title is required' });
    }
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const item = task.checklist.id(req.params.checklistId);
    if (!item) return res.status(404).json({ message: 'Checklist item not found' });

    item.title = title.trim();
    const updatedTask = await task.save();
    res.status(200).json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 🟡 PATCH: Toggle a checklist item's completion status
exports.toggleChecklistItem = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const item = task.checklist.id(req.params.checklistId);
    if (!item) return res.status(404).json({ message: 'Checklist item not found' });

    item.completed = !item.completed;
    const updatedTask = await task.save();
    res.status(200).json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 🔴 DELETE: Delete a checklist item from a task
exports.deleteChecklistItem = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const item = task.checklist.id(req.params.checklistId);
    if (!item) return res.status(404).json({ message: 'Checklist item not found' });

    item.deleteOne();
    const updatedTask = await task.save();
    res.status(200).json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
