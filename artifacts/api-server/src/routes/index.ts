import { Router, type IRouter } from "express";
import healthRouter from "./health";
import messengerRouter from "./messenger";

const router: IRouter = Router();

router.use(healthRouter);
router.use(messengerRouter);

export default router;
