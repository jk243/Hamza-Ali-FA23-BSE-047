const Project = require("../models/Project");


// Create Project
exports.createProject = async (req, res) => {

    try {

        const project = await Project.create(req.body);

        res.status(201).json({
            success: true,
            message: "Project created successfully",
            project
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};



// Get All Projects
exports.getAllProjects = async (req, res) => {

    try {

        const projects = await Project.find()
            .populate("createdBy", "name email")
            .populate("members", "name email");

        res.status(200).json({
            success: true,
            count: projects.length,
            projects
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};




// Get Single Project
exports.getProject = async (req, res) => {

    try {

        const project = await Project.findById(req.params.id)
            .populate("createdBy", "name email")
            .populate("members", "name email");

        if (!project) {

            return res.status(404).json({
                success: false,
                message: "Project not found"
            });

        }

        res.status(200).json({
            success: true,
            project
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};




// Update Project
exports.updateProject = async (req, res) => {

    try {

        const project = await Project.findByIdAndUpdate(

            req.params.id,

            req.body,

            {
                new: true,
                runValidators: true
            }

        );

        if (!project) {

            return res.status(404).json({
                success: false,
                message: "Project not found"
            });

        }

        res.status(200).json({
            success: true,
            message: "Project updated successfully",
            project
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};




// Delete Project
exports.deleteProject = async (req, res) => {

    try {

        const project = await Project.findByIdAndDelete(req.params.id);

        if (!project) {

            return res.status(404).json({
                success: false,
                message: "Project not found"
            });

        }

        res.status(200).json({
            success: true,
            message: "Project deleted successfully"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};