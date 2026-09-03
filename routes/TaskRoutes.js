const express = require("express");

const router = express.Router();

const {
    createTask,
    getAllTask,
    getTaskById,
    updateTask,
    deleteTask,
    addChecklistItem,
    updateChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem
} = require("../controllers/TaskControllers");


// Create Task
router.post("/create", createTask);

// Get All Tasks
router.get("/get", getAllTask);

// Get Single Task
router.get("/get/:id", getTaskById);

// Update Task
router.put("/update/:id", updateTask);

// Delete Task
router.delete("/delete/:id", deleteTask);

// Checklist routes
router.post("/:id/checklist", addChecklistItem);
router.put("/:id/checklist/:checklistId", updateChecklistItem);
router.patch("/:id/checklist/:checklistId/toggle", toggleChecklistItem);
router.delete("/:id/checklist/:checklistId", deleteChecklistItem);

module.exports = router;
