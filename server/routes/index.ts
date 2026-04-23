import { Router } from 'express';
import authRoutes from './auth.routes';
import ticketRoutes from './ticket.routes';
import downloadRoutes from './download.routes';
import humanizeRoutes from './humanize.routes';
import subscriptionRoutes from './subscription.routes';

const router = Router();

router.use('/api/auth', authRoutes);
router.use('/api', ticketRoutes);
router.use('/api/download', downloadRoutes);
router.use('/api', humanizeRoutes);
router.use('/api', subscriptionRoutes);

export default router;
