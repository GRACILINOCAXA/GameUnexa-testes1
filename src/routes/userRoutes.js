import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { renderProfileSettings, updateProfile } from '../controllers/userController.js';
import {
  renderAccountSettings,
  updateAccountDetails,
  changePassword,
  deleteAccount
} from '../controllers/accountController.js';

const router = Router();

router.get('/settings', requireAuth, renderProfileSettings);
router.post('/settings', requireAuth, updateProfile);
router.get('/account', requireAuth, renderAccountSettings);
router.post('/account/profile', requireAuth, updateAccountDetails);
router.post('/account/password', requireAuth, changePassword);
router.post('/account/delete', requireAuth, deleteAccount);

export default router;