# Database Schema Diagram

This Mermaid diagram represents the complete database schema and external API relationships for the EPP Backend system.

```mermaid
erDiagram
    %% User Management
    Person ||--o{ User : "has"
    Person {
        ObjectId id PK
        ObjectId organizationId
        PersonalInfo personalInfo
        ContactInfo contactInfo
        Identification identification
        Metadata metadata
        DateTime createdAt
        DateTime updatedAt
        Boolean isDeleted
    }
    
    User ||--o{ AuditLogging : "creates"
    User {
        ObjectId id PK
        ObjectId personId FK
        String avatar
        String userName
        String email
        String password
        Status status
        Boolean isDeleted
        DateTime lastLogin
        String loginMethod
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% Categories and Items
    Category ||--o{ Category : "parent-child"
    Category ||--o{ Item : "contains"
    Category {
        ObjectId id PK
        String name
        String slug
        String description
        ObjectId parentId FK
        Boolean isActive
        DateTime createdAt
        DateTime updatedAt
    }
    
    Vendor ||--o{ Item : "supplies"
    Vendor {
        ObjectId id PK
        String name
        String code
        String description
        String contactName
        String email
        String phone
        String website
        Boolean isActive
        DateTime createdAt
        DateTime updatedAt
    }
    
    Item ||--o{ CartItem : "in"
    Item ||--o{ WishlistItem : "in"
    Item ||--o{ Purchase : "purchased"
    Item ||--o{ OrderItem : "ordered"
    Item {
        ObjectId id PK
        String sku
        String name
        String description
        ObjectId categoryId FK
        ObjectId vendorId FK
        ItemType itemType
        Float retailPrice
        Float sellingPrice
        Float costPrice
        Int stockQuantity
        Int lowStockThreshold
        String imageUrl
        Json images
        Json specifications
        Boolean isActive
        Boolean isFeatured
        Boolean isAvailable
        ItemStatus status
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% Shopping Cart and Wishlist
    CartItem {
        ObjectId id PK
        ObjectId employeeId
        ObjectId itemId FK
        Int quantity
        DateTime createdAt
        DateTime updatedAt
    }
    
    WishlistItem {
        ObjectId id PK
        ObjectId employeeId
        ObjectId itemId FK
        DateTime createdAt
    }
    
    %% Orders and Order Items
    Order ||--o{ OrderItem : "contains"
    Order ||--o{ Installment : "has"
    Order ||--|| Transaction : "has"
    Order ||--o| ApprovalWorkflow : "uses"
    Order ||--o{ OrderApproval : "requires"
    Order {
        ObjectId id PK
        String orderNumber
        ObjectId employeeId
        OrderStatus status
        Json items
        Float subtotal
        Float discount
        Float tax
        Float total
        PaymentType paymentType
        Int installmentMonths
        Int installmentCount
        Float installmentAmount
        Float pointsUsed
        String trackingNumber
        PaymentMethod paymentMethod
        PaymentStatus paymentStatus
        ObjectId workflowId FK
        Int currentApprovalLevel
        Boolean isFullyApproved
        DateTime approvedAt
        DateTime rejectedAt
        String rejectedBy
        String rejectionReason
        DateTime orderDate
        DateTime shippedDate
        DateTime deliveredDate
        DateTime cancelledDate
        String notes
        DateTime createdAt
        DateTime updatedAt
    }
    
    OrderItem {
        ObjectId id PK
        ObjectId orderId FK
        ObjectId itemId FK
        Int quantity
        Float unitPrice
        Float discount
        Float subtotal
        DateTime createdAt
    }
    
    %% Approval Workflow System
    ApprovalWorkflow ||--o{ WorkflowApprovalLevel : "has"
    ApprovalWorkflow ||--o{ Order : "applies-to"
    ApprovalWorkflow {
        ObjectId id PK
        String name
        String description
        Boolean isActive
        Float minOrderAmount
        Float maxOrderAmount
        Boolean requiresInstallment
        DateTime createdAt
        DateTime updatedAt
    }
    
    ApprovalLevel ||--o{ WorkflowApprovalLevel : "used-in"
    ApprovalLevel {
        ObjectId id PK
        ApproverRole role
        String description
        Boolean isRequired
        Float autoApproveUnder
        Int timeoutDays
        DateTime createdAt
        DateTime updatedAt
    }
    
    WorkflowApprovalLevel {
        ObjectId id PK
        ObjectId workflowId FK
        ObjectId approvalLevelId FK
        Int level
        ObjectId approverId
        String approverName
        String approverEmail
        DateTime createdAt
        DateTime updatedAt
    }
    
    OrderApproval {
        ObjectId id PK
        ObjectId orderId FK
        Int approvalLevel
        ApproverRole approverRole
        String approverId
        String approverName
        String approverEmail
        ApprovalStatus status
        DateTime approvedAt
        DateTime rejectedAt
        String comments
        DateTime notifiedAt
        DateTime reminderSentAt
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% Payment and Transactions
    Transaction {
        ObjectId id PK
        String transactionNumber
        ObjectId employeeId
        ObjectId orderId FK
        TransactionType type
        TransactionStatus status
        Float totalAmount
        Float paidAmount
        Float balance
        PaymentMethod paymentMethod
        Json paymentHistory
        Float pointsUsed
        String pointsTransactionId
        Float cashAmount
        String receiptNumber
        Boolean isReconciled
        DateTime reconciledAt
        String reconciledBy
        String notes
        Json metadata
        DateTime createdAt
        DateTime updatedAt
    }
    
    Installment {
        ObjectId id PK
        ObjectId orderId FK
        Int installmentNumber
        Float amount
        InstallmentStatus status
        DateTime cutOffDate
        DateTime scheduledDate
        DateTime deductedDate
        String payrollBatchId
        String deductionReference
        String notes
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% Purchases
    Purchase {
        ObjectId id PK
        ObjectId employeeId
        ObjectId itemId FK
        PurchaseType purchaseType
        Float totalAmount
        Float downPayment
        PurchaseStatus status
        ObjectId approvedBy
        DateTime approvedAt
        String rejectionReason
        String notes
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% Notifications
    Notification {
        ObjectId id PK
        ObjectId source
        String category
        String title
        String description
        Recipients recipients
        Json metadata
        Boolean isDeleted
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% Audit Logging
    AuditLogging {
        ObjectId id PK
        ObjectId userId FK
        String type
        String severity
        Entity entity
        Changes changes
        RequestMetadata metadata
        String description
        Boolean archiveStatus
        DateTime archiveDate
        Boolean isDeleted
        DateTime timestamp
        DateTime createdAt
        DateTime updatedAt
    }
    
    %% External APIs (Consumed Services)
    ExternalAPI_ActivityLog {
        String url "http://localhost:3001/api/activityLog"
        String method "POST"
        String description "Logs user activity to Activity Log microservice"
    }
    
    ExternalAPI_AuditLog {
        String url "http://localhost:3001/api/auditLog"
        String method "POST"
        String description "Logs audit events to Audit Log microservice"
    }
    
    %% Relationships to External APIs
    User ..> ExternalAPI_ActivityLog : "logs activity"
    User ..> ExternalAPI_AuditLog : "logs audit events"
```

## Entity Relationships Summary

### Core User Management
- **Person** → **User** (One-to-Many): A person can have multiple user accounts
- **User** → **AuditLogging** (One-to-Many): Users create audit log entries

### Product Catalog
- **Category** → **Category** (Self-referential): Hierarchical category structure
- **Category** → **Item** (One-to-Many): Categories contain multiple items
- **Vendor** → **Item** (One-to-Many): Vendors supply multiple items

### Shopping Experience
- **Item** → **CartItem** (One-to-Many): Items can be in multiple carts
- **Item** → **WishlistItem** (One-to-Many): Items can be in multiple wishlists
- **Item** → **OrderItem** (One-to-Many): Items appear in multiple orders
- **Item** → **Purchase** (One-to-Many): Items can be purchased multiple times

### Order Management
- **Order** → **OrderItem** (One-to-Many): Orders contain multiple items
- **Order** → **Transaction** (One-to-One): Each order has one transaction
- **Order** → **Installment** (One-to-Many): Orders can have multiple installments
- **Order** → **ApprovalWorkflow** (Many-to-One): Orders use approval workflows
- **Order** → **OrderApproval** (One-to-Many): Orders require multiple approvals

### Approval System
- **ApprovalWorkflow** → **WorkflowApprovalLevel** (One-to-Many): Workflows have multiple levels
- **ApprovalLevel** → **WorkflowApprovalLevel** (One-to-Many): Levels used in workflows
- **Order** → **OrderApproval** (One-to-Many): Orders track approval status

### External API Integration
- **User** → **ExternalAPI_ActivityLog**: Activity logging service
- **User** → **ExternalAPI_AuditLog**: Audit logging service

## Enums

- **ItemType**: PRODUCT, LOAN
- **ItemStatus**: PENDING, APPROVED, REJECTED
- **OrderStatus**: PENDING_APPROVAL, APPROVED, REJECTED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURNED
- **PaymentMethod**: PAYROLL_DEDUCTION, CASH, CREDIT_CARD, DEBIT_CARD, BANK_TRANSFER, POINTS, MIXED, OTHER
- **PaymentStatus**: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED
- **PaymentType**: CASH, INSTALLMENT, POINTS, MIXED
- **TransactionType**: PURCHASE, INSTALLMENT, POINTS_REDEMPTION, REFUND, ADJUSTMENT
- **TransactionStatus**: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REVERSED
- **InstallmentStatus**: PENDING, SCHEDULED, DEDUCTED, FAILED, CANCELLED, REFUNDED
- **PurchaseType**: FULL_PAYMENT, PAYROLL_LOAN
- **PurchaseStatus**: PENDING, APPROVED, REJECTED, ACTIVE, COMPLETED, CANCELLED
- **ApproverRole**: MANAGER, HR, FINANCE, DEPARTMENT_HEAD, ADMIN
- **ApprovalStatus**: PENDING, APPROVED, REJECTED, EXPIRED, SKIPPED
- **Status** (User): active, inactive, suspended, archived
