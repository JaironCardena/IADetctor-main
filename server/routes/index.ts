import { Router } from 'express';
import authRoutes from './auth.routes';
import ticketRoutes from './ticket.routes';
import downloadRoutes from './download.routes';
import humanizeRoutes from './humanize.routes';
import subscriptionRoutes from './subscription.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use('/api/auth', authRoutes);
router.use('/api', ticketRoutes);
router.use('/api/download', downloadRoutes);
router.use('/api', humanizeRoutes);
router.use('/api', subscriptionRoutes);
router.use('/api/admin', adminRoutes);

export default router;
