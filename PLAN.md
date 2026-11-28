# PLAN: Tổng hợp các vấn đề hiện hữu trong DiagramIO

Nguồn: [CLAUDE_PLAN.md](CLAUDE_PLAN.md), [CODEX_PLAN.md](CODEX_PLAN.md), [DEBATE.md](DEBATE.md) (bảng hợp nhất đã đồng thuận), [CLAUDE2.md](CLAUDE2.md) (rà soát cho mục tiêu 10.000+ user). Các điểm chính đã được đối chiếu lại với code tại HEAD `35503aa`.

Mức ưu tiên: **P0** = phải sửa trước khi có người dùng thật; **P1** = sửa trước khi tải tăng; **P2** = nên sửa; **Đo** = chỉ làm khi benchmark chứng minh cần.

---

## A. Bảo mật và cấu hình (P0)

- **A1. JWT secret có giá trị mặc định công khai** (P0)
	- Vị trí cần sửa: [application.yml:27](src/main/resources/application.yml#L27), [docker-compose.yml:37](docker-compose.yml#L37), `.env.example`, [JwtProperties.java](src/main/java/com/diagramio/infrastructure/security/JwtProperties.java)
	- Lý do cần sửa: quên đặt `JWT_SECRET` thì app vẫn chạy với chuỗi `dev-only-secret...` có trong repo, nên ai đọc repo cũng ký được JWT cho mọi user.
	- Sửa như nào: **Fail-fast configuration**: bỏ default, compose dùng `${JWT_SECRET:?required}`, `@Validated` + `@NotBlank` cho `JwtProperties` và từ chối chuỗi dev. Tách **Spring Profiles** (`dev`/`prod`). Về lâu dài thêm `iss`/`aud`/`kid` để **key rotation**.

- **A2. Mật khẩu DB mặc định, cổng 5432 publish, app dùng superuser** (P0)
	- Vị trí cần sửa: [docker-compose.yml](docker-compose.yml), [application.yml:8](src/main/resources/application.yml#L8)
	- Lý do cần sửa: DB lộ ra host với credential ai cũng biết; app có quyền DDL không cần thiết.
	- Sửa như nào: bỏ `ports` của postgres (dev bind `127.0.0.1`), **Principle of Least Privilege**: role runtime chỉ DML, role Flyway riêng (`spring.flyway.user/password`).

- **A3. Tài khoản mẫu `uet@gmail.com` có ở mọi môi trường** (P0)
	- Vị trí cần sửa: [V2__seed_sample_user.sql](src/main/resources/db/migration/V2__seed_sample_user.sql), README
	- Lý do cần sửa: tài khoản có mật khẩu công khai tồn tại sẵn trên production.
	- Sửa như nào: không sửa V2 (checksum Flyway) và không `DELETE` (cascade mất dữ liệu). Thêm **migration mới (forward-only migration)** ghi hash không khớp được và thu hồi refresh token của user đó; chuyển seed dev sang `db/dev` chỉ bật ở profile dev (`spring.flyway.locations`).

- **A4. Không giới hạn kích thước request body** (P0)
	- Vị trí cần sửa: [UpdateDiagramRequest.java](src/main/java/com/diagramio/api/diagram/dto/UpdateDiagramRequest.java), [DiagramData.java](src/main/java/com/diagramio/domain/diagram/DiagramData.java), cấu hình Jackson/ingress
	- Lý do cần sửa: Jackson dựng toàn bộ `JsonNode` trong heap **trước** khi `DiagramData.of` kiểm tra 2 MB. Vài request vài trăm MB (qua `/auth/*` công khai hoặc tài khoản đăng ký miễn phí) đủ làm OOM instance.
	- Sửa như nào: **Defense in depth**: `client_max_body_size` ở gateway, filter trả 413 (đếm byte cả body chunked), `StreamReadConstraints` (`maxDocumentLength`, `maxNestingDepth`) qua `Jackson2ObjectMapperBuilderCustomizer`.

- **A5. Không rate limit auth; BCrypt chiếm hết CPU** (P0)
	- Vị trí cần sửa: [SecurityConfig.java](src/main/java/com/diagramio/config/SecurityConfig.java), [BCryptPasswordHasher.java](src/main/java/com/diagramio/infrastructure/security/BCryptPasswordHasher.java), `/auth/login|register|refresh-token`
	- Lý do cần sửa: credential stuffing, và gửi login liên tục là cách DoS rẻ nhất (~100 ms CPU mỗi lần băm).
	- Sửa như nào: **Throttling / Rate Limiting** (nginx `limit_req` hoặc Bucket4j, theo IP + principal, trả 429 + `Retry-After`); **Bulkhead** bằng `Semaphore` giới hạn số phép băm đồng thời, hết slot thì 503.

- **A6. Mật khẩu > 72 byte UTF-8 gây 500** (P0, đã tái hiện)
	- Vị trí cần sửa: [RegisterRequest.java](src/main/java/com/diagramio/api/auth/dto/RegisterRequest.java), [ChangePasswordRequest.java](src/main/java/com/diagramio/api/user/dto/ChangePasswordRequest.java)
	- Lý do cần sửa: `@Size(max=72)` đếm ký tự; 50 ký tự có dấu = 74 byte, `BCryptPasswordEncoder.encode` ném `IllegalArgumentException` → 500.
	- Sửa như nào: **Custom Bean Validation constraint** `@MaxUtf8Bytes(72)` ở DTO, kèm kiểm tra trong domain (`PasswordPolicy`) để trả 400.

- **A7. Swagger công khai, chưa có CORS, tin `X-Forwarded-*` từ client** (P0 với profile Internet)
	- Vị trí cần sửa: [SecurityConfig.java](src/main/java/com/diagramio/config/SecurityConfig.java), [application.yml:18](src/main/resources/application.yml#L18)
	- Lý do cần sửa: lộ bề mặt API; frontend khác origin không gọi được; header forwarded giả làm sai `shareUrl`/`Location` và vượt rate limit theo IP.
	- Sửa như nào: tắt springdoc ở profile prod; `CorsConfigurationSource` với whitelist origin từ cấu hình; `forward-headers-strategy: native` + `server.tomcat.remoteip.internal-proxies` (**Trusted Proxy**), hoặc canonical base URL.

- **A8. Share token và PII lọt vào log/body lỗi** (P0)
	- Vị trí cần sửa: [GlobalExceptionHandler.java](src/main/java/com/diagramio/api/GlobalExceptionHandler.java), [ErrorResponse.java](src/main/java/com/diagramio/api/dto/ErrorResponse.java)
	- Lý do cần sửa: `path` và `log.error(request.getRequestURI())` chứa token của `/shares/{token}`; `handleDataIntegrity` log nguyên message driver (có thể chứa email).
	- Sửa như nào: **Log masking**: log theo route template, không log message driver; thêm **Correlation ID** (`X-Request-Id` vào MDC, trả về trong `traceId`).

- **A9. Share token lưu plaintext, nằm trong URL, không có hạn dùng** (cần quyết định hợp đồng)
	- Vị trí cần sửa: [DiagramShareEntity.java](src/main/java/com/diagramio/infrastructure/share/DiagramShareEntity.java), [ShareService.java](src/main/java/com/diagramio/domain/share/ShareService.java)
	- Lý do cần sửa: lộ backup DB là lộ mọi link edit/view; token xuất hiện trong access log, history, `Referer`.
	- Sửa như nào: lưu **SHA-256 digest** (như refresh token), chỉ trả token một lần; chuyển đổi theo **Expand → Backfill → Contract**. Trước mắt: `Referrer-Policy: no-referrer`, che token ở proxy.

---

## B. Đúng đắn và đồng thời (P0–P1)

- **B1. Race khi xoay vòng refresh token** (P0)
	- Vị trí cần sửa: [AuthService.java:74-84](src/main/java/com/diagramio/domain/auth/AuthService.java#L74-L84), [RefreshTokenRepository.java](src/main/java/com/diagramio/domain/auth/RefreshTokenRepository.java)
	- Lý do cần sửa: đọc → kiểm tra trong Java → `save(revoke())` không có điều kiện; 2 request đồng thời cùng token đều nhận cặp token mới, phá đảm bảo "dùng một lần".
	- Sửa như nào: **Atomic conditional update (compare-and-set)**: `revokeIfActive(hash, now)` = `UPDATE ... SET revoked=true WHERE token_hash=? AND revoked=false AND expires_at>?`, chỉ cấp token mới khi đúng 1 dòng. Sau này thêm `family_id` để **refresh token reuse detection**.

- **B2. Đổi mật khẩu không thu hồi phiên cũ** (P1)
	- Vị trí cần sửa: [UserService.java:24-30](src/main/java/com/diagramio/domain/user/UserService.java#L24-L30)
	- Lý do cần sửa: refresh token bị trộm vẫn giữ phiên tới 7 ngày và gia hạn được vô hạn.
	- Sửa như nào: trong `TransactionRunner` cập nhật hash có điều kiện + `UPDATE refresh_tokens SET revoked=true WHERE user_id=?`; tùy chọn **credential revision / token_version** trong claim.

- **B3. `isPublic` là `boolean` nguyên thủy** (P1)
	- Vị trí cần sửa: [UpdateDiagramRequest.java:17](src/main/java/com/diagramio/api/diagram/dto/UpdateDiagramRequest.java#L17), [DiagramService.updateDiagram](src/main/java/com/diagramio/domain/diagram/DiagramService.java)
	- Lý do cần sửa: owner gửi PUT thiếu trường → Jackson gán `false` → sơ đồ public lặng lẽ thành private.
	- Sửa như nào: đổi sang `Boolean`, **"absent means preserve"** (null giữ giá trị cũ) hoặc bắt buộc + 400; cập nhật OpenAPI và test.

- **B4. Thu hồi/hạ quyền link không chặn thao tác ghi đang chạy** (P1)
	- Vị trí cần sửa: [ShareTokenAuthenticationFilter.java](src/main/java/com/diagramio/infrastructure/security/ShareTokenAuthenticationFilter.java), [Caller.java](src/main/java/com/diagramio/domain/access/Caller.java), `DiagramVersionService`, `DiagramService.updateDiagram`
	- Lý do cần sửa: role được resolve ở filter; request `restore` đang chờ row lock vẫn mang role `edit` cũ, trái yêu cầu "vô hiệu hóa ngay khi thu hồi".
	- Sửa như nào: `Caller` mang thêm `shareId`; với ghi qua link, trong transaction đọc lại share bằng `SELECT ... FOR SHARE` (**pessimistic locking**, thứ tự khóa cố định diagram → share để tránh deadlock). Owner ghi giữ nguyên.

- **B5. Khóa dòng được lấy trước khi kiểm quyền** (P1)
	- Vị trí cần sửa: [DiagramVersionService.java:63-64,79-80](src/main/java/com/diagramio/domain/version/DiagramVersionService.java#L63-L80)
	- Lý do cần sửa: user không có quyền vẫn `SELECT ... FOR UPDATE` được sơ đồ public của người khác, làm owner phải chờ.
	- Sửa như nào: **check → lock → re-check**: kiểm quyền bằng projection nhẹ trước, rồi khóa, rồi kiểm lại.

- **B6. Restore không idempotent** (P1)
	- Vị trí cần sửa: [DiagramVersionController.java](src/main/java/com/diagramio/api/version/DiagramVersionController.java), `DiagramVersionService.restore`
	- Lý do cần sửa: client retry sau khi mất response tạo thêm backup và restore lần nữa, có thể đè edit xen giữa.
	- Sửa như nào: thêm `expectedVersion` tùy chọn (**optimistic concurrency** như `createVersion`); nếu client tự retry thì thêm **Idempotency Key**.

- **B7. Dịch lỗi DB quá rộng** (P1)
	- Vị trí cần sửa: `GlobalExceptionHandler.handleDataIntegrity`, [DiagramVersionRepositoryAdapter.java](src/main/java/com/diagramio/infrastructure/version/DiagramVersionRepositoryAdapter.java)
	- Lý do cần sửa: mọi `DataIntegrityViolationException` thành 409 "please retry"; lỗi FK nội bộ bị che và client retry mãi.
	- Sửa như nào: **Exception translation** theo tên constraint đã biết → 409; còn lại 500 + giám sát.

---

## C. Hiệu năng đường dữ liệu (P1)

- **C1. Danh sách sơ đồ đọc cả cột `data`, tới 4 câu SQL, không ORDER BY** (P1)
	- Vị trí cần sửa: [DiagramRepositoryAdapter.java:46-67](src/main/java/com/diagramio/infrastructure/diagram/DiagramRepositoryAdapter.java#L46-L67), [DiagramRepository.java](src/main/java/com/diagramio/domain/diagram/DiagramRepository.java), [DiagramController.java](src/main/java/com/diagramio/api/diagram/DiagramController.java), `DiagramService.getDiagramsByOwner/count...`
	- Lý do cần sửa: trang 100 sơ đồ × 2 MB = 200 MB vào heap rồi bỏ; đếm tổng bằng truy vấn riêng; thiếu sort nên trang có thể trùng/sót. `/public` ẩn danh nên rẻ để lạm dụng.
	- Sửa như nào: **DTO/Interface Projection** chỉ lấy metadata; domain trả `PageResult<T>(items, total)` một lần; sort `updated_at DESC, id DESC`; **keyset pagination** cho `/public`.

- **C2. Danh sách phiên bản đọc mọi snapshot kèm `data`, không phân trang** (P1)
	- Vị trí cần sửa: [DiagramVersionJpaRepository.java](src/main/java/com/diagramio/infrastructure/version/DiagramVersionJpaRepository.java), [DiagramVersionRepositoryAdapter.java:48-52](src/main/java/com/diagramio/infrastructure/version/DiagramVersionRepositoryAdapter.java#L48-L52)
	- Lý do cần sửa: 500 phiên bản × 2 MB ≈ 1 GB cho một request, tăng thêm sau mỗi restore.
	- Sửa như nào: **Projection** không có `data`; phân trang opt-in theo `version_number` (giữ hành vi cũ mặc định).

- **C3. `DiagramAccess.require` luôn đọc nguyên sơ đồ** (P1)
	- Vị trí cần sửa: [DiagramAccess.java:32](src/main/java/com/diagramio/domain/access/DiagramAccess.java#L32), `ShareService`, `DiagramVersionService`, `deleteDiagram`
	- Lý do cần sửa: list versions, shares, delete chỉ cần `ownerId/isPublic` nhưng vẫn kéo 2 MB.
	- Sửa như nào: thêm `DiagramRepository.findAccessInfo(id)` trả record `(id, ownerId, isPublic, version)` (**Read Model / lightweight projection**); service nào cần nội dung thì đọc riêng. Vẫn giữ quy tắc chỉ kiểm quyền qua `DiagramAccess.require`.

- **C4. Thiếu index** (P1)
	- Vị trí cần sửa: [V1__create_tables.sql](src/main/resources/db/migration/V1__create_tables.sql) → migration mới `V4`
	- Lý do cần sửa: `diagram_shares(diagram_id)` (FK, cascade xóa) quét toàn bảng; sort theo `updated_at` và lọc `is_public` không có index.
	- Sửa như nào: `diagram_shares(diagram_id)`, `diagrams(owner_id, updated_at DESC, id)`, **partial index** `WHERE is_public`, `refresh_tokens(expires_at)`; bảng lớn dùng `CREATE INDEX CONCURRENTLY`; kiểm bằng `EXPLAIN (ANALYZE, BUFFERS)`.

- **C5. Không có back-pressure ở DB** (P1)
	- Vị trí cần sửa: [application.yml](src/main/resources/application.yml) (Hikari mặc định), `GlobalExceptionHandler`
	- Lý do cần sửa: 200 thread Tomcat tranh 10 connection, chờ 30 s rồi 500; client retry làm quá tải thêm. Không có `lock_timeout`/`statement_timeout`.
	- Sửa như nào: **Back-pressure / Fail fast**: pool nhỏ theo ngân sách (`replica × pool + migration ≤ max_connections`), `connection-timeout` 2–5 s, timeout qua `connection-init-sql`; lỗi lấy kết nối, `55P03`, `57014` → 503 + `Retry-After`. Flyway dùng kết nối riêng.

- **C6. Không nén response, không HTTP caching** (Đo, rẻ nên thử sớm)
	- Vị trí cần sửa: [application.yml](src/main/resources/application.yml), `DiagramController.getDiagram`
	- Lý do cần sửa: sơ đồ 2 MB truyền nguyên văn mỗi lần mở lại.
	- Sửa như nào: `server.compression` hoặc gzip ở gateway; **ETag / Conditional GET** `W/"{id}-{version}"` → 304 (vẫn kiểm quyền trước).

- **C7. Dữ liệu tăng không giới hạn: `refresh_tokens`, snapshot, quota** (P1)
	- Vị trí cần sửa: `AuthService.issueTokens`, `DiagramVersionService.snapshot`, [V3__create_refresh_tokens.sql](src/main/resources/db/migration/V3__create_refresh_tokens.sql)
	- Lý do cần sửa: mỗi login/refresh thêm một dòng không bao giờ dọn; mỗi snapshot là bản sao đầy đủ; link edit ẩn danh spam được version.
	- Sửa như nào: **Scheduled batch cleanup** (`@Scheduled` + **ShedLock** khi nhiều instance); quota theo owner/share; bỏ snapshot trùng bằng `content_hash`.

---

## D. Kiến trúc và mô hình domain (P1–P2)

- **D1. `Diagram` có setter công khai cho mọi trường** (P1)
	- Vị trí cần sửa: [Diagram.java:67-85](src/main/java/com/diagramio/domain/diagram/Diagram.java#L67-L85), `DiagramService.createDiagram` (nhận cả aggregate từ controller)
	- Lý do cần sửa: code bất kỳ đổi được `ownerId`, `version`; bất biến "sơ đồ mới private, rỗng" chỉ được giữ nhờ service.
	- Sửa như nào: **Rich Domain Model / Aggregate** với **Static Factory Method** `Diagram.create(title, type, ownerId, clock)` và method nghiệp vụ (`rename`, `publish`/`unpublish`); constructor đầy đủ chỉ cho mapper (**reconstitution**). Bỏ setter.

- **D2. Thời gian không thống nhất (`Instant.now()` vs `Clock`)** (P2)
	- Vị trí cần sửa: `DiagramService` (`createDiagram`, `updateDiagram`), `ShareService`, `DiagramShare`
	- Lý do cần sửa: test khó cố định thời gian; `AuthService`/`DiagramVersionService` đã dùng `Clock`.
	- Sửa như nào: **Dependency Injection** `Clock` (bean đã có trong `AuthConfig`) cho mọi service.

- **D3. Domain không tự kiểm tra `title`** (P2)
	- Vị trí cần sửa: `DiagramService.createDiagram/updateDiagram`
	- Lý do cần sửa: chỉ DTO kiểm tra; lối vào khác sẽ để DB ném lỗi → 409/500 khó hiểu.
	- Sửa như nào: **Value Object** `DiagramTitle` (không rỗng, ≤ 255), giống cách làm `DiagramData`.

- **D4. `lockDiagram` đặt sai module** (P2)
	- Vị trí cần sửa: [DiagramVersionRepository.java](src/main/java/com/diagramio/domain/version/DiagramVersionRepository.java), [DiagramVersionJpaRepository.java](src/main/java/com/diagramio/infrastructure/version/DiagramVersionJpaRepository.java)
	- Lý do cần sửa: repository của version lại khóa bảng `diagrams`; trách nhiệm bị lẫn.
	- Sửa như nào: **Single Responsibility / Repository per Aggregate**: chuyển sang `DiagramRepository.lockForUpdate(id)` (có thể trả luôn `Diagram`).

- **D5. Mỗi service tự `new DiagramAccess(repository)`** (P2)
	- Vị trí cần sửa: `DiagramService`, `ShareService`, `DiagramVersionService`, [config/](src/main/java/com/diagramio/config/)
	- Lý do cần sửa: không thay hoặc bọc được (ví dụ thêm cache tra quyền), test khó mock.
	- Sửa như nào: đăng ký `DiagramAccess` là `@Bean` trong `config` và inject (**Dependency Injection**, mở đường cho **Decorator**).

- **D6. Domain phụ thuộc Jackson mà không được ghi nhận** (P2)
	- Vị trí cần sửa: [DiagramData.java](src/main/java/com/diagramio/domain/diagram/DiagramData.java), [ArchitectureTest.java](src/test/java/com/diagramio/ArchitectureTest.java), [AGENTS.md](AGENTS.md)
	- Lý do cần sửa: `DiagramData` import `ObjectMapper`; ArchitectureTest xanh chỉ vì không cấm `com.fasterxml..`, trái quy tắc "domain là Java thuần".
	- Sửa như nào: ghi rõ ngoại lệ trong AGENTS.md + ArchUnit rule tường minh, hoặc đưa parse ra adapter qua một **Port** (`DiagramJsonParser`) theo **Hexagonal Architecture**. Giữ `DiagramData.of(String)` làm cổng invariant duy nhất (không thêm `of(JsonNode)`).

---

## E. Hợp đồng API và tài liệu (P1–P2)

- **E1. OpenAPI lệch với code** (P1)
	- Vị trí cần sửa: [docs/openapi.yaml](docs/openapi.yaml) (~dòng 1262), [OpenApiConfig.java](src/main/java/com/diagramio/config/OpenApiConfig.java)
	- Lý do cần sửa: `UpdateDiagramRequest.title` thiếu trong `required`; global `security` khiến SDK bắt khách đăng nhập khi `GET /diagrams/{id}` public.
	- Sửa như nào: sửa annotation (`@SecurityRequirements` rỗng/anonymous cho GET public), xuất lại spec; **Contract testing** trong CI (`git diff --exit-code`).

- **E2. `ErrorResponse` thiếu mã lỗi máy đọc được** (P2)
	- Vị trí cần sửa: [ErrorResponse.java](src/main/java/com/diagramio/api/dto/ErrorResponse.java)
	- Lý do cần sửa: client phải parse chuỗi `message`.
	- Sửa như nào: thêm `code`, `errors[]`, `traceId`, hoặc chuyển sang **RFC 9457 Problem Details** (`ProblemDetail` của Spring).

- **E3. Thư viện dotenv có trong jar production** (P2)
	- Vị trí cần sửa: [pom.xml](pom.xml) (`springboot3-dotenv`)
	- Lý do cần sửa: app đọc `.env` ở thư mục chạy trên server, khó đoán.
	- Sửa như nào: chỉ bật ở profile dev (Maven profile hoặc `spring.config.import=optional:file:.env[.properties]` trong `application-dev.yml`).

---

## F. Vận hành và mở rộng (P1)

- **F1. Không có metrics, không đo được nút thắt** (P1, làm trước mọi tối ưu)
	- Vị trí cần sửa: [pom.xml](pom.xml), [application.yml](src/main/resources/application.yml), README mục 6 (benchmark)
	- Lý do cần sửa: baseline 747 RPS đo với Locust chung máy, sơ đồ rỗng, không think time, không có metrics nội bộ; mọi quyết định cache/replica chỉ là đoán.
	- Sửa như nào: **Observability**: Actuator + Micrometer Prometheus ở management port riêng, `pg_stat_statements`, OpenTelemetry; benchmark lại với payload 200 KB–2 MB, Locust máy riêng. Nguyên tắc **Measure before optimize**.

- **F2. Compose không scale được, không có load balancer** (P1)
	- Vị trí cần sửa: [docker-compose.yml:27,39](docker-compose.yml#L27) (`container_name` và port cố định), README mục 7
	- Lý do cần sửa: lệnh `--scale app=3` trong README không chạy được; một instance là SPOF.
	- Sửa như nào: **Gateway Offloading** (≥ 2 nginx/LB làm TLS, body limit, gzip, rate limit) trước nhiều instance; bỏ `container_name`/`ports` của app. App đã **stateless** (JWT) nên scale ngang được.

- **F3. PostgreSQL là SPOF, không backup** (P1)
	- Vị trí cần sửa: [docker-compose.yml](docker-compose.yml) (chỉ có volume `postgres_data`)
	- Lý do cần sửa: mất máy là mất toàn bộ sơ đồ và lịch sử.
	- Sửa như nào: managed Postgres hoặc **WAL archiving + PITR** (pgBackRest/WAL-G) + 1 standby; diễn tập khôi phục, ghi RPO/RTO. Lưu ý khôi phục có thể kích hoạt lại token/link đã thu hồi sau mốc phục hồi.

- **F4. Health check gộp liveness/readiness, không timeout** (P2)
	- Vị trí cần sửa: [JdbcDatabaseHealth.java:18-25](src/main/java/com/diagramio/infrastructure/JdbcDatabaseHealth.java#L18-L25), [HealthController.java](src/main/java/com/diagramio/api/HealthController.java)
	- Lý do cần sửa: DB chậm thì health treo; dùng làm liveness sẽ restart app hàng loạt khi DB gặp sự cố.
	- Sửa như nào: **Health Endpoint Monitoring**: `setQueryTimeout(1)`; tách liveness/readiness qua Actuator khi có LB dùng probe; giữ `/api/v1/health` theo đặc tả.

- **F5. Docker image chưa cấu hình JVM theo container** (P2)
	- Vị trí cần sửa: [Dockerfile:24](Dockerfile#L24)
	- Lý do cần sửa: heap không theo `mem_limit`; build bằng `mvn` của image thay vì `./mvnw`; không `ExitOnOutOfMemoryError`.
	- Sửa như nào: `JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"`, **layered jar**, pin digest base image, giới hạn CPU/RAM trong compose.

- **F6. Không có CI** (P1)
	- Vị trí cần sửa: gốc repo (thiếu `.github/workflows`)
	- Lý do cần sửa: 452 test và ArchitectureTest chỉ chạy khi có người nhớ chạy.
	- Sửa như nào: **Continuous Integration** GitHub Actions `./mvnw -B verify` (Testcontainers), diff OpenAPI, quét dependency/image (Dependabot, trivy), bắt buộc CI xanh trước khi merge.

---

## G. Giả thuyết hiệu năng (chỉ làm khi F1 chứng minh cần)

- **G1. PUT đọc dòng 2 lần, parse JSON 2 lần**
	- Vị trí cần sửa: `DiagramService.updateDiagram`, [DiagramRepositoryAdapter.java:31-38](src/main/java/com/diagramio/infrastructure/diagram/DiagramRepositoryAdapter.java#L31-L38), [DiagramController.java:128-132](src/main/java/com/diagramio/api/diagram/DiagramController.java#L128-L132)
	- Lý do cần sửa: `access.require` đọc 2 MB, `saveAndFlush` merge entity detached đọc thêm lần nữa; `JsonNode.toString()` rồi parse lại. Autosave là đường nóng nhất.
	- Sửa như nào: **Conditional UPDATE (optimistic locking thủ công)** `UPDATE ... SET version=version+1 WHERE id=? AND version=?`, 0 dòng → 409. Phải giữ nguyên semantics `@Version` và có test stale/concurrent update.

- **G2. Snapshot/restore cho `data` đi qua app khi đang giữ `FOR UPDATE`**
	- Vị trí cần sửa: `DiagramVersionService.snapshot/restore`
	- Lý do cần sửa: thời gian giữ khóa tỉ lệ với kích thước data.
	- Sửa như nào: sao chép ngay trong DB bằng `INSERT ... SELECT ... RETURNING` và `UPDATE ... FROM ... RETURNING`, vẫn trong `TransactionRunner` + row lock.

- **G3. Cache, read replica, PgBouncer**
	- Vị trí cần sửa: adapter đọc `GET /diagrams/{id}` public, `/diagrams/public`
	- Lý do cần sửa: chỉ khi primary bão hòa vì đọc sau khi đã làm C1–C3.
	- Sửa như nào: micro-cache nginx 1–5 s cho `/public`, rồi **Cache-Aside** (Redis, invalidate sau commit ở adapter); **Read Replica** với route tường minh. Không cache tra share token. Giữ **monolith** (không tách microservice vì sẽ phá transaction restore).

- **Đã loại qua phản biện**: Event Sourcing, CQRS kho đọc riêng, Sharding, Valet Key cho link chia sẻ, nén snapshot ở app (TOAST đã nén), băm giả cho email không tồn tại (`/register` đã lộ email). Chi tiết ở [CLAUDE2.md](CLAUDE2.md) mục 5.

---

## H. Frontend (đổi phạm vi, cần quyết định trước)

Pha 1 hiện **không** làm frontend ([README.md:23](README.md#L23), [AGENTS.md](AGENTS.md) mục Project Scope). Mục này là kế hoạch nếu nhóm quyết định thêm.

Thứ tự: H1 → H2, H3, H8 → H4 → H5, H6 → H7; H9 làm song song từ H2. Việc backend nên xong trước: E1 (spec đúng để sinh client), B3 (PUT thiếu `isPublic`), B1 (refresh đồng thời), A7/A9 (CORS, `shareUrl`, `Referrer-Policy`).

- **H1. Ghi nhận đổi phạm vi và cấu trúc repo** (cần quyết định)
	- Vị trí cần sửa: [AGENTS.md](AGENTS.md) (Project Scope, Tech Stack), [README.md:23](README.md#L23), [docs/luong-nghiep-vu.md:115](docs/luong-nghiep-vu.md#L115)
	- Lý do cần sửa: tài liệu đang ghi "không làm frontend/canvas"; AGENTS.md yêu cầu ghi rõ mọi quyết định đổi phạm vi. Cộng tác thời gian thực (WebSocket/CRDT) vẫn ngoài phạm vi.
	- Sửa như nào: cập nhật AGENTS.md và README; đặt frontend trong thư mục `web/` của cùng repo (**monorepo**) để hợp đồng API và client đổi cùng một PR.

- **H2. Khung dự án frontend**
	- Vị trí cần sửa: `web/` (mới)
	- Lý do cần sửa: sơ đồ là dữ liệu riêng tư, không cần SEO hay render phía server, nên một **SPA** là đủ và đơn giản nhất cho baseline.
	- Sửa như nào: React + TypeScript + Vite; React Router; TanStack Query cho dữ liệu từ server; Tailwind + shadcn/ui cho form và hộp thoại; ESLint + Prettier; Vitest + Testing Library cho unit test, Playwright cho e2e. Không dùng Next.js.

- **H3. Client API sinh từ OpenAPI**
	- Vị trí cần sửa: `web/src/api/` (mới), [docs/openapi.yaml](docs/openapi.yaml)
	- Lý do cần sửa: viết tay kiểu request/response sẽ lệch dần với backend; spec hiện còn lệch code (E1).
	- Sửa như nào: **Contract-first client**: `openapi-typescript` sinh kiểu từ `docs/openapi.yaml`, gọi bằng `openapi-fetch`; CI sinh lại và `git diff --exit-code` để bắt lệch hợp đồng.

- **H4. Đăng nhập và quản lý token**
	- Vị trí cần sửa: `web/src/auth/` (mới); backend chỉ đổi nếu chọn cookie
	- Lý do cần sửa: `/auth/login` và `/auth/refresh-token` trả `accessToken` và `refreshToken` trong JSON body. Token lưu `localStorage` sẽ bị đánh cắp nếu trang dính XSS. Nhiều request cùng gặp 401 sẽ gửi refresh đồng thời; sau khi sửa B1 chỉ một request thắng, các request còn lại bị đăng xuất oan.
	- Sửa như nào: access token giữ trong bộ nhớ; **single-flight refresh** (mọi request 401 chờ chung một lần refresh rồi thử lại một lần). Lâu dài: backend trả refresh token qua cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` (đổi hợp đồng, cần nhóm thống nhất).

- **H5. Canvas soạn sơ đồ UML/ERD**
	- Vị trí cần sửa: `web/src/editor/` (mới), [DiagramData.java](src/main/java/com/diagramio/domain/diagram/DiagramData.java) (chỉ đọc để đối chiếu)
	- Lý do cần sửa: backend chỉ kiểm tra `data` có mảng `nodes` và `edges` và ≤ 2 MB; hình dạng của từng node/edge chưa được định nghĩa ở đâu.
	- Sửa như nào: `@xyflow/react` (React Flow) vì dùng đúng mô hình `nodes/edges`; custom node cho UML class (tên, thuộc tính, phương thức) và ERD table (cột, PK/FK); kiểu cạnh cho quan hệ UML và cardinality ERD. Ghi schema của `node.data`/`edge.data` thành kiểu TypeScript và một mục trong `docs/`; kiểm tra kích thước JSON trước khi gửi để báo lỗi sớm thay vì chờ 400.

- **H6. Lưu sơ đồ và xử lý xung đột**
	- Vị trí cần sửa: `web/src/editor/` (mới), [UpdateDiagramRequest.java](src/main/java/com/diagramio/api/diagram/dto/UpdateDiagramRequest.java) (chỉ đọc)
	- Lý do cần sửa: `PUT /diagrams/{id}` dùng **optimistic locking** theo `version` và trả 409 khi cũ. Autosave là đường nóng nhất của backend (G1). Trước khi sửa B3, PUT thiếu `isPublic` sẽ biến sơ đồ public thành private.
	- Sửa như nào: autosave có debounce (vài giây) + nút lưu tay; luôn gửi đủ `title`, `diagramType`, `version`, `data`, `isPublic`; cập nhật `version` từ response; 409 → hộp thoại "sơ đồ đã bị sửa ở nơi khác", tải lại bản mới, không tự ghi đè.

- **H7. Màn hình chia sẻ, lịch sử phiên bản, sơ đồ công khai**
	- Vị trí cần sửa: `web/src/pages/` (mới), [DiagramShareController.java:115](src/main/java/com/diagramio/api/share/DiagramShareController.java#L115)
	- Lý do cần sửa: `shareUrl` đang trỏ thẳng tới API `/api/v1/shares/{token}` vì chưa có frontend; người nhận link sẽ thấy JSON chứ không thấy sơ đồ.
	- Sửa như nào: route frontend `/s/{token}` đọc token rồi gọi API với header `X-Share-Token`; backend tạo `shareUrl` từ **canonical base URL** cấu hình được (gộp với A7) thay vì địa chỉ request. Hộp thoại chia sẻ chỉ hiện cho owner; danh sách phiên bản và nút restore cho owner/editor; trang danh sách sơ đồ công khai. Ẩn nút theo quyền chỉ để tiện, backend vẫn là nơi kiểm quyền.

- **H8. Triển khai cùng origin**
	- Vị trí cần sửa: [docker-compose.yml](docker-compose.yml), `web/Dockerfile` và `web/nginx.conf` (mới), `web/vite.config.ts`
	- Lý do cần sửa: frontend khác origin thì cần CORS (A7); cùng origin thì không cần, và không phải mở API cho domain khác.
	- Sửa như nào: dev dùng `server.proxy` của Vite chuyển `/api` sang `localhost:8080`; prod thêm service nginx phục vụ `dist/` và **reverse proxy** `/api` sang app (cùng gateway với F2, A4, A5). Đặt header `Content-Security-Policy`, `Referrer-Policy: no-referrer` (A9), fallback SPA về `index.html`.

- **H9. CI và test cho frontend**
	- Vị trí cần sửa: [.github/workflows/ci.yml](.github/workflows/ci.yml)
	- Lý do cần sửa: CI hiện chỉ chạy backend.
	- Sửa như nào: thêm job `web` (lint, typecheck, Vitest, build, kiểm tra client sinh từ OpenAPI không lệch); Playwright e2e chạy trên compose cho các luồng chính: đăng nhập/refresh, tạo và lưu sơ đồ, 409 xung đột, mở link chia sẻ view/edit, link đã thu hồi, restore phiên bản.
