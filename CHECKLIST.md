# CHECKLIST: Các việc cần làm

Mỗi đầu việc ứng với một mục trong [PLAN.md](PLAN.md) (mã `A1`, `B3`...). Thứ tự trong file là thứ tự nên làm: **Giai đoạn 0 (P0)** → **Giai đoạn 1 (P1)** → **Giai đoạn 2 (P2)** → **Giai đoạn 3 (chỉ khi số đo yêu cầu)**.

Quy tắc chung cho mọi đầu việc (theo [AGENTS.md](AGENTS.md)):
- Schema đổi thì thêm migration mới `V<n>__<mo_ta>.sql`, không sửa V1–V3.
- Endpoint hoặc request/response đổi thì cập nhật annotation, xuất lại [docs/openapi.yaml](docs/openapi.yaml) và cập nhật README.
- Domain không import Spring/JPA; transaction đi qua `TransactionRunner`; kiểm quyền chỉ qua `DiagramAccess.require`.
- Mỗi việc có test cho cả nhánh thành công và nhánh bị từ chối; chạy `./mvnw test` (có ArchitectureTest) trước khi đánh dấu xong.

---

## Giai đoạn 0: an toàn để deploy (P0)

### F6. CI (làm đầu tiên để các việc sau đều được kiểm)
- [x] Tạo `.github/workflows/ci.yml` chạy trên `ubuntu-latest`, JDK 21 (Temurin), cache Maven.
- [x] Bước `./mvnw -B verify` (Testcontainers chạy được trên runner Ubuntu).
- [ ] Bật branch protection cho `main`: bắt buộc CI xanh và ít nhất 1 review trước khi merge.
- [x] Bật Dependabot cho Maven, Docker và GitHub Actions (`.github/dependabot.yml`).

### A1. JWT secret fail-fast
- [x] Xóa giá trị mặc định ở `application.yml:27`, chỉ để `${JWT_SECRET}`.
- [x] Sửa `docker-compose.yml:37` thành `${JWT_SECRET:?JWT_SECRET is required}`.
- [x] Để trống `JWT_SECRET=` trong `.env.example`, kèm lệnh sinh secret (`openssl rand -base64 48`).
- [x] Thêm `@Validated` và `@NotBlank` cho `JwtProperties`, kiểm tra độ dài ≥ 32 byte UTF-8.
- [x] Từ chối khởi động nếu secret trùng giá trị mặc định hoặc giá trị mẫu trong `.env.example` cũ.
- [x] Dùng `src/test/resources/jwt-test.properties` để test tích hợp có secret riêng.
- [x] Test: app từ chối secret thiếu, trống, quá ngắn hoặc giá trị mẫu cũ trước khi kết nối DB.
- [x] Cập nhật README phần chạy local.

### A2. DB credential, cổng và quyền
- [ ] Bỏ `ports: 5432:5432` khỏi service `postgres` trong compose (hoặc dev bind `127.0.0.1:5432:5432`).
- [ ] Đổi `POSTGRES_PASSWORD` thành bắt buộc (`:?`), bỏ `secretpassword` khỏi `application.yml:8` và compose.
- [ ] Tạo role runtime chỉ có quyền DML (SELECT/INSERT/UPDATE/DELETE) trên các bảng của app.
- [ ] Tạo role migration riêng, cấu hình `spring.flyway.user` / `spring.flyway.password`.
- [ ] Viết script init role (`docker-entrypoint-initdb.d`) và ghi cách đổi credential khi volume đã tồn tại.
- [ ] Kiểm tra: role runtime không chạy được `CREATE TABLE`; từ máy khác không kết nối được cổng 5432.

### A3. Vô hiệu hóa tài khoản mẫu
- [ ] Kiểm kê trên DB đang chạy: user `11111111-...` có sơ đồ, phiên bản, link nào không.
- [ ] Thêm migration `V4__disable_sample_user.sql`: ghi một `password_hash` không thể khớp và `UPDATE refresh_tokens SET revoked = true` cho user đó. Không `DELETE`.
- [ ] Tạo `src/main/resources/db/dev/R__seed_dev_user.sql` cho môi trường dev.
- [ ] Thêm `spring.flyway.locations=classpath:db/migration,classpath:db/dev` vào profile dev (cùng việc tách profile ở A7).
- [ ] Sửa các test đang dựa vào user mẫu: `RepositoryAdaptersTest`, `DiagramVersionConcurrencyTest`, `JpaRepositoriesIntegrationTest`.
- [ ] Test cài mới và test nâng cấp từ V3: login bằng `uet@gmail.com` trả 401, dữ liệu cũ vẫn còn.
- [ ] Bỏ thông tin đăng nhập mẫu khỏi README (dòng ~138, ~153).

### A4. Giới hạn kích thước body
- [ ] Thêm `Jackson2ObjectMapperBuilderCustomizer` trong `config` đặt `StreamReadConstraints` (`maxDocumentLength` ≈ 4 MB, `maxNestingDepth` hợp lý).
- [ ] Thêm filter chạy trước Spring Security: `Content-Length` > ngưỡng thì trả 413; bọc `InputStream` để đếm byte với body chunked.
- [ ] Map lỗi vượt giới hạn sang 413 với `ErrorResponse` thống nhất trong `GlobalExceptionHandler`.
- [ ] Ghi `client_max_body_size 3m` vào cấu hình gateway (làm cùng F2).
- [ ] Test: body 10 MB (có và không có `Content-Length`) trả 413 ở `/auth/register` và `PUT /diagrams/{id}`; body sát 2 MB hợp lệ vẫn qua.
- [ ] Thêm response 413 vào OpenAPI.

### A5. Rate limit auth và Bulkhead cho BCrypt
- [ ] Chọn cách làm: nginx `limit_req` ở gateway, cộng bộ đếm trong app (Bucket4j) theo IP và theo principal.
- [ ] Áp dụng cho `/api/v1/auth/login`, `/auth/register`, `/auth/refresh-token`.
- [ ] Trả 429 kèm header `Retry-After`, body theo `ErrorResponse`.
- [ ] Thêm `Semaphore` trong `BCryptPasswordHasher` (số permit ≈ số core), `tryAcquire` có timeout ngắn; hết slot thì ném exception domain và map sang 503 + `Retry-After`.
- [ ] Test: vượt ngưỡng nhận 429; khi semaphore đầy nhận 503; login hợp lệ dưới ngưỡng vẫn thành công.
- [ ] Ghi 429/503 vào OpenAPI của các endpoint auth.

### A6. Mật khẩu theo byte UTF-8
- [ ] Tạo constraint `@MaxUtf8Bytes(value)` và validator trong `com.diagramio.api`.
- [ ] Gắn `@MaxUtf8Bytes(72)` cho `RegisterRequest.password` và `ChangePasswordRequest.newPassword`.
- [ ] Thêm kiểm tra tương tự trong domain (`PasswordPolicy`) trước khi gọi `PasswordHasher.hash`, ném `InvalidInputException`.
- [ ] Test: mật khẩu 50 ký tự tiếng Việt (74 byte) trả 400 ở register và change-password; mật khẩu 72 byte ASCII vẫn đăng ký được.

### A7. Profile, Swagger, CORS, forwarded headers
- [ ] Tạo `application-dev.yml` và `application-prod.yml`; giá trị dev chỉ nằm trong profile dev.
- [ ] Profile prod: `springdoc.api-docs.enabled=false`, `springdoc.swagger-ui.enabled=false`.
- [ ] Cập nhật `SecurityConfig`: chỉ `permitAll` Swagger khi bật.
- [ ] Thêm `CorsConfigurationSource` đọc `app.cors.allowed-origins`; chỉ cho phép method và header cần thiết (`Authorization`, `X-Share-Token`, `Content-Type`), đặt `maxAge`.
- [ ] Đổi `forward-headers-strategy` sang `native` và đặt `server.tomcat.remoteip.internal-proxies` chỉ chứa IP proxy (hoặc dùng `app.public-base-url` để ghép `shareUrl`).
- [ ] Test: origin lạ bị chặn ở preflight; origin trong whitelist qua được; `X-Forwarded-Host` giả không làm đổi `shareUrl`.

### A8. Không ghi token và PII vào log/body lỗi
- [ ] Trong `GlobalExceptionHandler`, thay `request.getRequestURI()` bằng route template (`/api/v1/shares/{token}`) cho cả log lẫn `ErrorResponse.path`.
- [ ] `handleDataIntegrity`: không log nguyên message của driver, chỉ log tên constraint.
- [ ] Thêm filter Correlation ID: nhận hoặc sinh `X-Request-Id`, đưa vào MDC, trả lại trong response.
- [ ] Thêm trường `traceId` vào `ErrorResponse` (thêm trường, không đổi trường cũ).
- [ ] Test: gây lỗi trên `/shares/{token}` rồi kiểm tra log và body không chứa token.

### B1. Refresh token rotation nguyên tử
- [ ] Thêm `RefreshTokenRepository.revokeIfActive(String tokenHash, Instant now)` trả về số dòng (hoặc `Optional<RefreshToken>`).
- [ ] Cài đặt bằng `@Modifying @Query("UPDATE ... SET revoked = true WHERE tokenHash = :hash AND revoked = false AND expiresAt > :now")` trong `RefreshTokenJpaRepository`.
- [ ] Sửa `AuthService.refresh`: chỉ cấp token mới khi cập nhật đúng 1 dòng, vẫn trong `TransactionRunner`.
- [ ] Lấy `now` từ `Clock`.
- [ ] Test E2E: 8 request refresh đồng thời cùng một token, đúng 1 thành công, 7 nhận 401.
- [ ] Test: lỗi khi lưu token mới làm rollback, token cũ vẫn chưa bị thu hồi.

---

## Giai đoạn 1: chịu tải thật (P1)

### F1. Observability và benchmark
- [ ] Thêm `spring-boot-starter-actuator` và `micrometer-registry-prometheus` vào `pom.xml`.
- [ ] Đặt `management.server.port` riêng, không publish ra ngoài; chỉ mở `health`, `prometheus`.
- [ ] Bật metric Hikari (active/pending), HTTP latency theo route template, heap/GC.
- [ ] Bật `pg_stat_statements` cho PostgreSQL.
- [ ] Viết lại kịch bản Locust: chạy trên máy riêng, có think time, có payload 200 KB / 1 MB / 2 MB, tỉ lệ đọc/ghi ~80/20, có `GET /diagrams`, `/diagrams/public`, `/versions`, có kịch bản login dồn dập.
- [ ] Đo lại baseline trên commit hiện tại với PG15, ghi kết quả vào README mục 6.

### B2. Đổi mật khẩu thu hồi mọi phiên
- [ ] Thêm `RefreshTokenRepository.revokeAllByUserId(UUID userId)`.
- [ ] Bọc `UserService.changePassword` trong `TransactionRunner`: lưu hash mới và thu hồi mọi refresh token của user.
- [ ] Băm mật khẩu mới trước khi mở transaction để giữ transaction ngắn.
- [ ] Test: sau khi đổi mật khẩu, refresh token cũ trả 401; login bằng mật khẩu mới vẫn được.

### B3. Sửa `isPublic`
- [ ] Đổi `UpdateDiagramRequest.isPublic` từ `boolean` sang `Boolean`.
- [ ] Đổi tham số `DiagramService.updateDiagram` sang `Boolean`; `null` thì giữ nguyên giá trị cũ.
- [ ] Cập nhật OpenAPI (mô tả rõ "bỏ trống thì giữ nguyên").
- [ ] Test: owner bỏ trường thì sơ đồ public vẫn public; owner gửi `false` thì thành private; editor qua link bỏ trường hoặc gửi khác thì không đổi.

### B4. Kiểm tra lại link trong thao tác ghi
- [ ] Thêm `shareId` vào `Caller` và gán trong `ShareTokenAuthenticationFilter`.
- [ ] Thêm `DiagramShareRepository.lockActive(UUID shareId)` dùng `SELECT ... FOR SHARE`, trả role hiện tại.
- [ ] `createVersion` và `restore`: sau khi khóa sơ đồ, nếu caller đi qua link thì khóa share và kiểm tra role vẫn đủ.
- [ ] `updateDiagram`: chỉ với caller đi qua link, chạy trong `TransactionRunner` (khóa sơ đồ → khóa share → kiểm tra → ghi). Owner giữ nguyên không có transaction.
- [ ] Ghi thứ tự khóa diagram → share vào comment và README.
- [ ] Test: giữ khóa bằng một restore, thu hồi link trong lúc đó, request qua link nhận 403/404 và không tạo snapshot. Test cả `DELETE` share và hạ role `EDIT → VIEW`, cả hai thứ tự commit.

### B5. Kiểm quyền trước khi khóa dòng (làm sau C3)
- [ ] Trong `createVersion` và `restore`: gọi `access.require` bằng projection nhẹ trước `lockDiagram`.
- [ ] Sau khi khóa, đọc lại sơ đồ và kiểm tra quyền lần nữa.
- [ ] Test: user không có quyền nhận 403 mà không giữ được khóa (owner ghi song song không bị chờ).

### B6. Restore idempotent
- [ ] Thêm `expectedVersion` tùy chọn vào request restore (`RestoreVersionRequest` hoặc query param), giống `createVersion`.
- [ ] Trong `restore`, so `expectedVersion` với version hiện tại sau khi khóa; lệch thì ném `OptimisticLockConflictException`.
- [ ] Cập nhật OpenAPI.
- [ ] Test: retry với cùng `expectedVersion` chỉ tạo đúng 1 backup; version cũ trả 409.

### B7. Dịch lỗi DB đúng
- [ ] Liệt kê các constraint "xung đột hợp lệ" (unique email, unique username, unique `(diagram_id, version_number)`).
- [ ] `GlobalExceptionHandler.handleDataIntegrity`: chỉ trả 409 khi tên constraint nằm trong danh sách; còn lại 500 và log ERROR.
- [ ] `DiagramVersionRepositoryAdapter`: chỉ dịch vi phạm unique số phiên bản thành conflict.
- [ ] Test: vi phạm FK không trả 409.

### C1. Danh sách sơ đồ gọn
- [ ] Tạo record `DiagramSummary` (không có `data`) và `PageResult<T>(List<T> items, long total)` trong domain.
- [ ] Đổi `DiagramRepository.findByOwnerId` / `findPublicDiagrams` trả `PageResult<DiagramSummary>`; bỏ `countByOwnerId` / `countPublicDiagrams`.
- [ ] Trong `DiagramJpaRepository` dùng interface projection hoặc `select new ...`; giữ `Page` để lấy tổng trong một lần.
- [ ] Thêm `Sort.by(DESC, "updatedAt").and(DESC, "id")`.
- [ ] Sửa `DiagramService` và `DiagramController` theo port mới; giữ nguyên các trường của `PageResponse`.
- [ ] Test: log SQL không chọn cột `data`; tối đa 1 SELECT + 1 COUNT; thứ tự ổn định giữa các trang.

### C2. Danh sách phiên bản gọn
- [ ] Thêm projection `DiagramVersionSummary` (không có `data`) trong domain.
- [ ] Đổi `DiagramVersionRepository.findByDiagramId` trả summary; JPA query không chọn `data`.
- [ ] Thêm tham số phân trang tùy chọn (`limit`, `beforeVersion`); không truyền thì giữ hành vi trả toàn bộ mảng.
- [ ] Cập nhật OpenAPI.
- [ ] Test với 1.000 snapshot: SQL không có `data`; phân trang trả đúng thứ tự giảm dần.

### C3. Kiểm quyền bằng projection nhẹ
- [ ] Thêm record `DiagramAccessInfo(id, ownerId, isPublic, version)` và `DiagramRepository.findAccessInfo(UUID id)`.
- [ ] Thêm overload trong `DiagramAccess` (ví dụ `requireAccess`) dùng `findAccessInfo`; giữ `require` cho chỗ cần nội dung.
- [ ] Đổi `ShareService`, list/get versions, `deleteDiagram` sang bản nhẹ.
- [ ] Cập nhật `Permission.isGrantedTo` / `Caller.hasIdentityFor` để nhận được `DiagramAccessInfo`.
- [ ] Test: các ca 401/403/404 của mọi endpoint không đổi.

### C4. Index
- [ ] Thêm migration `V5__add_indexes.sql`:
	- [ ] `diagram_shares(diagram_id)`
	- [ ] `diagrams(owner_id, updated_at DESC, id DESC)` thay `idx_diagrams_owner`
	- [ ] partial index `diagrams(updated_at DESC, id DESC) WHERE is_public`
	- [ ] `refresh_tokens(expires_at)`
- [ ] Nếu bảng đã lớn: dùng `CREATE INDEX CONCURRENTLY` trong migration riêng với `executeInTransaction=false`.
- [ ] Chạy `EXPLAIN (ANALYZE, BUFFERS)` trước và sau cho list sơ đồ, list public, list shares, xóa sơ đồ; lưu kết quả.

### C5. Back-pressure ở DB
- [ ] Cấu hình `spring.datasource.hikari.maximum-pool-size` theo ngân sách (`số instance × pool + migration ≤ max_connections`).
- [ ] `connection-timeout` 2–5 s, `leak-detection-threshold`.
- [ ] `connection-init-sql`: `SET lock_timeout = ...; SET statement_timeout = ...`.
- [ ] Flyway dùng kết nối riêng (`spring.flyway.url/user/password`) để không bị timeout cắt.
- [ ] Thêm exception domain cho "tạm thời quá tải"; map lỗi lấy kết nối, SQLState `55P03`, `57014` sang 503 + `Retry-After`.
- [ ] Test: giữ khóa lâu hơn `lock_timeout` thì request sau nhận 503, không phải 500; sơ đồ khác vẫn hoạt động bình thường.

### C7. Dọn dữ liệu và quota
- [ ] Thêm job `@Scheduled` (trong `infrastructure`) xóa `refresh_tokens` hết hạn theo lô.
- [ ] Thêm ShedLock (migration bảng `shedlock`) nếu chạy nhiều instance.
- [ ] Đặt quota số phiên bản theo sơ đồ và theo link (thống nhất con số với nhóm), trả 429 hoặc 409 khi vượt.
- [ ] Test: job chỉ xóa token đã hết hạn; vượt quota bị từ chối.

### D1. `Diagram` thành Rich Domain Model
- [ ] Thêm `Diagram.create(title, type, ownerId, Instant now)`: version 1, private, data rỗng.
- [ ] Thêm method nghiệp vụ `rename`, `publish`, `unpublish` (cùng `updateMetadata`, `replaceContent` đã có).
- [ ] Thêm constructor đầy đủ cho mapper (reconstitution).
- [ ] Đổi `DiagramController.create` truyền tham số thay vì dựng `Diagram` bằng setter.
- [ ] Xóa toàn bộ setter công khai; sửa `DiagramMapper` và test.
- [ ] Chạy ArchitectureTest và toàn bộ test.

### E1. OpenAPI khớp code
- [ ] Thêm `title` vào `required` của `UpdateDiagramRequest`.
- [ ] Khai báo security "tùy chọn" cho `GET /diagrams/{id}`, `/diagrams/public`, `/shares/{token}`, `/health`.
- [ ] Xuất lại `docs/openapi.yaml` từ `/v3/api-docs`.
- [ ] Thêm bước CI: khởi động app, xuất spec, `git diff --exit-code docs/openapi.yaml`.

### F2. Scale ngang sau gateway
- [ ] Bỏ `container_name` và `ports` của service `app` trong compose.
- [ ] Thêm service nginx (hoặc ghi cấu hình LB): TLS, `client_max_body_size`, gzip, `limit_req` cho `/auth/*`, che `/api/v1/shares/*` trong access log.
- [ ] Đặt `spring.lifecycle.timeout-per-shutdown-phase` cho graceful shutdown.
- [ ] Sửa lệnh `--scale` trong README mục 7.
- [ ] Kiểm tra: 3 instance sau nginx, cùng user gọi qua nhiều instance; tắt 1 instance không làm lỗi request.

### F3. Backup và khôi phục
- [ ] Chọn managed Postgres hoặc WAL archiving + PITR (pgBackRest/WAL-G).
- [ ] Đặt lịch backup, mã hóa, lưu ngoài máy.
- [ ] Ghi RPO/RTO vào README.
- [ ] Diễn tập khôi phục sang DB sạch; ghi lại thời gian thực tế.
- [ ] Ghi quy trình xử lý token/link đã thu hồi sau mốc khôi phục.

---

## Giai đoạn 2: nên sửa (P2)

### A9. Băm share token (cần chốt hợp đồng trước)
- [ ] Chốt với nhóm: `GET /shares` có còn trả lại token không.
- [ ] Trước mắt: thêm header `Referrer-Policy: no-referrer`.
- [ ] Migration thêm cột `share_token_hash` (unique), backfill SHA-256 từ cột cũ.
- [ ] Filter tra theo hash; tạo link chỉ trả token gốc một lần.
- [ ] Sau khi client chuyển xong: migration bỏ cột plaintext.
- [ ] Test: link cũ vẫn dùng và thu hồi được trong lúc chuyển.

### D2. Inject `Clock`
- [ ] Truyền `Clock` vào `DiagramService`, `ShareService` qua `DiagramConfig`, `ShareConfig`.
- [ ] Thay mọi `Instant.now()` trong domain bằng `Instant.now(clock)`.
- [ ] Test dùng `Clock.fixed` để kiểm tra `createdAt`/`updatedAt`.

### D3. Value object `DiagramTitle`
- [ ] Tạo `DiagramTitle.of(String)`: trim, không rỗng, ≤ 255 ký tự, sai thì ném `InvalidInputException`.
- [ ] Dùng trong `Diagram.create`, `rename`, `updateMetadata`.
- [ ] Test: tiêu đề rỗng hoặc 256 ký tự trả 400 kể cả khi gọi thẳng service.

### D4. Chuyển `lockDiagram`
- [ ] Thêm `DiagramRepository.lockForUpdate(UUID id)` và cài đặt trong `DiagramJpaRepository` / adapter.
- [ ] Xóa `lockDiagram` khỏi `DiagramVersionRepository` và `DiagramVersionJpaRepository`.
- [ ] Sửa `DiagramVersionService` dùng repository mới.
- [ ] Chạy lại `DiagramVersionConcurrencyTest`.

### D5. `DiagramAccess` là bean
- [ ] Khai báo `@Bean DiagramAccess` trong `config`.
- [ ] Đổi constructor của `DiagramService`, `ShareService`, `DiagramVersionService` để nhận `DiagramAccess`.
- [ ] Sửa các test đang tự `new` service.

### D6. Phụ thuộc Jackson trong domain
- [ ] Chốt với nhóm: (a) ghi Jackson là ngoại lệ hay (b) tách parser ra port.
- [ ] Nếu (a): thêm đoạn ngoại lệ vào AGENTS.md, thêm rule ArchUnit chỉ cho phép `com.fasterxml.jackson.databind` trong `DiagramData`.
- [ ] Nếu (b): tạo port `DiagramJsonParser` trong domain, cài đặt Jackson trong `infrastructure`, `DiagramData.of(String)` gọi qua port.
- [ ] ArchitectureTest cấm `com.fasterxml..` trong phần còn lại của domain.

### E2. Mã lỗi máy đọc được
- [ ] Thêm `code` (ví dụ `DIAGRAM_VERSION_CONFLICT`) và `errors[]` theo trường vào `ErrorResponse`, hoặc chuyển sang `ProblemDetail`.
- [ ] Gán `code` cho từng domain exception trong `GlobalExceptionHandler`.
- [ ] Cập nhật OpenAPI và test assert `code`.

### E3. Dotenv chỉ cho dev
- [ ] Chuyển `springboot3-dotenv` vào Maven profile `dev`, hoặc thay bằng `spring.config.import=optional:file:.env[.properties]` trong `application-dev.yml`.
- [ ] Kiểm tra jar production không còn class của thư viện.

### F4. Health check
- [ ] Thêm `setQueryTimeout(1)` trong `JdbcDatabaseHealth`.
- [ ] Khi có LB dùng probe: bật `/actuator/health/liveness` và `/readiness` ở management port.
- [ ] Giữ `/api/v1/health` đúng đặc tả.
- [ ] Test: DB chậm thì health trả 503 trong khoảng 1 s.

### F5. Dockerfile
- [ ] Build bằng `./mvnw` thay vì `mvn`.
- [ ] `ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"`.
- [ ] Tách layer jar (`-Djarmode=tools extract --layers`).
- [ ] Pin digest base image; thêm `mem_limit` / `cpus` trong compose.
- [ ] Thống nhất phiên bản PostgreSQL giữa compose, Testcontainers và benchmark.

### Khác
- [ ] C6: bật `server.compression` (hoặc gzip ở nginx) và đo băng thông trước/sau.
- [ ] C6: thêm `ETag: W/"{id}-{version}"` và trả 304 cho `GET /diagrams/{id}` (kiểm quyền trước).
- [ ] B17 (CLAUDE_PLAN): chuẩn hóa username (`@Pattern`, unique `lower(username)` bằng migration mới).
- [ ] O10 (CLAUDE_PLAN): migration thêm `NOT NULL` cho `created_at`/`updated_at`, `CHECK (version >= 1)`.
- [ ] Thêm Spotless, Checkstyle và JaCoCo (ngưỡng tối thiểu) vào CI.

---

## Giai đoạn 3: chỉ làm khi số đo của F1 yêu cầu

### G1. Conditional UPDATE cho PUT
- [ ] Có số đo: SELECT do `merge` chiếm phần đáng kể của p95 với payload 1–2 MB.
- [ ] Thêm `DiagramRepository.updateIfVersion(...)` chạy `UPDATE ... SET ..., version = version + 1 WHERE id = ? AND version = ?`.
- [ ] 0 dòng: đọc version bằng projection, trả 409 hoặc 404.
- [ ] Response dùng lại data của request.
- [ ] Test: stale update, 2 PUT đồng thời, metadata và data không bị mất.

### G2. Snapshot/restore sao chép trong DB
- [ ] Có số đo: thời gian giữ khóa tăng theo kích thước data.
- [ ] Native query `INSERT INTO diagram_versions ... SELECT data FROM diagrams ... RETURNING ...`.
- [ ] Native query `UPDATE diagrams ... FROM diagram_versions ... RETURNING ...`.
- [ ] Vẫn trong `TransactionRunner` + `FOR UPDATE`; chạy lại `DiagramVersionConcurrencyTest`.

### G3. Cache và read replica
- [ ] Có số đo: primary bão hòa vì đọc sau khi đã làm C1–C3.
- [ ] Bước 1: micro-cache nginx 1–5 s cho `/diagrams/public` ẩn danh.
- [ ] Bước 2: Cache-Aside bằng Redis cho `GET /diagrams/{id}` public; xóa cache sau commit ở mọi đường ghi (save, update, delete, đổi public).
- [ ] Bước 3: read replica, route tường minh ở adapter cho các đọc chấp nhận trễ.
- [ ] Không cache tra share token; editor luôn đọc từ primary.
