/**
 * 组合多个中间件为一个执行链
 */
export function composeMiddlewares(middlewares) {
  if (!Array.isArray(middlewares)) {
    throw new Error('Middlewares must be an array');
  }

  return (handler, context) => {
    let index = -1;

    const dispatch = async (i) => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i === middlewares.length) {
        return handler();
      }

      const middleware = middlewares[i];
      return middleware(() => dispatch(i + 1), context);
    };

    return dispatch(0);
  };
}

/**
 * 审计中间件 - 记录 AI 调用日志
 */
export function auditMiddleware(options = {}) {
  const logger = options.logger || console;

  return async (next, context) => {
    const startTime = Date.now();
    const { agent, context: runContext } = context;

    const auditLog = {
      type: 'agent_execution',
      agent_name: agent?.name || 'unknown',
      user_id: runContext?.userId,
      conversation_id: runContext?.conversationId,
      capability: runContext?.capability?.key,
      start_time: new Date().toISOString(),
    };

    try {
      const result = await next();

      auditLog.status = 'success';
      auditLog.duration = Date.now() - startTime;

      if (options.verbose) {
        logger.log('AI execution succeeded:', auditLog);
      }

      return result;
    } catch (error) {
      auditLog.status = 'failed';
      auditLog.error = error.message;
      auditLog.duration = Date.now() - startTime;

      logger.error('AI execution failed:', auditLog);

      throw error;
    }
  };
}

/**
 * 限流中间件 - 防止 AI 调用频率过高
 */
export function rateLimitMiddleware(options = {}) {
  const maxRequests = options.maxRequests || 10;
  const windowMs = options.windowMs || 60000; // 1分钟
  const userLimits = new Map();

  return async (next, context) => {
    const userId = context.context?.userId;

    if (!userId) {
      // 未登录用户不限流（或者可以按 IP 限流）
      return next();
    }

    const now = Date.now();
    const userLimit = userLimits.get(userId) || { count: 0, resetTime: now + windowMs };

    // 重置计数器
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + windowMs;
    }

    // 检查限流
    if (userLimit.count >= maxRequests) {
      const waitSeconds = Math.ceil((userLimit.resetTime - now) / 1000);
      const error = new Error(`AI 调用频率超限，请 ${waitSeconds} 秒后重试`);
      error.statusCode = 429;
      throw error;
    }

    // 增加计数
    userLimit.count += 1;
    userLimits.set(userId, userLimit);

    return next();
  };
}

/**
 * 权限中间件 - 检查用户是否有权使用指定能力
 */
export function permissionMiddleware(options = {}) {
  return async (next, context) => {
    const { user, capability } = context.context || {};

    if (!capability) {
      return next();
    }

    // 检查能力所需权限
    if (capability.requiredPermissions && capability.requiredPermissions.length > 0) {
      if (!user) {
        const error = new Error('需要登录才能使用此功能');
        error.statusCode = 401;
        throw error;
      }

      if (typeof user.hasPermissions === 'function') {
        if (!user.hasPermissions(capability.requiredPermissions)) {
          const error = new Error(`无权使用 ${capability.label} 能力`);
          error.statusCode = 403;
          throw error;
        }
      }
    }

    return next();
  };
}

/**
 * 错误处理中间件 - 统一处理异常
 */
export function errorHandlerMiddleware(options = {}) {
  const logger = options.logger || console;

  return async (next, context) => {
    try {
      return await next();
    } catch (error) {
      logger.error('Middleware error:', {
        message: error.message,
        stack: error.stack,
        context: {
          userId: context.context?.userId,
          conversationId: context.context?.conversationId,
          capability: context.context?.capability?.key,
        },
      });

      // 重新抛出错误，让上层处理
      throw error;
    }
  };
}

/**
 * 性能监控中间件 - 记录执行时间
 */
export function performanceMiddleware(options = {}) {
  const logger = options.logger || console;
  const threshold = options.threshold || 5000; // 5秒

  return async (next, context) => {
    const startTime = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - startTime;

      if (duration > threshold) {
        logger.warn('Slow AI execution detected:', {
          duration,
          capability: context.context?.capability?.key,
          conversationId: context.context?.conversationId,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('AI execution failed after:', { duration });
      throw error;
    }
  };
}

/**
 * 上下文验证中间件 - 确保必需的上下文字段存在
 */
export function contextValidationMiddleware(options = {}) {
  const requiredFields = options.requiredFields || [];

  return async (next, context) => {
    const runContext = context.context || {};

    for (const field of requiredFields) {
      if (!(field in runContext)) {
        const error = new Error(`Missing required context field: ${field}`);
        error.statusCode = 400;
        throw error;
      }
    }

    return next();
  };
}
