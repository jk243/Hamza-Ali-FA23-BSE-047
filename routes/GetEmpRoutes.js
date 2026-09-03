const express = require("express");

const router = express.Router();

const {
    getAllTask
} = require("../controllers/GetEmpControllers");



router.get("/get",getAllTask);