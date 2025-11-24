export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  environment: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    name: process.env.DB_NAME || 'order_service',
    synchronize: process.env.DB_SYNC === 'true',
    logging: process.env.DB_LOGGING === 'true',
    ssl: process.env.DB_SSL === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  kafka: {
    broker: process.env.KAFKA_BROKER || 'localhost:9092',
    clientId: 'order-service',
    groupId: 'order-consumer-group',
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  },

  grpc: {
    url: process.env.GRPC_URL || '0.0.0.0:50051',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'order-service',
    audience: process.env.JWT_AUDIENCE || 'order-service-api',
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/google/callback',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/microsoft/callback',
    },
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    encryptionKey: process.env.ENCRYPTION_KEY || 'master-encryption-key-32-chars-min',
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
    accountLockTime: parseInt(process.env.ACCOUNT_LOCK_TIME, 10) || 1800000, // 30 minutes
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT, 10) || 86400000, // 24 hours
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 10,
  },

  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:4200'],
    credentials: true,
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 1.0,
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'noreply@orderservice.com',
  },

  app: {
    name: 'Order Management Service',
    version: '2.0.0',
    description: 'Enterprise-grade microservice with advanced auth',
    apiPrefix: 'api/v1',
  },
});
// export default () => ({
//   port: parseInt(process.env.PORT ?? '3000', 10),
  
//   database: {
//     host: process.env.DB_HOST || 'localhost',
//     port: parseInt(process.env.DB_PORT ?? '5432', 10) || 5432,
//     username: process.env.DB_USERNAME || 'postgres',
//     password: process.env.DB_PASSWORD || 'admin',
//     name: process.env.DB_NAME || 'order_service',
//     synchronize: process.env.DB_SYNC === 'false',
//     logging: process.env.DB_LOGGING === 'true',
//     ssl: process.env.DB_SSL === 'true',
//   },

//   redis: {
//     host: process.env.REDIS_HOST || 'localhost',
//     port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
//     password: process.env.REDIS_PASSWORD || undefined,
//   },

//   kafka: {
//     broker: process.env.KAFKA_BROKER || 'localhost:9092',
//     clientId: 'order-service',
//   },

//   rabbitmq: {
//     url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
//   },

//   grpc: {
//     url: process.env.GRPC_URL || '0.0.0.0:50051',
//   },

//   jwt: {
//     secret: process.env.JWT_SECRET || 'your-secret-key',
//     expiresIn: process.env.JWT_EXPIRES_IN || '24h',
//   },
// });