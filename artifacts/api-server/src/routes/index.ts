import { Router, type IRouter } from 'express';
import healthRouter from './health';
import productsRouter from './products';
import ordersRouter from './orders';
import stockRouter from './stock';
import employeesRouter from './employees';
import promotionsRouter from './promotions';
import customersRouter from './customers';
import suppliersRouter from './suppliers';
import settingsRouter from './settings';
import reportsRouter from './reports';

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(stockRouter);
router.use(employeesRouter);
router.use(promotionsRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(settingsRouter);
router.use(reportsRouter);

export default router;
