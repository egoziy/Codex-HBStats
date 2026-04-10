import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execSync, exec } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'fs';
import path from 'path';

function findPgTool(name: string): string {
  // Common PostgreSQL install paths on Windows
  const candidates = [
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\15\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\14\\bin\\${name}.exe`,
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${name}.exe`,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return `"${p}"`;
  }
  // Fallback: try PATH
  return name;
}

function parseDatabaseUrl(): { host: string; port: string; user: string; password: string; db: string } {
  const url = process.env.DATABASE_URL || '';
  const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!m) throw new Error('Cannot parse DATABASE_URL');
  return { user: m[1], password: m[2], host: m[3], port: m[4], db: m[5] };
}

// GET — export (download) the entire database as SQL dump
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = parseDatabaseUrl();
    const pgDump = findPgTool('pg_dump');
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `hbs_backup_${timestamp}.dump`;
    const filepath = path.join(tmpDir, filename);

    // Use custom format (-Fc) for compression (~7x smaller)
    const cmd = `${pgDump} -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} --no-owner --no-privileges -Fc -f "${filepath}"`;

    execSync(cmd, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 300000, // 5 minutes
      env: { ...process.env, PGPASSWORD: db.password },
    });

    const stats = statSync(filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

    // Read and return as download
    const fileBuffer = readFileSync(filepath);
    unlinkSync(filepath); // Clean up

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-File-Size': `${sizeMB}MB`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}

// POST — import (restore) a SQL dump into the database
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

    // Detect format: custom format starts with "PGDMP", SQL starts with text
    const header = buffer.slice(0, 10).toString('utf-8');
    const isCustomFormat = header.startsWith('PGDMP');
    const isSql = !isCustomFormat && (buffer.slice(0, 200).toString('utf-8').includes('PostgreSQL') || buffer.slice(0, 200).toString('utf-8').includes('SET '));

    if (!isCustomFormat && !isSql) {
      return NextResponse.json({ error: 'File does not appear to be a PostgreSQL dump (.dump or .sql)' }, { status: 400 });
    }

    const db = parseDatabaseUrl();
    const psql = findPgTool('psql');
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const ext = isCustomFormat ? '.dump' : '.sql';
    const filepath = path.join(tmpDir, `import_temp${ext}`);
    writeFileSync(filepath, buffer);

    // Step 1: Drop all tables in public schema to avoid conflicts with old schema
    try {
      const dropCmd = `${psql} -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} -c "DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;"`;
      execSync(dropCmd, {
        timeout: 30000,
        env: { ...process.env, PGPASSWORD: db.password },
      });
    } catch (_) { /* OK if it fails — tables might not exist */ }

    // Step 2: Restore
    const tool = isCustomFormat ? findPgTool('pg_restore') : psql;
    const cmd = isCustomFormat
      ? `${tool} -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} --no-owner --no-privileges "${filepath}"`
      : `${tool} -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.db} -f "${filepath}"`;

    return new Promise<NextResponse>((resolve) => {
      exec(cmd, {
        maxBuffer: 500 * 1024 * 1024,
        timeout: 600000, // 10 minutes
        env: { ...process.env, PGPASSWORD: db.password },
      }, (error, stdout, stderr) => {
        // Clean up temp file
        try { unlinkSync(filepath); } catch (_) {}

        // pg_restore returns exit code 1 even on success (with warnings)
        const fatalErrors = (stderr?.match(/FATAL/gi) || []).length;
        if (fatalErrors > 0) {
          resolve(NextResponse.json({ error: 'Import failed: ' + (stderr?.slice(0, 500) || error?.message) }, { status: 500 }));
          return;
        }

        resolve(NextResponse.json({
          success: true,
          message: `ייבוא הושלם (${sizeMB}MB, ${isCustomFormat ? 'compressed' : 'SQL'})`,
          format: isCustomFormat ? 'custom' : 'sql',
          fileSize: `${sizeMB}MB`,
        }));
      });
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
}
