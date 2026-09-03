const express = require("express");

const router = express.Router();

const {

    createProject,
    getAllProjects,
    getProject,
    updateProject,
    deleteProject

} = require("../controllers/projectController");
// NOTE: file-system name mismatch fix: backend/controllers/ProjectControlllers.js is wrapped by projectController.js

router.post("/create", createProject);

router.get("/get", getAllProjects);

router.get("/get/:id", getProject);

router.put("/update/:id", updateProject);

router.delete("/delete/:id", deleteProject);

module.exports = router;