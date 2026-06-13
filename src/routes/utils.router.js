import { Router } from "express";
import { generateRoomCode, joinRoom } from "../controllers/utills.controller.js";


const router = Router()


router.route("/generateRoomCode").get(generateRoomCode)

router.route("/joinRoom").post(joinRoom)

export default router