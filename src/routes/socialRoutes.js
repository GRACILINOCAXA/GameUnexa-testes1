import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  renderProfile,
  removeFromLibrary,
  renderCommunity,
  toggleFollow,
  renderFeed
} from '../controllers/socialController.js';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  createPost
} from '../controllers/socialFeaturesController.js';
import { addComment, toggleLike } from '../controllers/interactionController.js';

const router = Router();

router.get('/feed', requireAuth, renderFeed);

router.get('/profile', requireAuth, renderProfile);
router.get('/profile/:username', requireAuth, renderProfile);
router.post('/profile/library/remove', requireAuth, removeFromLibrary);

router.get('/community', requireAuth, renderCommunity);
router.post('/community/follow/:targetId', requireAuth, toggleFollow);
router.post('/community/friends/request/:targetId', requireAuth, sendFriendRequest);
router.post('/community/friends/accept/:targetId', requireAuth, acceptFriendRequest);
router.post('/community/friends/decline/:targetId', requireAuth, declineFriendRequest);
router.post('/community/friends/cancel/:targetId', requireAuth, cancelFriendRequest);

router.post('/feed/posts', requireAuth, createPost);
router.post('/social/like', requireAuth, toggleLike);
router.post('/social/comment', requireAuth, addComment);

export default router;