import jwt from 'jsonwebtoken';

const getJwtSecret = () => process.env.JWT_SECRET || 'gameunexa-dev-secret';

export const requireAuth = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect('/auth/login');
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded; // { id, username }
    next();
  } catch (error) {
    res.clearCookie('token');
    return res.redirect('/auth/login');
  }
};

export const checkUser = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    res.locals.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    res.locals.user = decoded;
    req.user = decoded;
  } catch (error) {
    res.locals.user = null;
  }
  next();
};