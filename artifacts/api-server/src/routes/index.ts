import { Router, type IRouter } from "express";
import healthRouter from "./health";
import messengerRouter from "./messenger";
import messengerToolsRouter from "./messenger-tools";
import scheduledMessagesRouter from "./scheduled-messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(messengerRouter);
router.use(messengerToolsRouter);
router.use(scheduledMessagesRouter);

export default router;
