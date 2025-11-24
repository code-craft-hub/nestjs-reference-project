### REST API
All REST endpoints are available at http://localhost:3000/api/v1
Orders

```bash
POST /api/v1/orders - Create new order
GET /api/v1/orders/:id - Get order by ID
GET /api/v1/orders/user/:userId - Get user orders (paginated)
PATCH /api/v1/orders/:id/status - Update order status
POST /api/v1/orders/:id/cancel - Cancel order
GET /api/v1/orders/stats/summary - Get order statistics

Health

GET /health - Comprehensive health check
GET /health/liveness - Kubernetes liveness probe
GET /health/readiness - Kubernetes readiness probe

Swagger Documentation
Access interactive API documentation at:
http://localhost:3000/api/docs