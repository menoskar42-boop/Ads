import { Router, type IRouter } from "express";
import healthRouter from "./health";
import messengerRouter from "./messenger";
import messengerToolsRouter from "./messenger-tools";
import messengerGroupsRouter from "./messenger-groups";
import messengerPushRouter from "./messenger-push";
import messengerEventsRouter from "./messenger-events";
import messengerCallsRouter from "./messenger-calls";
import messengerAiRouter from "./messenger-ai";
import scheduledMessagesRouter from "./scheduled-messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(messengerRouter);
router.use(messengerToolsRouter);
router.use(messengerGroupsRouter);
router.use(messengerPushRouter);
router.use(messengerEventsRouter);
router.use(messengerCallsRouter);
router.use(messengerAiRouter);
router.use(scheduledMessagesRouter);

export default router;
