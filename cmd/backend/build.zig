const std = @import("std");

/// GhostCrab backend build.
///
/// Prerequisites:
///   1. Run `scripts/ensure-vendor.sh` (or `make backend-vendor`) to set up
///      vendor/mindbrain and vendor/ztoon symlinks.
///   2. Run `make sqlite3-download` (or `scripts/download-sqlite3.sh`) to
///      place the sqlite3 amalgamation in `deps/sqlite3/`.
///
/// Build:  `zig build -Doptimize=ReleaseFast`
/// Cross:  `zig build -Doptimize=ReleaseFast -Dtarget=aarch64-linux-gnu`
///
/// The binary is self-contained: sqlite3 is compiled in from the amalgamation.
/// No system libsqlite3 required — this enables reproducible cross-compilation.
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const neon = b.option(
        NeonMode,
        "neon",
        "ARM NEON support: auto (off on aarch64 until CRoaring 4.7.0 verified on M1), on, off",
    ) orelse .auto;

    const ztoon_mod = b.createModule(.{
        .root_source_file = b.path("../../vendor/ztoon/src/lib.zig"),
        .target = target,
        .optimize = optimize,
    });

    const mindbrain_mod = b.createModule(.{
        .root_source_file = b.path("../../vendor/mindbrain/src/standalone/lib.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    // Bundle sqlite3 amalgamation — no system libsqlite3 dependency.
    configureSqlite3(mindbrain_mod);
    configureCroaring(b, mindbrain_mod, target, neon);
    mindbrain_mod.addImport("ztoon", ztoon_mod);

    const http_mod = b.createModule(.{
        .root_source_file = b.path("http_server.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    http_mod.addImport("mindbrain", mindbrain_mod);

    const backend = b.addExecutable(.{
        .name = "ghostcrab-backend",
        .root_module = http_mod,
    });

    const install_backend = b.addInstallArtifact(backend, .{});
    const backend_step = b.step("backend", "Build the GhostCrab backend (MindBrain standalone HTTP)");
    backend_step.dependOn(&install_backend.step);

    b.getInstallStep().dependOn(&install_backend.step);

    // Corpus / document CLI (same SQLite amalgamation as the backend — no system libsqlite3).
    const benchmark_mod = b.createModule(.{
        .root_source_file = b.path("../../vendor/mindbrain/src/benchmark/lib.zig"),
        .target = target,
        .optimize = optimize,
    });
    benchmark_mod.addImport("mindbrain", mindbrain_mod);

    const document_tool_mod = b.createModule(.{
        .root_source_file = b.path("../../vendor/mindbrain/src/standalone/tool.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    document_tool_mod.addImport("mindbrain", mindbrain_mod);
    document_tool_mod.addImport("benchmark", benchmark_mod);

    const document_tool = b.addExecutable(.{
        .name = "ghostcrab-document",
        .root_module = document_tool_mod,
    });

    const install_document_tool = b.addInstallArtifact(document_tool, .{});
    const document_tool_step = b.step("document-tool", "Build ghostcrab-document (import/normalize/profile corpus CLI)");
    document_tool_step.dependOn(&install_document_tool.step);
}

/// Add the sqlite3 amalgamation (deps/sqlite3/) to the module.
/// This replaces linkSystemLibrary("sqlite3") and enables cross-compilation.
/// Run `make sqlite3-download` before building to populate deps/sqlite3/.
fn configureSqlite3(module: *std.Build.Module) void {
    module.addIncludePath(.{ .cwd_relative = "deps/sqlite3" });
    module.addCSourceFile(.{
        .file = .{ .cwd_relative = "deps/sqlite3/sqlite3.c" },
        .flags = &.{
            "-DSQLITE_THREADSAFE=2",
            "-DSQLITE_DEFAULT_WAL_SYNCHRONOUS=1",
            "-DSQLITE_DQS=0",
            "-DSQLITE_DEFAULT_MEMSTATUS=0",
            "-DSQLITE_OMIT_DEPRECATED",
            // Required by the standalone schema (search_fts virtual table)
            // and by the BM25 path that replaced RoaringBitmap on 2026-05-08.
            // Without this, `CREATE VIRTUAL TABLE ... USING fts5(...)` fails
            // with `no such module: fts5` and the backend exits at init.
            "-DSQLITE_ENABLE_FTS5",
        },
    });
}

const NeonMode = enum { auto, on, off };

fn configureCroaring(
    b: *std.Build,
    module: *std.Build.Module,
    target: std.Build.ResolvedTarget,
    neon: NeonMode,
) void {
    const disable_neon = switch (neon) {
        .off => true,
        .on => false,
        // aarch64: keep NEON disabled until CRoaring 4.7.0 is verified on M1.
        .auto => target.result.cpu.arch == .aarch64,
    };

    module.addCSourceFile(.{
        .file = b.path("../../vendor/mindbrain/deps/croaring/roaring.c"),
        .flags = if (disable_neon)
            &.{"-DDISABLENEON=1"}
        else
            &.{},
    });
}
