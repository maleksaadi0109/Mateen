import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mateenRouter from "./mateen";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mateenRouter);

export default router;
