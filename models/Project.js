const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true,
        trim: true
    },

    description: {
        type: String,
        default: ""
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    members: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],

    status: {
        type: String,
        enum: ["Planning", "Active", "Completed", "On Hold"],
        default: "Planning"
    },

    priority: {
        type: String,
        enum: ["Low", "Medium", "High"],
        default: "Medium"
    },

    startDate: Date,

    endDate: Date
},
{
    timestamps: true
});

module.exports = mongoose.model("Project", projectSchema);