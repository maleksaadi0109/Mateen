import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teacherReviewRouter from "./teacher-review";
import sourceReviewRouter from "./source-review";
import mateenRouter from "./mateen";

const router: IRouter = Router();

router.use(healthRouter);
router.use(teacherReviewRouter);
router.use(sourceReviewRouter);
router.use(mateenRouter);

export default router;
