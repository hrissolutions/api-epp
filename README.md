# MSA Template 1BIS

A production-ready microservice template and utility library built with TypeScript, Express, and Prisma (MongoDB). This enterprise-grade package provides both reusable utilities for existing projects and a complete scaffolding system for creating scalable microservices.

## 🚀 Getting Started - Complete Implementation Guide

Follow this comprehensive step-by-step guide to implement a fully deployed microservice architecture from initial setup to production deployment.

### Phase 1: Project Initialization & Codebase Generation

#### Step 1: Package Installation

Install the MSA Template 1BIS package in your project:

```bash
npm i msa-template-1bis
```

#### Step 2: Generate Complete Codebase

Generate the full microservice architecture with all necessary components:

```bash
npx msa-generate --all
```

#### Step 3: Install Project Dependencies

Install all required dependencies for the generated codebase:

```bash
npm i
```

#### Step 4: Prisma Version Compatibility Update

Update Prisma to the recommended version for optimal compatibility:

```bash
npm uninstall prisma @prisma/client
npm install prisma@6.5.0 @prisma/client@6.5.0 --save-dev
```

#### Step 5: Generate Prisma Client

Generate the Prisma client for database operations:

```bash
npx prisma generate
```

#### Step 6: Build Verification

Verify that the project builds successfully:

```bash
npm run build
```

### Phase 2: Service Development & Testing

#### Step 7: Generate New Microservice

Create a new microservice with complete CRUD operations and validation:

```bash
npx msa-generate <serviceName>
# Example: npx msa-generate user
```

#### Step 8: Update Database Schema

Generate Prisma client for the new service schema:

```bash
npx prisma generate
```

#### Step 9: Local Development Testing

Start the development server to test your new service:

```bash
npm run dev
```

#### Step 10: Production Deployment

Deploy your microservice to your preferred cloud platform (AWS, Azure, Google Cloud, Heroku, etc.)

### Phase 3: API Gateway Integration & Service Orchestration

#### Step 11: Register Service with API Gateway

Integrate your deployed service with the API Gateway for centralized routing:

```bash
npx msi-generate -- <service-api-url>
# Example: npx msi-generate -- https://your-service.herokuapp.com/api/users
```

#### Step 12: Deploy API Gateway

Deploy your API Gateway with the newly registered service configuration.

#### Step 13: Environment Configuration

Update your production environment variables with the necessary service configurations.

#### Step 14: Gateway Integration Testing

Validate the API Gateway integration by testing the service endpoints:

```bash
curl https://your-gateway.com/api/users
```

### Phase 4: Advanced Integration & Interface Mapping

#### Step 15: Create IML Specification

Develop your Interface Mapping Language (IML) specification files in the `iml/` directory for advanced service integration.

#### Step 16: Generate Services and Hooks from IML

Generate comprehensive services and React Query hooks from your IML specifications:

```bash
npx mta-generate --all
```

#### Step 17: Final Production Build

Perform a comprehensive build verification before production deployment:

```bash
npm run build
```

## 🎯 Enterprise Features & Capabilities

### 📦 **Production-Ready Utilities**

- **Advanced Query Utilities** - Flexible response formats with pagination, filtering, sorting, and data grouping capabilities
- **Comprehensive Validation** - Type-safe request/response validation with Zod integration and automatic type inference
- **Enterprise Logging** - Structured logging with Winston, activity tracking, audit trails, and error monitoring
- **Security Middleware** - Rate limiting, JWT authentication, role-based authorization, CORS protection, and Helmet security
- **File Processing** - Multipart upload handling with Multer, Cloudinary integration, and form data processing
- **Error Management** - Standardized error responses, comprehensive error tracking, and graceful error handling
- **Performance Monitoring** - Metrics collection, system health monitoring, and performance optimization tools
- **Caching Layer** - Redis integration with intelligent caching middleware and connection health monitoring
- **Real-time Communication** - Socket.IO integration for WebSocket connections and real-time data streaming

### 🏗️ **Enterprise Service Scaffolding**

- **Modular Architecture** - Template-based service generation with customizable, scalable architecture patterns
- **Database Integration** - Prisma schema generation with full MongoDB support, relationships, and advanced query capabilities
- **Type Safety** - Comprehensive TypeScript configuration with strict type checking and modern ES module support
- **Quality Assurance** - Automated test suite generation with Mocha and Chai covering 65+ test scenarios
- **Data Management** - Intelligent database seeder generation with realistic test data and relationship management
- **API Documentation** - Automated OpenAPI/Swagger documentation generation with interactive API explorers
- **Containerization** - Production-ready Docker configuration with optimized Dockerfile and docker-compose setup
- **Interface Mapping** - IML-based generation for comprehensive services and React Query hooks from specifications

## 🔧 Command Reference

### Core CLI Commands

```bash
# Generate complete microservice architecture
npx msa-generate --all

# Generate individual microservice
npx msa-generate <serviceName>

# Integrate service with API Gateway
npx msi-generate -- <upstream-url>

# Generate services from IML specifications
npx mta-generate --all
```

### Development & Build Commands

```bash
npm run dev                 # Start development server with hot reload
npm run build               # Production build with webpack optimization
npm test                    # Execute comprehensive test suite
npx prisma generate         # Generate Prisma client for database operations
```

## 🧪 Quality Assurance & Testing

Generated services include enterprise-grade test suites with comprehensive coverage:

- **CRUD Operations Testing** - Complete data validation and persistence testing
- **API Endpoint Testing** - Full integration testing for all REST endpoints
- **Error Scenario Coverage** - Comprehensive edge case and error condition testing
- **Security Validation** - Authentication, authorization, and input validation testing
- **Performance Benchmarking** - Response time and resource utilization testing

```bash
npm test              # Execute comprehensive test suite with Mocha
```

## 📚 Enterprise Documentation

Each generated service includes production-ready documentation:

- **Interactive API Documentation** - OpenAPI/Swagger with live API explorer
- **Postman Collections** - Pre-configured request collections for testing
- **Comprehensive API Reference** - Detailed parameter descriptions and examples
- **Multi-language Code Examples** - Implementation examples in multiple programming languages

```bash
npx msa-docs          # Generate interactive OpenAPI documentation
npm run export-docs   # Export complete documentation package
```

## 🏗️ Enterprise Project Architecture

```
your-project/
├── app/                    # Microservice application modules
├── config/                # Environment and configuration management
├── helper/                # Reusable utility functions and helpers
├── middleware/            # Express middleware and security layers
├── prisma/               # Database schema definitions and seeders
├── tests/                # Comprehensive test suites
├── utils/                # Core utility functions and services
└── docs/                 # Auto-generated API documentation
```

## 🚀 Implementation Checklist

### Complete Enterprise Implementation Summary

1. **Package Installation**: `npm i msa-template-1bis`
2. **Architecture Generation**: `npx msa-generate --all`
3. **Dependency Installation**: `npm i`
4. **Prisma Compatibility**: `npm uninstall prisma @prisma/client && npm install prisma@6.5.0 @prisma/client@6.5.0 --save-dev`
5. **Database Client Generation**: `npx prisma generate`
6. **Build Verification**: `npm run build`
7. **Service Creation**: `npx msa-generate <serviceName>`
8. **Schema Update**: `npx prisma generate`
9. **Local Testing**: `npm run dev`
10. **Production Deployment**: Deploy to cloud platform
11. **Gateway Integration**: `npx msi-generate -- <api-url>`
12. **Gateway Deployment**: Deploy API Gateway
13. **Environment Configuration**: Update production environment
14. **Integration Testing**: Test gateway endpoints
15. **IML Specification**: Create Interface Mapping Language files
16. **Advanced Generation**: `npx mta-generate --all`
17. **Final Verification**: `npm run build`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏷️ Technology Stack

`typescript`, `express`, `prisma`, `mongodb`, `microservice`, `template`, `scaffolding`, `api`, `rest`, `swagger`, `openapi`, `zod`, `validation`, `logging`, `security`, `middleware`, `query-utils`, `winston`, `redis`, `socket.io`, `jwt`, `authentication`, `mocha`, `chai`, `testing`, `enterprise`, `production-ready`, `scalable`

## 🐳 Docker Usage

Run the service with Docker Compose. Ensure Docker Desktop is running.

### Build and start in detached mode

```bash
docker compose up --build -d
```

- Builds images from the `Dockerfile` and starts containers in the background.

### Start using existing images (no rebuild)

```bash
docker compose up
```

- Uses previously built images and attaches logs in the foreground. Press Ctrl+C to stop.

### Helpful commands

```bash
docker compose logs -f          # Follow logs
docker compose ps               # List running services
docker compose down             # Stop and remove containers, networks
docker compose down -v          # Also remove volumes (destructive)
```
