/// GhostCrab backend — MindBrain-backed SQLite HTTP server.
///
/// Routes:
///   GET  /health
///   POST /api/mindbrain/sql
///   POST /api/mindbrain/sql/session/open
///   POST /api/mindbrain/sql/session/query
///   POST /api/mindbrain/sql/session/close
///   GET  /api/mindbrain/traverse
///   GET  /api/mindbrain/pack
///   GET  /api/mindbrain/coverage
///   GET  /api/mindbrain/coverage-by-domain
///   GET  /api/mindbrain/workspace-export
///   GET  /api/mindbrain/workspace-export-by-domain
///   GET  /api/mindbrain/search-compact-info
///   GET  /api/mindbrain/graph-path
///
/// Environment:
///   GHOSTCRAB_BACKEND_ADDR   listen address (default ":8091")
///   GHOSTCRAB_SQLITE_PATH    SQLite file path (default "data/ghostcrab.sqlite")
///
/// Flags:
///   --addr <ip:port>
///   --db <path>  (also --ghostcrab-db=<path>)
///   --init-only

const std = @import("std");
const mindbrain = @import("mindbrain");
const facet_sqlite = mindbrain.facet_sqlite;
const graph_sqlite = mindbrain.graph_sqlite;
const helper_api = mindbrain.helper_api;
const ontology_sqlite = mindbrain.ontology_sqlite;
const pragma_sqlite = mindbrain.pragma_sqlite;
const search_sqlite = mindbrain.search_sqlite;
const toon_exports = mindbrain.toon_exports;
const workspace_sqlite = mindbrain.workspace_sqlite;

const http = std.http;
const log = std.log.scoped(.ghostcrab_backend);

const SqlSession = struct {
    db: facet_sqlite.Database,
    mutex: std.Thread.Mutex = .{},
};

const SqlRequest = struct {
    sql: []const u8 = "",
    params: []const std.json.Value = &.{},
    session_id: ?u64 = null,
    commit: ?bool = null,
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var app = try GhostcrabBackend.init(allocator);
    defer app.deinit();

    if (app.init_only) return;

    try app.serve();
}

const GhostcrabBackend = struct {
    allocator: std.mem.Allocator,
    db_path: []const u8,
    listen_addr: std.net.Address,
    listen_addr_text: []const u8,
    init_only: bool,
    db_path_owned: []u8,
    listen_addr_text_owned: []u8,
    sql_sessions_mutex: std.Thread.Mutex,
    sql_sessions: std.AutoHashMap(u64, *SqlSession),
    next_sql_session_id: u64,

    pub fn init(allocator: std.mem.Allocator) !GhostcrabBackend {
        const args = try std.process.argsAlloc(allocator);
        defer std.process.argsFree(allocator, args);

        const env_addr = std.process.getEnvVarOwned(allocator, "GHOSTCRAB_BACKEND_ADDR") catch null;
        defer if (env_addr) |value| allocator.free(value);
        const env_db = std.process.getEnvVarOwned(allocator, "GHOSTCRAB_SQLITE_PATH") catch null;
        defer if (env_db) |value| allocator.free(value);

        var addr_text: []const u8 = env_addr orelse ":8091";
        var db_path: []const u8 = env_db orelse "data/ghostcrab.sqlite";
        var init_only = false;

        var index: usize = 1;
        while (index < args.len) : (index += 1) {
            const arg = args[index];
            if (std.mem.eql(u8, arg, "--addr")) {
                index += 1;
                if (index >= args.len) return error.InvalidArguments;
                addr_text = args[index];
            } else if (std.mem.eql(u8, arg, "--db") or std.mem.eql(u8, arg, "--ghostcrab-db")) {
                index += 1;
                if (index >= args.len) return error.InvalidArguments;
                db_path = args[index];
            } else if (std.mem.startsWith(u8, arg, "--addr=")) {
                addr_text = arg["--addr=".len..];
            } else if (std.mem.startsWith(u8, arg, "--db=")) {
                db_path = arg["--db=".len..];
            } else if (std.mem.startsWith(u8, arg, "--ghostcrab-db=")) {
                db_path = arg["--ghostcrab-db=".len..];
            } else if (std.mem.eql(u8, arg, "--init-only")) {
                init_only = true;
            } else if (std.mem.eql(u8, arg, "--help") or std.mem.eql(u8, arg, "-h")) {
                try printUsage();
                return error.InvalidArguments;
            } else {
                log.err("unknown argument: {s}", .{arg});
                return error.InvalidArguments;
            }
        }

        const listen_addr = try parseListenAddress(addr_text);
        const listen_addr_text_owned = try allocator.dupe(u8, addr_text);
        const db_path_owned = allocator.dupe(u8, db_path) catch |err| {
            allocator.free(listen_addr_text_owned);
            return err;
        };

        var app = GhostcrabBackend{
            .allocator = allocator,
            .db_path = db_path_owned,
            .listen_addr = listen_addr,
            .listen_addr_text = listen_addr_text_owned,
            .init_only = init_only,
            .db_path_owned = db_path_owned,
            .listen_addr_text_owned = listen_addr_text_owned,
            .sql_sessions_mutex = .{},
            .sql_sessions = std.AutoHashMap(u64, *SqlSession).init(allocator),
            .next_sql_session_id = 1,
        };
        errdefer app.deinit();
        try app.initDatabase();
        return app;
    }

    pub fn deinit(self: *GhostcrabBackend) void {
        self.closeAllSqlSessions();
        self.sql_sessions.deinit();
        self.allocator.free(self.db_path_owned);
        self.allocator.free(self.listen_addr_text_owned);
    }

    pub fn serve(self: *GhostcrabBackend) !void {
        var listener = try self.listen_addr.listen(.{
            .reuse_address = true,
        });
        defer listener.deinit();

        log.info("ghostcrab-backend listening on {s}", .{self.listen_addr_text});
        log.info("sqlite: {s}", .{self.db_path});

        while (true) {
            const connection = listener.accept() catch |err| {
                log.err("accept failed: {s}", .{@errorName(err)});
                continue;
            };
            const thread = std.Thread.spawn(.{}, connectionWorker, .{
                self,
                connection,
            }) catch |err| {
                log.err("spawn worker failed: {s}", .{@errorName(err)});
                connection.stream.close();
                continue;
            };
            thread.detach();
        }
    }

    fn connectionWorker(
        self: *GhostcrabBackend,
        connection: std.net.Server.Connection,
    ) void {
        self.serveConnection(connection) catch |err| {
            if (err != error.ConnectionResetByPeer and err != error.BrokenPipe) {
                log.err("connection failed: {s}", .{@errorName(err)});
            }
        };
    }

    fn initDatabase(self: *GhostcrabBackend) !void {
        if (self.db_path.len == 0) return error.InvalidArguments;

        if (std.fs.path.dirname(self.db_path)) |dir| {
            if (dir.len != 0 and !std.mem.eql(u8, dir, ".")) {
                try std.fs.cwd().makePath(dir);
            }
        }

        var db = try facet_sqlite.Database.open(self.db_path);
        defer db.close();
        try db.applyStandaloneSchema();
        // Ensure the default workspace exists so all tools work out of the box.
        try workspace_sqlite.upsertWorkspace(db, "default", "{\"domain\":\"ghostcrab\"}");
        // Keep the display label aligned with the canonical name (migration equivalent of 015).
        try db.exec("UPDATE workspaces SET label = 'GhostCrab Operating Model', description = 'Canonical GhostCrab ontology and operating model. Default bootstrap workspace; rows use workspace_id default.' WHERE id = 'default' AND label = 'Default Workspace'");
        log.info("sqlite ready at {s}", .{self.db_path});
    }

    fn closeAllSqlSessions(self: *GhostcrabBackend) void {
        self.sql_sessions_mutex.lock();
        defer self.sql_sessions_mutex.unlock();

        var it = self.sql_sessions.iterator();
        while (it.next()) |entry| {
            const session = entry.value_ptr.*;
            session.db.close();
            self.allocator.destroy(session);
        }
        self.sql_sessions.clearRetainingCapacity();
    }

    fn serveConnection(self: *GhostcrabBackend, connection: std.net.Server.Connection) !void {
        defer connection.stream.close();

        var send_buffer: [4096]u8 = undefined;
        var recv_buffer: [4096]u8 = undefined;
        var body_buffer: [65536]u8 = undefined;
        var connection_reader = connection.stream.reader(&recv_buffer);
        var connection_writer = connection.stream.writer(&send_buffer);
        var server: http.Server = .init(connection_reader.interface(), &connection_writer.interface);

        while (true) {
            var request = server.receiveHead() catch |err| switch (err) {
                error.HttpConnectionClosing => return,
                else => {
                    log.err("failed to receive request: {s}", .{@errorName(err)});
                    return;
                },
            };

            var request_arena = std.heap.ArenaAllocator.init(self.allocator);
            defer request_arena.deinit();
            const request_allocator = request_arena.allocator();

            const parsed = parseTarget(request.head.target) catch {
                try self.respondError(request_allocator, &request, .bad_request, "invalid request target");
                continue;
            };

            const path_owned = try request_allocator.dupe(u8, parsed.path);
            const query_owned = try request_allocator.dupe(u8, parsed.query);

            const response = self.dispatch(request_allocator, &request, path_owned, query_owned, body_buffer[0..]) catch |err| {
                const status: http.Status = switch (err) {
                    error.BadRequest => .bad_request,
                    error.NotFound => .not_found,
                    error.MethodNotAllowed => .method_not_allowed,
                    else => .internal_server_error,
                };
                if (status == .internal_server_error) {
                    log.err("request failed on {s}: {s}", .{ parsed.path, @errorName(err) });
                }
                try self.respondError(request_allocator, &request, status, @errorName(err));
                continue;
            };

            try request.respond(
                response.body,
                .{
                    .version = request.head.version,
                    .status = response.status,
                    .keep_alive = true,
                    .extra_headers = &.{
                        .{ .name = "content-type", .value = response.content_type },
                        .{ .name = "cache-control", .value = "no-store" },
                    },
                },
            );
        }
    }

    fn dispatch(
        self: *GhostcrabBackend,
        allocator: std.mem.Allocator,
        request: *http.Server.Request,
        path: []const u8,
        query: []const u8,
        body_buffer: []u8,
    ) !Response {
        // POST routes — SQL execution and sessions
        if (std.mem.eql(u8, path, "/api/mindbrain/sql")) {
            if (request.head.method != .POST) return error.MethodNotAllowed;
            return try self.handleSqlRequest(allocator, request, body_buffer, false);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/sql/session/open")) {
            if (request.head.method != .POST) return error.MethodNotAllowed;
            return try self.handleSqlSessionOpen(allocator, request, body_buffer);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/sql/session/close")) {
            if (request.head.method != .POST) return error.MethodNotAllowed;
            return try self.handleSqlSessionClose(allocator, request, body_buffer);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/sql/session/query")) {
            if (request.head.method != .POST) return error.MethodNotAllowed;
            return try self.handleSqlRequest(allocator, request, body_buffer, true);
        }

        // GET routes
        if (request.head.method != .GET and request.head.method != .HEAD) return error.MethodNotAllowed;

        if (std.mem.eql(u8, path, "/health")) {
            return .{
                .status = .ok,
                .content_type = "text/plain; charset=utf-8",
                .body = try allocator.dupe(u8, "ok\n"),
            };
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/search-compact-info")) {
            return self.handleSearchCompactInfo(allocator);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/coverage")) {
            return self.handleCoverage(allocator, query, false);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/coverage-by-domain")) {
            return self.handleCoverage(allocator, query, true);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/workspace-export")) {
            return self.handleWorkspaceExport(allocator, query, false);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/workspace-export-by-domain")) {
            return self.handleWorkspaceExport(allocator, query, true);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/graph-path")) {
            return self.handleGraphPath(allocator, query);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/traverse")) {
            return self.handleTraverse(allocator, query);
        }
        if (std.mem.eql(u8, path, "/api/mindbrain/pack")) {
            return self.handlePack(allocator, query);
        }

        return error.NotFound;
    }

    // ── SQL session management ───────────────────────────────────────────────

    fn handleSqlSessionOpen(
        self: *GhostcrabBackend,
        allocator: std.mem.Allocator,
        request: *http.Server.Request,
        body_buffer: []u8,
    ) !Response {
        _ = request;
        _ = body_buffer;

        var session = try self.allocator.create(SqlSession);
        errdefer self.allocator.destroy(session);
        session.* = .{
            .db = try self.openDb(),
            .mutex = .{},
        };
        errdefer session.db.close();

        session.db.exec("BEGIN IMMEDIATE") catch |err| {
            session.db.close();
            return err;
        };

        self.sql_sessions_mutex.lock();
        defer self.sql_sessions_mutex.unlock();

        const session_id = self.next_sql_session_id;
        self.next_sql_session_id += 1;
        try self.sql_sessions.put(session_id, session);

        return toResponse(
            try helper_api.jsonResponse(allocator, .{
                .ok = true,
                .session_id = session_id,
            }),
        );
    }

    fn handleSqlSessionClose(
        self: *GhostcrabBackend,
        allocator: std.mem.Allocator,
        request: *http.Server.Request,
        body_buffer: []u8,
    ) !Response {
        const sql_request = try self.parseSqlRequest(allocator, request, body_buffer);
        const session_id = sql_request.session_id orelse return error.BadRequest;
        const commit = sql_request.commit orelse true;

        const session = try self.takeSqlSession(session_id);
        defer self.allocator.destroy(session);

        session.mutex.lock();
        defer session.mutex.unlock();

        if (commit) {
            try session.db.exec("COMMIT");
        } else {
            try session.db.exec("ROLLBACK");
        }
        session.db.close();

        return toResponse(
            try helper_api.jsonResponse(allocator, .{
                .ok = true,
                .session_id = session_id,
                .committed = commit,
            }),
        );
    }

    fn handleSqlRequest(
        self: *GhostcrabBackend,
        allocator: std.mem.Allocator,
        request: *http.Server.Request,
        body_buffer: []u8,
        session_required: bool,
    ) !Response {
        const sql_request = try self.parseSqlRequest(allocator, request, body_buffer);
        if (sql_request.sql.len == 0) return error.BadRequest;

        if (session_required and sql_request.session_id == null) return error.BadRequest;

        if (sql_request.session_id) |session_id| {
            const session = try self.getSqlSession(session_id);
            session.mutex.lock();
            defer session.mutex.unlock();
            return try self.executeSql(allocator, session.db, sql_request.sql, sql_request.params);
        }

        var db = try self.openDb();
        defer db.close();
        return try self.executeSql(allocator, db, sql_request.sql, sql_request.params);
    }

    fn parseSqlRequest(
        self: *GhostcrabBackend,
        allocator: std.mem.Allocator,
        request: *http.Server.Request,
        body_buffer: []u8,
    ) !SqlRequest {
        _ = self;
        const content_length = request.head.content_length orelse 0;
        if (content_length == 0) return .{};

        const reader = request.readerExpectNone(body_buffer);
        const body = try reader.readAlloc(allocator, @intCast(content_length));
        const parsed = try std.json.parseFromSliceLeaky(
            SqlRequest,
            allocator,
            body,
            .{
                .allocate = .alloc_always,
                .ignore_unknown_fields = false,
            },
        );
        return parsed;
    }

    fn getSqlSession(self: *GhostcrabBackend, session_id: u64) !*SqlSession {
        self.sql_sessions_mutex.lock();
        defer self.sql_sessions_mutex.unlock();
        return self.sql_sessions.get(session_id) orelse error.NotFound;
    }

    fn takeSqlSession(self: *GhostcrabBackend, session_id: u64) !*SqlSession {
        self.sql_sessions_mutex.lock();
        defer self.sql_sessions_mutex.unlock();
        const removed = self.sql_sessions.fetchRemove(session_id) orelse return error.NotFound;
        return removed.value;
    }

    fn executeSql(
        self: *GhostcrabBackend,
        allocator: std.mem.Allocator,
        db: facet_sqlite.Database,
        sql: []const u8,
        params: []const std.json.Value,
    ) !Response {
        _ = self;
        const c = facet_sqlite.c;
        const has_multiple_statements = params.len == 0 and countSqlStatements(sql) > 1;

        if (has_multiple_statements) {
            try db.exec(sql);
            return toResponse(
                try helper_api.jsonResponse(allocator, .{
                    .ok = true,
                    .columns = [_][]const u8{},
                    .rows = [_][]const u8{},
                    .changes = c.sqlite3_changes(db.handle),
                    .last_insert_rowid = c.sqlite3_last_insert_rowid(db.handle),
                }),
            );
        }

        var stmt: ?*c.sqlite3_stmt = null;
        if (c.sqlite3_prepare_v2(db.handle, sql.ptr, @intCast(sql.len), &stmt, null) != c.SQLITE_OK or stmt == null) {
            return error.PrepareFailed;
        }
        defer _ = c.sqlite3_finalize(stmt.?);

        try bindSqlParams(stmt.?, params);

        const column_count: usize = @intCast(c.sqlite3_column_count(stmt.?));
        var columns = std.ArrayList([]const u8).empty;
        defer columns.deinit(allocator);
        try columns.ensureUnusedCapacity(allocator, column_count);
        for (0..column_count) |index| {
            const name_ptr = c.sqlite3_column_name(stmt.?, @intCast(index)) orelse return error.StepFailed;
            try columns.append(allocator, try allocator.dupe(u8, std.mem.span(name_ptr)));
        }

        var rows = std.ArrayList([]std.json.Value).empty;
        defer {
            for (rows.items) |row| allocator.free(row);
            rows.deinit(allocator);
        }

        while (true) {
            const rc = c.sqlite3_step(stmt.?);
            if (rc == c.SQLITE_DONE) break;
            if (rc != c.SQLITE_ROW) return error.StepFailed;

            const row = try allocator.alloc(std.json.Value, column_count);
            errdefer allocator.free(row);
            for (0..column_count) |index| {
                row[index] = try sqlValueToJson(allocator, stmt.?, @intCast(index));
            }
            try rows.append(allocator, row);
        }

        var out: std.Io.Writer.Allocating = .init(allocator);
        defer out.deinit();
        try out.writer.print(
            "{{\"ok\":true,\"columns\":{f},\"rows\":[",
            .{std.json.fmt(columns.items, .{})},
        );
        for (rows.items, 0..) |row, row_index| {
            if (row_index > 0) try out.writer.writeAll(",");
            try out.writer.print("{f}", .{std.json.fmt(row, .{})});
        }
        try out.writer.print(
            "],\"changes\":{},\"last_insert_rowid\":{}}}",
            .{ c.sqlite3_changes(db.handle), c.sqlite3_last_insert_rowid(db.handle) },
        );
        const body = try out.toOwnedSlice();
        return .{
            .status = .ok,
            .content_type = "application/json; charset=utf-8",
            .body = body,
        };
    }

    // ── GET route handlers ───────────────────────────────────────────────────

    fn handleSearchCompactInfo(self: *GhostcrabBackend, allocator: std.mem.Allocator) !Response {
        var db = try self.openDb();
        defer db.close();
        const body = try search_sqlite.compactSearchSnapshotToon(db, allocator);
        return .{ .status = .ok, .content_type = "text/plain; charset=utf-8", .body = body };
    }

    fn handleCoverage(self: *GhostcrabBackend, allocator: std.mem.Allocator, query: []const u8, by_domain: bool) !Response {
        var db = try self.openDb();
        defer db.close();

        const id = if (by_domain)
            (try queryValue(allocator, query, "domain_or_workspace")) orelse return error.BadRequest
        else
            (try queryValue(allocator, query, "workspace_id")) orelse return error.BadRequest;

        var resolved_workspace_id: ?[]const u8 = null;
        defer if (resolved_workspace_id) |value| allocator.free(value);

        const workspace_id = if (by_domain) blk: {
            resolved_workspace_id = try ontology_sqlite.resolveWorkspace(db, allocator, id);
            if (resolved_workspace_id == null) return error.NotFound;
            break :blk resolved_workspace_id.?;
        } else id;

        const entity_types = try queryValues(allocator, query, "entity_type");
        defer allocator.free(entity_types);

        const report = try ontology_sqlite.coverageReport(
            db,
            allocator,
            workspace_id,
            if (entity_types.len > 0) entity_types else null,
        );
        defer {
            allocator.free(report.summary.workspace_id);
            for (report.gaps) |gap| {
                allocator.free(gap.id);
                allocator.free(gap.label);
                allocator.free(gap.entity_type);
                allocator.free(gap.criticality);
            }
            allocator.free(report.gaps);
        }

        const body = try toon_exports.encodeCoverageReportAlloc(allocator, report, toon_exports.default_options);
        return .{ .status = .ok, .content_type = "text/plain; charset=utf-8", .body = body };
    }

    fn handleWorkspaceExport(self: *GhostcrabBackend, allocator: std.mem.Allocator, query: []const u8, by_domain: bool) !Response {
        var db = try self.openDb();
        defer db.close();

        const id = if (by_domain)
            (try queryValue(allocator, query, "domain_or_workspace")) orelse return error.BadRequest
        else
            (try queryValue(allocator, query, "workspace_id")) orelse return error.BadRequest;

        const body = if (by_domain) blk: {
            const maybe = try workspace_sqlite.exportWorkspaceModelToonByDomain(db, allocator, id);
            if (maybe == null) return error.NotFound;
            break :blk maybe.?;
        } else try workspace_sqlite.exportWorkspaceModelToon(db, allocator, id);

        return .{ .status = .ok, .content_type = "text/plain; charset=utf-8", .body = body };
    }

    fn handleGraphPath(self: *GhostcrabBackend, allocator: std.mem.Allocator, query: []const u8) !Response {
        var db = try self.openDb();
        defer db.close();

        const source = (try queryValue(allocator, query, "source")) orelse return error.BadRequest;
        const target = (try queryValue(allocator, query, "target")) orelse return error.BadRequest;
        const max_depth = if (try queryValue(allocator, query, "max_depth")) |value|
            try std.fmt.parseInt(usize, value, 10)
        else
            4;
        const edge_labels = try queryValues(allocator, query, "edge_label");
        defer allocator.free(edge_labels);

        const body = try graph_sqlite.shortestPathToon(
            db,
            allocator,
            source,
            target,
            if (edge_labels.len > 0) edge_labels else null,
            max_depth,
        );
        return .{ .status = .ok, .content_type = "text/plain; charset=utf-8", .body = body };
    }

    fn handleTraverse(self: *GhostcrabBackend, allocator: std.mem.Allocator, query: []const u8) !Response {
        var db = try self.openDb();
        defer db.close();

        const start = (try queryValue(allocator, query, "start")) orelse return error.BadRequest;
        const direction = if (try queryValue(allocator, query, "direction")) |value|
            parseDirection(value) orelse return error.BadRequest
        else
            graph_sqlite.TraverseDirection.outbound;
        const depth = if (try queryValue(allocator, query, "depth")) |value|
            try std.fmt.parseInt(usize, value, 10)
        else
            3;
        const target = try queryValue(allocator, query, "target");
        const edge_labels = try queryValues(allocator, query, "edge_label");
        defer allocator.free(edge_labels);

        var result = try graph_sqlite.traverse(
            db,
            allocator,
            start,
            direction,
            if (edge_labels.len > 0) edge_labels else null,
            depth,
            target,
        );
        defer result.deinit(allocator);

        const payload = .{
            .target_found = result.target_found,
            .rows = result.rows,
        };
        var out: std.Io.Writer.Allocating = .init(allocator);
        defer out.deinit();
        try out.writer.print("{f}", .{std.json.fmt(payload, .{})});
        return .{
            .status = .ok,
            .content_type = "application/json; charset=utf-8",
            .body = try out.toOwnedSlice(),
        };
    }

    fn handlePack(self: *GhostcrabBackend, allocator: std.mem.Allocator, query: []const u8) !Response {
        var db = try self.openDb();
        defer db.close();

        const user_id = (try queryValue(allocator, query, "user_id")) orelse return error.BadRequest;
        const query_text = (try queryValue(allocator, query, "query")) orelse return error.BadRequest;
        const scope = try queryValue(allocator, query, "scope");
        const limit = if (try queryValue(allocator, query, "limit")) |value|
            try std.fmt.parseInt(usize, value, 10)
        else
            15;

        const rows = try pragma_sqlite.packContextScoped(db, allocator, user_id, query_text, scope, limit);
        defer {
            for (rows) |row| pragma_sqlite.deinitPackedRow(allocator, row);
            allocator.free(rows);
        }

        const body = try toon_exports.encodePackContextAlloc(
            allocator,
            user_id,
            query_text,
            scope,
            rows,
            toon_exports.default_options,
        );
        return .{ .status = .ok, .content_type = "text/plain; charset=utf-8", .body = body };
    }

    fn openDb(self: *GhostcrabBackend) !facet_sqlite.Database {
        return try facet_sqlite.Database.open(self.db_path);
    }

    fn respondError(_: *GhostcrabBackend, allocator: std.mem.Allocator, request: *http.Server.Request, status: http.Status, message: []const u8) !void {
        var out: std.Io.Writer.Allocating = .init(allocator);
        defer out.deinit();
        try out.writer.print("{f}", .{std.json.fmt(.{ .@"error" = message }, .{})});
        const payload = try out.toOwnedSlice();
        try request.respond(
            payload,
            .{
                .version = request.head.version,
                .status = status,
                .keep_alive = false,
                .extra_headers = &.{
                    .{ .name = "content-type", .value = "application/json; charset=utf-8" },
                    .{ .name = "cache-control", .value = "no-store" },
                },
            },
        );
    }
};

// ── Shared helpers ───────────────────────────────────────────────────────────

fn sqlValueToJson(
    allocator: std.mem.Allocator,
    stmt: *facet_sqlite.c.sqlite3_stmt,
    index: c_int,
) !std.json.Value {
    const c = facet_sqlite.c;
    switch (c.sqlite3_column_type(stmt, index)) {
        c.SQLITE_INTEGER => return .{ .integer = c.sqlite3_column_int64(stmt, index) },
        c.SQLITE_FLOAT => return .{ .float = c.sqlite3_column_double(stmt, index) },
        c.SQLITE_TEXT => return .{ .string = try helper_api.dupeColText(allocator, stmt, index) },
        c.SQLITE_BLOB => {
            const len: usize = @intCast(c.sqlite3_column_bytes(stmt, index));
            const ptr = c.sqlite3_column_blob(stmt, index) orelse return .null;
            const bytes: []const u8 = @as([*]const u8, @ptrCast(ptr))[0..len];
            const hex_chars = "0123456789abcdef";
            const out = try allocator.alloc(u8, 2 + bytes.len * 2);
            out[0] = '0';
            out[1] = 'x';
            for (bytes, 0..) |byte, i| {
                out[2 + i * 2] = hex_chars[byte >> 4];
                out[3 + i * 2] = hex_chars[byte & 0x0f];
            }
            return .{ .string = out };
        },
        else => return .null,
    }
}

fn bindSqlParams(stmt: *facet_sqlite.c.sqlite3_stmt, params: []const std.json.Value) !void {
    const c = facet_sqlite.c;
    for (params, 0..) |param, idx| {
        const bind_index: c_int = @intCast(idx + 1);
        switch (param) {
            .null => if (c.sqlite3_bind_null(stmt, bind_index) != c.SQLITE_OK) return error.BindFailed,
            .bool => |value| if (c.sqlite3_bind_int64(stmt, bind_index, if (value) 1 else 0) != c.SQLITE_OK) return error.BindFailed,
            .integer => |value| if (c.sqlite3_bind_int64(stmt, bind_index, value) != c.SQLITE_OK) return error.BindFailed,
            .float => |value| if (c.sqlite3_bind_double(stmt, bind_index, value) != c.SQLITE_OK) return error.BindFailed,
            .number_string => |value| {
                const parsed = std.fmt.parseFloat(f64, value) catch return error.BindFailed;
                if (c.sqlite3_bind_double(stmt, bind_index, parsed) != c.SQLITE_OK) return error.BindFailed;
            },
            .string => |value| {
                if (c.sqlite3_bind_text(stmt, bind_index, value.ptr, @intCast(value.len), c.SQLITE_TRANSIENT) != c.SQLITE_OK) {
                    return error.BindFailed;
                }
            },
            .array, .object => {
                var json_buf: std.Io.Writer.Allocating = .init(std.heap.page_allocator);
                defer json_buf.deinit();
                try json_buf.writer.print("{f}", .{std.json.fmt(param, .{})});
                const json_text = try json_buf.toOwnedSlice();
                defer std.heap.page_allocator.free(json_text);
                if (c.sqlite3_bind_text(stmt, bind_index, json_text.ptr, @intCast(json_text.len), c.SQLITE_TRANSIENT) != c.SQLITE_OK) {
                    return error.BindFailed;
                }
            },
        }
    }
}

fn countSqlStatements(sql: []const u8) usize {
    var count: usize = 0;
    var i: usize = 0;
    while (i < sql.len) {
        while (i < sql.len and std.ascii.isWhitespace(sql[i])) : (i += 1) {}
        if (i >= sql.len) break;
        count += 1;
        var in_single = false;
        var in_double = false;
        while (i < sql.len) : (i += 1) {
            const ch = sql[i];
            if (ch == '\'' and !in_double) {
                in_single = !in_single;
            } else if (ch == '"' and !in_single) {
                in_double = !in_double;
            } else if (ch == ';' and !in_single and !in_double) {
                i += 1;
                break;
            }
        }
    }
    return count;
}

fn toResponse(api_response: helper_api.ApiResponse) Response {
    return .{
        .status = api_response.status,
        .content_type = "application/json; charset=utf-8",
        .body = api_response.body,
    };
}

const Response = struct {
    status: http.Status,
    content_type: []const u8,
    body: []const u8,
};

fn parseListenAddress(text: []const u8) !std.net.Address {
    if (text.len > 0 and text[0] == ':') {
        const port = try std.fmt.parseInt(u16, text[1..], 10);
        return try std.net.Address.parseIp("0.0.0.0", port);
    }
    return try std.net.Address.parseIpAndPort(text);
}

fn parseTarget(target: []const u8) !struct { path: []const u8, query: []const u8 } {
    if (target.len == 0) return error.InvalidArguments;
    if (std.mem.indexOfScalar(u8, target, '?')) |idx| {
        return .{ .path = target[0..idx], .query = target[idx + 1 ..] };
    }
    return .{ .path = target, .query = "" };
}

fn queryValue(allocator: std.mem.Allocator, query: []const u8, key: []const u8) !?[]const u8 {
    if (query.len == 0) return null;
    var it = std.mem.splitScalar(u8, query, '&');
    while (it.next()) |pair| {
        if (pair.len == 0) continue;
        const eq = std.mem.indexOfScalar(u8, pair, '=') orelse pair.len;
        const raw_key = pair[0..eq];
        if (!std.mem.eql(u8, raw_key, key)) continue;
        const raw_value = if (eq < pair.len) pair[eq + 1 ..] else "";
        return try decodeQueryComponent(allocator, raw_value);
    }
    return null;
}

fn queryValues(allocator: std.mem.Allocator, query: []const u8, key: []const u8) ![]const []const u8 {
    var result = std.ArrayList([]const u8).empty;
    errdefer result.deinit(allocator);
    if (query.len == 0) return result.toOwnedSlice(allocator);
    var it = std.mem.splitScalar(u8, query, '&');
    while (it.next()) |pair| {
        if (pair.len == 0) continue;
        const eq = std.mem.indexOfScalar(u8, pair, '=') orelse pair.len;
        const raw_key = pair[0..eq];
        if (!std.mem.eql(u8, raw_key, key)) continue;
        const raw_value = if (eq < pair.len) pair[eq + 1 ..] else "";
        try result.append(allocator, try decodeQueryComponent(allocator, raw_value));
    }
    return result.toOwnedSlice(allocator);
}

fn decodeQueryComponent(allocator: std.mem.Allocator, raw: []const u8) ![]const u8 {
    const copy = try allocator.alloc(u8, raw.len);
    @memcpy(copy, raw);
    for (copy) |*byte| {
        if (byte.* == '+') byte.* = ' ';
    }
    return std.Uri.percentDecodeInPlace(copy);
}

fn parseDirection(text: []const u8) ?graph_sqlite.TraverseDirection {
    if (std.mem.eql(u8, text, "outbound")) return .outbound;
    if (std.mem.eql(u8, text, "inbound")) return .inbound;
    return null;
}

fn printUsage() !void {
    var stderr_file_writer = std.fs.File.stderr().writer(&.{});
    const stderr = &stderr_file_writer.interface;
    try stderr.writeAll(
        \\usage:
        \\  ghostcrab-backend [--addr <ip:port>] [--db <sqlite_path>] [--init-only]
        \\
        \\env:
        \\  GHOSTCRAB_BACKEND_ADDR   listen address (default :8091)
        \\  GHOSTCRAB_SQLITE_PATH    SQLite file path (default data/ghostcrab.sqlite)
        \\
        \\routes (POST):
        \\  POST /api/mindbrain/sql
        \\  POST /api/mindbrain/sql/session/open
        \\  POST /api/mindbrain/sql/session/query
        \\  POST /api/mindbrain/sql/session/close
        \\
        \\routes (GET):
        \\  GET  /health
        \\  GET  /api/mindbrain/search-compact-info
        \\  GET  /api/mindbrain/coverage?workspace_id=...
        \\  GET  /api/mindbrain/coverage-by-domain?domain_or_workspace=...
        \\  GET  /api/mindbrain/workspace-export?workspace_id=...
        \\  GET  /api/mindbrain/workspace-export-by-domain?domain_or_workspace=...
        \\  GET  /api/mindbrain/graph-path?source=...&target=...
        \\  GET  /api/mindbrain/traverse?start=...&direction=...&depth=...
        \\  GET  /api/mindbrain/pack?user_id=...&query=...&scope=...&limit=...
        \\
    );
}
