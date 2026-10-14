# Thread&Co Architecture

Flow-only view of the whole project. Every box is one responsibility, arrows are data or control flow. Diagrams are Mermaid and render on GitHub and in VS Code.

Sections: 1 System map, 2 Backend pipeline, 3 Frontend runtime, 4 Auth and roles, 5 Password reset, 6 Checkout and order, 7 Catalog and variants, 8 Style assistant, 9 Photo search, 10 Size and companion engines, 11 Rate limiting, 12 Data model, 13 Build, test, deploy, 14 Flow breaks.

---

## 1. System map

```mermaid
flowchart LR
    subgraph BROWSER["Browser"]
        UI["Next.js pages and components"]
        LS[("localStorage<br/>token, user, role, cart,<br/>wishlist, chat, fit profile")]
        SS[("sessionStorage<br/>checkout address draft")]
        UI <--> LS
        UI <--> SS
    end

    subgraph VERCEL["Vercel project, one domain"]
        ROUTER{{"vercel.json rewrites"}}
        subgraph FE["frontend service, Next.js 16"]
            PAGES["App Router pages<br/>storefront, account, admin, lister"]
            UPLOAD["upload token handler"]
            SEO["sitemap and robots"]
        end
        subgraph BE["backend service, FastAPI"]
            API["7 routers<br/>auth, products, search, orders,<br/>chat, users, contact"]
            SVC["services<br/>auth, variants, sizing, companions,<br/>chat, chat tools, visual search, email"]
            API --> SVC
        end
    end

    subgraph DATA["Data"]
        MONGO[("MongoDB Atlas<br/>users, products, orders, audit_log")]
        REDIS[("Upstash Redis<br/>shared rate-limit counters")]
        BLOB[("Vercel Blob<br/>product images")]
    end

    subgraph EXT["External services"]
        GROQ["Groq<br/>text model, vision model"]
        RESEND["Resend<br/>transactional email"]
        SENTRY["Sentry<br/>error tracking"]
        VA["Vercel Analytics"]
    end

    UI -- "page requests" --> ROUTER
    UI -- "fetch /api/..." --> ROUTER
    ROUTER -- "everything except /api" --> FE
    ROUTER -- "/api/* with prefix stripped" --> BE
    UI -- "direct upload with signed token" --> BLOB
    UPLOAD -- "verify role via /auth/me" --> API
    UPLOAD -- "issue client token" --> BLOB
    SVC <--> MONGO
    API <--> REDIS
    SVC -- "chat and photo prompts" --> GROQ
    SVC -- "order, reset, contact mail" --> RESEND
    BE -. "exceptions" .-> SENTRY
    UI -. "pageviews" .-> VA
```

---

## 2. Backend request pipeline

```mermaid
flowchart TD
    REQ["Incoming request"] --> LIFE["App lifespan<br/>connect Mongo, create unique<br/>idempotency index, close on exit"]
    REQ --> MW1["SlowAPI middleware"]
    MW1 --> MW2["CORS middleware<br/>dev origins plus ALLOWED_ORIGINS"]
    MW2 --> ROUTE{"Router match"}
    ROUTE --> LIMIT["Rate-limit decorator<br/>key = client identity"]
    LIMIT -- "over limit" --> R429["429 + Retry-After<br/>human message"]
    LIMIT --> VALID["Pydantic model validation"]
    VALID -- "invalid" --> R422["422 field errors"]
    VALID --> AUTHQ{"Protected route?"}
    AUTHQ -- "no" --> HANDLER
    AUTHQ -- "yes" --> JWT["Decode bearer JWT"]
    JWT -- "bad or expired" --> R401["401"]
    JWT --> PURP{"purpose is access<br/>or legacy none?"}
    PURP -- "reset token" --> R401
    PURP --> USERDB["Read user from Mongo<br/>role and is_blocked are never trusted from token"]
    USERDB -- "missing" --> R401
    USERDB -- "blocked" --> R403["403"]
    USERDB --> ROLE{"Role gate<br/>admin, or admin and lister"}
    ROLE -- "denied" --> R403
    ROLE --> HANDLER["Route handler"]
    HANDLER --> SVC["Service layer"]
    SVC <--> DB[("MongoDB")]
    HANDLER --> BG["Background tasks<br/>send email after response"]
    HANDLER --> RESP["Pydantic response model<br/>ObjectId to id string"]
    HANDLER -. "unhandled error" .-> SENTRY["Sentry, 10 percent traces"]
```

---

## 3. Frontend runtime

```mermaid
flowchart TD
    subgraph SHELL["Root layout wraps every page"]
        HDR["Site header<br/>nav, cart badge, account link"]
        TRANS["Page transition and<br/>shared-element morph"]
        DRAWER["Cart drawer"]
        ASSIST["Style assistant widget"]
        ANA["Analytics"]
    end

    subgraph STORES["Client stores, useSyncExternalStore"]
        AUTH["auth store<br/>token, user, role"]
        SHOP["shop store<br/>cart, wishlist"]
        UIS["ui store<br/>drawer open, announcements"]
        FIT["fit profile"]
        PCACHE["product cache in memory"]
    end

    EVENT(("storage sync event"))
    AUTH --- EVENT
    SHOP --- EVENT
    EVENT -- "re-render subscribers<br/>across components and tabs" --> SHELL

    subgraph STORE_PAGES["Storefront pages"]
        HOME["Home"]
        SHOP_P["Shop<br/>search, filters, photo search"]
        PDP["Product page"]
        LOOK["Lookbook"]
        STATIC["About, policies, contact"]
    end
    subgraph ACCOUNT["Customer pages"]
        LOGIN["Login, register, forgot, reset"]
        CART_P["Cart"]
        CHK["Checkout then payment"]
        ORD["Order detail and account"]
    end
    subgraph STAFF["Staff pages"]
        ADMIN["Admin dashboard<br/>overview, products, orders, users, audit"]
        LISTER["Lister console<br/>product manager only"]
    end

    PDP --> PARTS["Product page parts<br/>image, size selector, colour selector,<br/>find my size, variant stock, complete the look"]
    HOME --> PCACHE
    SHOP_P --> PCACHE
    PCACHE --> PDP
    PARTS --> SHOP
    CART_P --> SHOP
    LOGIN --> AUTH
    ADMIN --> AUTH
    LISTER --> AUTH

    STORE_PAGES -- "fetch" --> APIB["API base<br/>NEXT_PUBLIC_API_URL or /api"]
    ACCOUNT -- "fetch with bearer token" --> APIB
    STAFF -- "fetch with bearer token" --> APIB
    ASSIST -- "chat" --> APIB
    APIB --> BACKEND["FastAPI"]
    BACKEND -- "401 clears stored login" --> AUTH
    BACKEND -- "429 becomes readable message" --> MSG["rate-limit message helper"]
```

---

## 4. Auth and roles

```mermaid
flowchart TD
    START["Visitor"] --> REG["Register<br/>5 per minute per IP"]
    START --> LOG["Login<br/>10 per minute per IP"]
    REG --> DUP{"Email exists?"}
    DUP -- "yes" --> E400["400"]
    DUP -- "no" --> HASH["bcrypt hash, role = customer"]
    LOG --> FIND["Find user, bcrypt verify"]
    FIND -- "wrong" --> E401["401 same message<br/>for unknown email or bad password"]
    FIND --> BLK{"Blocked?<br/>checked only after password passes"}
    BLK -- "yes" --> E403["403 blocked"]
    BLK -- "no" --> TOK
    HASH --> TOK["Sign JWT, HS256, 30 min<br/>claims user_id, email, role, purpose=access"]
    TOK --> STORE["Browser stores token, name, role"]
    STORE --> USE["Every protected call sends Bearer token"]
    USE --> LIVE["Server re-reads role and block flag from DB<br/>so changes apply immediately"]

    LIVE --> ROLES{"Role"}
    ROLES -- "customer" --> C["Place orders<br/>view own orders"]
    ROLES -- "lister" --> L["Create, edit, delete products<br/>upload images"]
    ROLES -- "admin" --> A["Everything a lister can do<br/>plus all orders and status changes<br/>plus users, roles, blocks, audit log"]

    A --> SELF["Cannot change own role<br/>or block self"]
    A --> AUD["Audit entry written first,<br/>then the change is applied"]
    STORE -. "role in browser is UX only" .-> UXGATE["Hides or shows UI<br/>real check stays on server"]
```

---

## 5. Password reset

```mermaid
flowchart TD
    F1["Forgot-password form"] --> F2["POST forgot-password<br/>5 per minute per IP"]
    F2 --> F3{"Account exists?"}
    F3 -- "no" --> SAME["Return the same 202 message"]
    F3 -- "yes" --> F4["Atomic cooldown claim in Mongo<br/>one update matches only if last request older than 60 s"]
    F4 -- "claim lost" --> SAME
    F4 -- "claim won" --> F5["Sign reset JWT, 15 min<br/>purpose=password_reset,<br/>pwd_fp = digest of current hash"]
    F5 --> F6["Link = FRONTEND_URL/reset-password?token"]
    F6 --> F7["Resend email as background task"]
    F7 --> SAME
    F7 --> R1["User opens link"]
    R1 --> R2["POST reset-password, 10 per minute per IP"]
    R2 --> R3{"Token valid,<br/>purpose is reset?"}
    R3 -- "no" --> BAD["400 invalid or expired"]
    R3 -- "yes" --> R4{"Fingerprint still matches<br/>current password hash?"}
    R4 -- "no, already used or changed" --> BAD
    R4 -- "yes" --> R5["Conditional update<br/>only if password is unchanged since the check"]
    R5 -- "race lost" --> BAD
    R5 -- "won" --> OK["Password replaced<br/>token is now dead by construction"]
    ACCESS["Access-token check rejects reset tokens"] -.-> R3
```

---

## 6. Checkout and order

```mermaid
flowchart TD
    ADD["Add to bag on product page"] --> CARTLS[("cart in localStorage<br/>capped by variant stock, max 20")]
    CARTLS --> DRAW["Side drawer and cart page<br/>quantity, remove, pairs-well-with"]
    DRAW --> GO{"Logged in?"}
    GO -- "no" --> LOGIN["Login with next=/checkout<br/>next path sanitised, same-origin only"]
    LOGIN --> ADDR
    GO -- "yes" --> ADDR["Checkout: shipping address form"]
    ADDR --> DRAFT[("address draft in sessionStorage")]
    DRAFT --> PAY["Payment: dummy card form<br/>Luhn, expiry, CVC checks, nothing charged"]
    PAY --> KEY["Create one idempotency UUID per attempt"]
    KEY --> POST["POST orders with Idempotency-Key"]

    POST --> IDEM{"Same user and key<br/>already has an order?"}
    IDEM -- "yes" --> RET["Return the existing order"]
    IDEM -- "no" --> VAL["Validate product ids,<br/>size, colour, variant exists"]
    VAL -- "invalid" --> E4["400 or 404"]
    VAL --> MERGE["Merge duplicate lines by product, size, colour"]
    MERGE --> PRE{"Stock precheck passes?"}
    PRE -- "no" --> E409["409 not enough stock"]
    PRE --> LEG["Persist synthesised variants<br/>for legacy products, guarded"]
    LEG --> DEC["Per variant atomic decrement<br/>filter requires stock at least qty"]
    DEC -- "a line fails" --> ROLL["Release every decrement already made"]
    ROLL --> E409
    DEC --> INS["Insert order, status placed,<br/>unique index on user and key"]
    INS -- "duplicate key race" --> REL2["Release this call's stock,<br/>return the winner's order"]
    INS -- "db error" --> ROLL
    INS --> MAIL["Confirmation email as background task"]
    INS --> DONE["201 order"]
    DONE --> CLEAR["Clear cart and draft, go to order page"]

    ADMINST["Admin sets status<br/>placed, processing, shipped, delivered, cancelled"] --> CANC{"Becoming cancelled<br/>and not already?"}
    CANC -- "yes" --> GIVE["Return stock to each variant and product total"]
    CANC -- "no" --> SET["Just update status"]
    GIVE --> SET
```

---

## 7. Catalog and variants

```mermaid
flowchart TD
    STAFF["Admin or lister in product manager"] --> IMG["Pick image"]
    IMG --> TOKEN["Ask upload handler for a client token<br/>handler checks role via auth/me"]
    TOKEN --> BLOB[("Vercel Blob, images up to 5 MB")]
    BLOB --> URL["Public image URL"]
    STAFF --> FORM["Product form<br/>name, price, category, sizes, colours,<br/>variant grid, companions"]
    URL --> FORM
    FORM --> SAVE{"Create or update"}
    SAVE --> COMP["Validate companions<br/>exist, not self"]
    COMP --> BUILD["Build stored document"]
    BUILD --> HASVAR{"Variant grid given?"}
    HASVAR -- "yes" --> USEVAR["Use variants as given"]
    HASVAR -- "no" --> SPLIT["Spread total stock<br/>evenly over sizes x colours"]
    USEVAR --> DERIVE["Derive SKU per variant,<br/>sizes, colours, total stock"]
    SPLIT --> DERIVE
    DERIVE --> UPD{"Update that restates<br/>the same total?"}
    UPD -- "yes" --> KEEP["Keep each variant's real stock,<br/>new combos start at zero"]
    UPD -- "no" --> WRITE
    KEEP --> WRITE[("products collection")]
    WRITE --> READ["Any read passes through ensure_variants<br/>so unmigrated products still look current"]

    PUB["Public reads"] --> LIST["List by category, name order"]
    PUB --> ONE["One product"]
    PUB --> LOOKS["Looks: in-stock products with 2+ in-stock companions"]
    PUB --> COMPS["Companions of a product"]
    LIST --> READ
    ONE --> READ
    LOOKS --> READ
    COMPS --> READ
    DEL["Delete product"] --> WRITE
```

---

## 8. Style assistant

```mermaid
flowchart TD
    U["Shopper types in widget<br/>history kept in localStorage"] --> REQ["POST chat<br/>message, last 20 turns,<br/>current product id, fit profile"]
    REQ --> L1["Per-IP limit, minute and day"]
    L1 --> L2["Global burst limit"]
    L2 --> L3["Global sustained limit"]
    L3 -- "any exceeded" --> R429["429 with Retry-After"]
    L3 --> CTX["Build system prompt<br/>plain text only, no provider talk,<br/>recommend only tool-returned in-stock items,<br/>plus product and fit notes"]
    CTX --> ROUND["Call Groq text model<br/>tools offered"]
    ROUND --> CALLS{"Model asked for tools?"}
    CALLS -- "no" --> FINAL
    CALLS -- "yes" --> CAP["Keep at most 4 calls"]
    CAP --> EXEC["Execute each tool against Mongo"]
    EXEC --> T1["search products<br/>60 s bounded cache"]
    EXEC --> T2["variant availability<br/>states only, no raw counts"]
    EXEC --> T3["recommend size"]
    EXEC --> T4["companions<br/>stored first, rules fill gaps"]
    T1 --> COLLECT
    T2 --> COLLECT
    T3 --> COLLECT
    T4 --> COLLECT["Tool context collects product cards server-side"]
    COLLECT --> MORE{"Round limit of 2 reached?"}
    MORE -- "no" --> ROUND
    MORE -- "yes" --> LAST["Final call without tools<br/>forces a written answer"]
    LAST --> FINAL["Clean text<br/>strip code fences and labels"]
    FINAL --> OUT["Reply plus cards plus optional size recommendation"]
    OUT --> RENDER["Widget shows message and product cards"]

    ROUND -. "Groq 429" .-> BUSY["503 plus Retry-After"]
    ROUND -. "400, 404, 422 from provider" .-> NOTOOL["Retry once with no tools"]
    NOTOOL --> FINAL
    ROUND -. "other failure" .-> E502["502"]
```

---

## 9. Photo search

```mermaid
flowchart TD
    P1["Camera button or drag and drop"] --> P2["Downscale in browser<br/>longest edge 768, JPEG"]
    P2 --> P3["POST raw bytes to search/visual"]
    P3 --> G1["Per-IP limit, minute and day"]
    G1 --> V1{"Content type is<br/>jpeg, png or webp?"}
    V1 -- "no" --> E415["415"]
    V1 --> V2["Stream body, stop past 4 MB"]
    V2 -- "too big" --> E413["413"]
    V2 --> V3{"Magic bytes match<br/>claimed type?"}
    V3 -- "no" --> E415
    V3 --> G2["Spend global burst and sustained budget<br/>only now, so junk cannot drain it"]
    G2 -- "exhausted" --> E429["429"]
    G2 --> CAT["Read in-stock categories from Mongo"]
    CAT --> VIS["Groq vision model<br/>JSON only: category, colours, keywords<br/>image never stored or logged"]
    VIS --> PARSE{"Valid JSON in expected shape?"}
    PARSE -- "no" --> E422["422 could not read photo"]
    PARSE --> FILTER["Drop categories and colours the store does not use"]
    FILTER --> RANK["Score in-stock products<br/>category 3, colour 2, keyword 1<br/>best first, ties by name, top 8"]
    RANK --> OUT["Attributes plus ranked matches"]
    OUT --> UI["Shop page shows thumbnail, detected tags, results"]
    VIS -. "Groq 429" .-> E503["503 plus Retry-After"]
    VIS -. "provider error" .-> E502["502"]
```

---

## 10. Size and companion engines

```mermaid
flowchart LR
    subgraph SIZE["Size engine"]
        S0["Inputs: product, height, weight, fit"] --> S1{"Chart type by category"}
        S1 -- "shoes" --> S2["Return foot-length chart,<br/>no recommendation"]
        S1 -- "alpha or waist" --> S3["Weight chart row"]
        S3 --> S4["Alpha only: tall shifts up,<br/>short shifts down"]
        S4 --> S5["Fit shift<br/>snug -1, regular 0, relaxed +1"]
        S5 --> S6["Nearest size the product actually offers"]
        S6 --> S7{"Picked size in stock?"}
        S7 -- "no" --> S8["Nearest in-stock alternative"]
        S7 -- "yes" --> S9
        S8 --> S9["Confidence high or medium<br/>medium near a boundary or when snapped"]
        S9 --> S10["Result: size, stock flag, alternative, reason"]
    end

    subgraph COMP["Companion engine"]
        C0["Product to pair"] --> C1["Complementary categories<br/>tees to jeans, shoes, hoodies, etc."]
        C1 --> C2["In-stock candidates in those categories"]
        C2 --> C3["Colour harmony score<br/>shared 3, neutral 2, adjacent 1"]
        C3 --> C4["Sort by score then name, max 4"]
        C5["Stored companions, manual or generated"] --> C6["Stored first, rules fill the gaps"]
        C4 --> C6
    end

    SIZE --> USES1["Used by: product page find my size,<br/>size-guide endpoint, chat tool"]
    COMP --> USES2["Used by: complete the look,<br/>cart drawer, lookbook, chat tool,<br/>generate companions script"]
```

---

## 11. Rate limiting and resilience

```mermaid
flowchart TD
    R0["Request to a limited route"] --> K["Client identity"]
    K --> H{"TRUSTED_PROXY_HOPS above 0?"}
    H -- "no" --> PEER["TCP peer address<br/>behind a proxy this can be the proxy itself"]
    H -- "yes" --> XFF["Pick that many hops from the right<br/>of X-Forwarded-For"]
    PEER --> STORE
    XFF --> STORE{"Counter storage"}
    STORE -- "REDIS_URL set" --> RED[("Redis, shared by all instances")]
    STORE -- "not set" --> MEM["In-process memory<br/>global caps become per instance"]
    RED --> HIT{"Redis reachable?<br/>0.5 s timeout, no retries"}
    HIT -- "yes" --> DEC["Allow or 429"]
    HIT -- "no" --> FB["In-process fallback<br/>5 per minute ceiling"]
    MEM --> DEC
    FB --> DEC

    subgraph GLOBAL["Direct budget spend for photo search"]
        G1["consume_global"] --> G2{"Storage ok?"}
        G2 -- "yes" --> G3["Hit shared counter"]
        G2 -- "no" --> G4["Enforce BOTH the 5 per minute ceiling<br/>and the configured cap, in process"]
    end

    DEC --> LIMITS["Per route<br/>register 5, login 10, forgot 5, reset 10,<br/>contact 5, size recommendation 30 per minute<br/>chat and photo: per-IP plus two global windows"]
```

---

## 12. Data model

```mermaid
erDiagram
    USERS ||--o{ ORDERS : "places, by user_id"
    USERS ||--o{ AUDIT_LOG : "acts as actor_id"
    USERS ||--o{ AUDIT_LOG : "target of target_user_id"
    PRODUCTS ||--o{ ORDERS : "snapshotted into order items"
    PRODUCTS }o--o{ PRODUCTS : "companions, up to 4 ids"

    USERS {
        string name
        string email "lowercased, unique by lookup"
        string password "bcrypt hash"
        string role "customer, lister, admin"
        bool is_blocked
        datetime created_at
        datetime last_password_reset_request_at
    }
    PRODUCTS {
        string name
        string category
        float price
        float rating
        string image_url
        string description
        list sizes "derived from variants"
        list colors "derived from variants"
        int stock "derived total"
        list variants "embedded: sku, size, color, stock"
        list companions "product id strings"
        string companions_source "manual or generated"
    }
    ORDERS {
        string user_id
        list items "embedded: product_id, name, price, qty, subtotal, size, color"
        float total
        string status "placed to delivered or cancelled"
        object shipping_address "embedded"
        string idempotency_key "optional"
        datetime created_at
    }
    AUDIT_LOG {
        string actor_id
        string action "role_change or block_change"
        string target_user_id
        object details
        datetime created_at
    }
```

Index: unique partial index on orders by user_id and idempotency_key, only where the key exists.

---

## 13. Build, test, deploy

```mermaid
flowchart TD
    subgraph LOCAL["Local development"]
        D1["Next dev server<br/>reads .env.local"]
        D2["FastAPI via uvicorn<br/>reads backend .env"]
        D3[("Mongo: local instance for tests<br/>Atlas by default for dev")]
        D1 <--> D2
        D2 <--> D3
    end

    subgraph TESTS["Verification"]
        T1["pytest<br/>refuses to run unless Mongo is localhost,<br/>wipes collections between tests"]
        T2["vitest + Testing Library<br/>components, stores, helpers"]
        T3["eslint and tsc"]
        T4["Playwright pass on live site"]
    end

    subgraph OPS["Operational scripts"]
        O1["seed products"]
        O2["make admin"]
        O3["migrate user roles"]
        O4["migrate product variants"]
        O5["generate companions<br/>dry run, overwrite, optional LLM rank"]
    end

    O1 --> D3
    O2 --> D3
    O3 --> D3
    O4 --> D3
    O5 --> D3
    D1 --> T2
    D1 --> T3
    D2 --> T1

    GIT["git push to main"] --> BUILD["Vercel builds two services<br/>frontend: next build<br/>backend: FastAPI entrypoint app.main"]
    BUILD --> ENV["Production env vars<br/>Mongo, JWT secret, Groq, Resend, Sentry,<br/>Redis, proxy hops, frontend URL"]
    ENV --> LIVE["Live site<br/>env changes need a redeploy"]
    LIVE --> T4
    LIVE -. "runtime errors" .-> SENTRY["Sentry"]
    LIVE -. "web vitals" .-> VA["Vercel Analytics"]

    DOCS["PROGRESS.md and plan docs<br/>handover state"] -.-> GIT
```

---

## 14. Flow breaks to know about

```mermaid
flowchart TD
    B1["Admin or lister picks an image"] --> B2["Browser POSTs /blob-upload<br/>a non-/api path on purpose"]
    B2 --> B3{"vercel.json: every /api path goes to the backend,<br/>everything else to the frontend"}
    B3 --> B4["Next.js upload handler is reached<br/>and issues a Blob client token"]
    B5["Rule: frontend route handlers must never live under /api,<br/>FastAPI would answer 404 for them"] -.-> B3

    N1["Per-IP limits"] --> N2{"TRUSTED_PROXY_HOPS unset?"}
    N2 -- "yes" --> N3["Keyed by proxy peer address<br/>verify live, then set it"]

    N4["Resend sandbox sender"] --> N5["Delivers only to the Resend account owner<br/>until a domain is verified"]
```
