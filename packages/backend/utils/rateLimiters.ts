import rateLimit from "express-rate-limit";

const createPostLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 25, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "You did more than 25 posts in 10 minutes",
});

const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 minutes
  max: 5, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    limiter: true,
    type: "error",
    message: "Too many calls to the register endpoint",
  },
});

const onePerSecondLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 1, // Limit each IP to 1 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    limiter: true,
    type: "error",
    message: "Too many calls to the register endpoint",
  },
});

const loginRateLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 10, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many login attemps",
});

const navigationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 40, // Limit each IP to 40 requests per `window` (here, per minute)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many navigation requests",
});

const linkPreviewRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // Limit each IP to 200 previews per minute. should move lower to a "acceptable" point
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many navigation requests",
});

const biteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Limit each IP to bites per minute. should move lower to a "acceptable" point
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many bites, you ate the server",
});

export {
  createPostLimiter,
  createAccountLimiter,
  loginRateLimiter,
  navigationRateLimiter,
  linkPreviewRateLimiter,
  biteLimiter,
  onePerSecondLimiter,
};
