/// GhostCrab backend wrapper around the canonical MindBrain standalone HTTP app.
///
/// Runtime remains a single process named `ghostcrab-backend`; SQL, sessions,
/// writer serialization, and `/api/mindbrain/*` routes are owned by MindBrain.
const std = @import("std");
const mindbrain = @import("mindbrain");
const http_config = @import("http_server_config.zig");

const log = std.log.scoped(.ghostcrab_backend);

pub fn main(init: std.process.Init) !void {
    mindbrain.zig16_compat.setIo(init.io);

    const options = try http_config.resolveStartupOptions(
        try init.minimal.args.toSlice(init.arena.allocator()),
        init.environ_map.get("GHOSTCRAB_BACKEND_ADDR"),
        init.environ_map.get("GHOSTCRAB_SQLITE_PATH"),
        init.environ_map.get("GHOSTCRAB_STATIC_DIR"),
        init.environ_map.get("GHOSTCRAB_WORKSPACE_NAME"),
        init.environ_map.get("GHOSTCRAB_PID_FILE"),
        init.environ_map.get("GHOSTCRAB_BACKEND_MAX_BODY_BYTES"),
        init.environ_map.get("GHOSTCRAB_BACKEND_MAX_CONNS"),
        init.environ_map.get("GHOSTCRAB_BACKEND_SQLITE_BUSY_TIMEOUT_MS"),
        printUsage,
    );

    const workspace_label = if (std.mem.eql(u8, options.workspace_name, "default"))
        "GhostCrab Operating Model"
    else
        options.workspace_name;
    const workspace_description = if (std.mem.eql(u8, options.workspace_name, "default"))
        "Canonical GhostCrab ontology and operating model. Default bootstrap workspace; rows use workspace_id default."
    else
        options.workspace_name;

    log.info(
        "starting backend init: addr={s}, db={s}, max_body_bytes={d}, max_connections={d}",
        .{
            options.addr_text,
            options.db_path,
            options.max_body_bytes,
            options.max_connections,
        },
    );

    var app = mindbrain.http_app.MindbrainHttpApp.initWithOptions(init.gpa, init.io, .{
        .addr_text = options.addr_text,
        .db_path = options.db_path,
        .static_dir = options.static_dir,
        .init_only = options.init_only,
        .max_body_bytes = options.max_body_bytes,
        .max_connections = options.max_connections,
        .sqlite_busy_timeout_ms = options.sqlite_busy_timeout_ms,
        .service_name = "ghostcrab-backend",
        .warn_on_empty_graph = false,
        .enable_lab_routes = false,
        .default_workspace = .{
            .id = "default",
            .domain_profile_json = "{\"domain\":\"ghostcrab\"}",
            .label = workspace_label,
            .description = workspace_description,
        },
    }) catch |err| {
        log.err(
            "standalone HTTP init failed: addr={s}, sqlite={s}, error={s}",
            .{ options.addr_text, options.db_path, @errorName(err) },
        );
        return err;
    };
    defer app.deinit();

    log.info("sqlite ready at {s} (workspace: {s})", .{
        options.db_path,
        options.workspace_name,
    });

    if (options.pid_file) |pid_file| {
        try writePidFile(init.io, pid_file);
    }

    if (options.init_only) return;

    log.info("starting listener: addr={s}", .{options.addr_text});
    app.serve() catch |err| {
        log.err(
            "standalone HTTP serve failed: addr={s}, sqlite={s}, error={s}",
            .{ options.addr_text, options.db_path, @errorName(err) },
        );
        if (err == error.Unexpected) {
            log.err(
                "hint: a network syscall (socket/bind) was likely denied (EPERM/EACCES). " ++
                    "Run the backend OUTSIDE any seccomp/agent sandbox, or rebuild in debug " ++
                    "(pnpm run backend:build:debug) to surface the raw errno.",
                .{},
            );
        }
        return err;
    };
}

fn writePidFile(io: std.Io, pid_file: []const u8) !void {
    const pid = std.c.getpid();
    var buf: [32]u8 = undefined;
    const pid_str = try std.fmt.bufPrint(&buf, "{}\n", .{pid});
    try std.Io.Dir.cwd().writeFile(io, .{
        .sub_path = pid_file,
        .data = pid_str,
        .flags = .{ .truncate = true },
    });
    log.info("pid file: {s} (pid {})", .{ pid_file, pid });
}

fn printUsage() !void {
    var stderr = std.Io.File.stderr().writer(mindbrain.zig16_compat.io(), &.{});
    try stderr.interface.writeAll(
        \\Usage:
        \\  ghostcrab-backend [--addr <ip:port>] [--db <sqlite_path>] [--pid-file <path>] [--init-only]
        \\
        \\Environment:
        \\  GHOSTCRAB_BACKEND_ADDR           listen address (default :8091)
        \\  GHOSTCRAB_SQLITE_PATH            SQLite file path (default data/ghostcrab.sqlite)
        \\  GHOSTCRAB_STATIC_DIR             optional static asset directory
        \\  GHOSTCRAB_WORKSPACE_NAME         workspace label seed (default default)
        \\  GHOSTCRAB_PID_FILE               optional pid file
        \\  GHOSTCRAB_BACKEND_MAX_BODY_BYTES max HTTP body bytes
        \\  GHOSTCRAB_BACKEND_MAX_CONNS      max concurrent HTTP connections
        \\  GHOSTCRAB_BACKEND_SQLITE_BUSY_TIMEOUT_MS SQLite busy timeout in milliseconds (default 1000)
        \\
        \\Routes are provided by MindBrain:
        \\  POST /api/mindbrain/sql
        \\  POST /api/mindbrain/sql/session/open
        \\  POST /api/mindbrain/sql/session/query
        \\  POST /api/mindbrain/sql/session/close
        \\  GET  /api/mindbrain/sql/write-status
        \\  GET  /api/mindbrain/search-compact-info
        \\  GET  /api/mindbrain/coverage?workspace_id=...
        \\  GET  /api/mindbrain/coverage-by-domain?domain_or_workspace=...
        \\  GET  /api/mindbrain/workspace-export?workspace_id=...
        \\  GET  /api/mindbrain/workspace-export-by-domain?domain_or_workspace=...
        \\  GET  /api/mindbrain/graph-path?source=...&target=...
        \\  GET  /api/mindbrain/traverse?start=...&direction=...&depth=...
        \\  GET  /api/mindbrain/pack?user_id=...&query=...&scope=...&limit=...
        \\  GET  /api/mindbrain/ghostcrab/pack-projections?agent_id=...&query=...&scope=...&limit=...
        \\  POST /api/mindbrain/ghostcrab/artifact
        \\  GET  /api/mindbrain/ghostcrab/artifact/{artifact_id}
        \\  POST /api/mindbrain/ghostcrab/artifact/{artifact_id}/refresh
        \\  GET  /api/mindbrain/ghostcrab/artifact/{artifact_id}/events
        \\
    );
    try stderr.interface.flush();
}
