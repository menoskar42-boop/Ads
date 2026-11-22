import { Router, type IRouter } from "express";
import healthRouter from "./health";
import messengerRouter from "./messenger";
import scheduledMessagesRouter from "./scheduled-messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(messengerRouter);
router.use(scheduledMessagesRouter);

export default router;
